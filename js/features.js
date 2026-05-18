import { appState } from './state.js';

const isMobile      = () => window.innerWidth <= 768;
const isSmallMobile = () => window.innerWidth <= 480;

// ── Audio Assets ──────────────────────────────────────────
export const ding            = new Audio('sound/ding.mp3');
export const thunderSound    = new Audio('sound/thunder.mp3');

export const lightRainSound  = new Audio('sound/light-rain.mp3');
lightRainSound.loop = true;

export const heavyRainSound  = new Audio('sound/heavy-rain.mp3');
heavyRainSound.loop = true;

export const windSound       = new Audio('sound/wind.mp3');
windSound.loop = true;

export const birdsSound      = new Audio('sound/bird.mp3');
birdsSound.loop = true;

export const cricketsSound   = new Audio('sound/crickets.mp3');
cricketsSound.loop = true;

// Small pools so rapid-fire sounds don't stutter over each other
const dropPool = Array.from({ length: 5 }, () => new Audio('sound/water-drop.mp3'));
const icePool  = Array.from({ length: 5 }, () => new Audio('sound/floraphonic-foot-step-snow-12-189872.mp3'));
let dropIdx = 0;
let iceIdx  = 0;

// ── Clock ─────────────────────────────────────────────────
// Cache the element so we're not querying the DOM every second
let _clockEl = null;

export function updateClock() {
    if (!_clockEl) _clockEl = document.getElementById('live-time');
    if (!_clockEl) return;
    const now     = new Date();
    const options = {
        weekday: 'short', year: 'numeric', month: 'short',
        day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    };
    _clockEl.innerText = now.toLocaleDateString('en-US', options);
}

// ── Ambient Sound Manager ─────────────────────────────────
// Stops everything first, then plays what fits the current conditions
export function applyAmbientSounds() {
    lightRainSound.pause();
    heavyRainSound.pause();
    windSound.pause();
    birdsSound.pause();
    cricketsSound.pause();

    if (!appState.soundEnabled) return;

    const { isRaining, isSnowing, isHeavy, wind, isPleasant } = appState.conditions;
    const isDayTime = appState.cache?.current ? (appState.cache.current.is_day == 1) : true;

    if (isSnowing) {
        windSound.volume = isHeavy ? 0.3 : 0.15;
        windSound.play().catch(() => {});
    } else if (isRaining) {
        if (isHeavy) {
            heavyRainSound.volume = 1.0;
            heavyRainSound.play().catch(() => {});
            if (wind > 15) {
                windSound.volume = 0.2;
                windSound.play().catch(() => {});
            }
        } else {
            lightRainSound.volume = 1.0;
            lightRainSound.play().catch(() => {});
            if (wind > 15) {
                windSound.volume = 0.02;
                windSound.play().catch(() => {});
            }
        }
    } else if (wind > 15) {
        windSound.volume = 0.25;
        windSound.play().catch(() => {});
    }

    // Birds during the day, crickets at night
    if (isDayTime) {
        if (isPleasant && !isRaining && !isSnowing) {
            birdsSound.volume = 1.0;
            birdsSound.play().catch(() => {});
        }
    } else {
        if (!isHeavy) {
            cricketsSound.volume = 0.8;
            cricketsSound.play().catch(() => {});
        }
    }
}

// ── Lightning Strike ──────────────────────────────────────
export function triggerLightningStrike() {
    if (appState.soundEnabled) {
        thunderSound.currentTime = 0;
        thunderSound.play().catch(() => {});
    }

    const lightningBg = document.getElementById('lightning-flash');
    if (lightningBg) {
        lightningBg.classList.remove('flash-active');
        void lightningBg.offsetWidth;
        lightningBg.classList.add('flash-active');
    }

    const stage = document.getElementById('weather-stage');
    if (!stage) return;

    const bolt       = document.createElement('div');
    bolt.className   = 'lightning-bolt';
    bolt.style.left  = (Math.random() * 70 + 10) + 'vw';
    bolt.style.transform = Math.random() > 0.5 ? 'scaleX(-1)' : 'scaleX(1)';

    bolt.innerHTML = `
        <svg viewBox="0 0 200 1000" preserveAspectRatio="none" style="width:100%;height:100%;">
            <path d="M100,0 L85,150 L105,180 L75,350 L95,380 L55,600 L80,620 L25,900
                     M75,350 L125,500 L110,520 L145,750
                     M85,150 L50,250 L65,270 L20,400"
                  fill="none" stroke="rgba(255,255,255,1)" stroke-width="3"
                  filter="drop-shadow(0 0 8px white) drop-shadow(0 0 20px var(--primary))"/>
        </svg>`;
    stage.appendChild(bolt);

    setTimeout(() => { if (bolt.parentNode) bolt.remove(); }, 500);
    appState.stormTimeout = setTimeout(triggerLightningStrike, Math.random() * 7000 + 3000);
}

// ── Micro Sound Effects ───────────────────────────────────
export function playMicroSound(type) {
    if (!appState.soundEnabled) return;
    if (type === 'drop') {
        dropPool[dropIdx].currentTime = 0;
        dropPool[dropIdx].play().catch(() => {});
        dropIdx = (dropIdx + 1) % dropPool.length;
    } else if (type === 'ice') {
        icePool[iceIdx].currentTime = 0;
        icePool[iceIdx].play().catch(() => {});
        iceIdx = (iceIdx + 1) % icePool.length;
    }
}

// ── Click Ripple Effects ──────────────────────────────────
// Skip on very small screens — not worth the paint cost
export function createClickEffect(x, y, type) {
    if (isSmallMobile()) return;
    const effect     = document.createElement('div');
    effect.className = type === 'ice' ? 'ice-crystal' : 'water-drop';
    effect.style.left = x + 'px';
    effect.style.top  = y + 'px';
    document.body.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

// ── Physics Canvas ────────────────────────────────────────
// Interactive rain drops and ice crystals rendered on the main weather card.
// Users can wipe the card to scatter the particles.

let animFrameId    = null;
let physicsObjects = [];

// Track the current wipe function so we can properly remove it on re-render
// (prevents stacking multiple touchmove listeners across city searches)
let _prevWipeFn    = null;

// Store the inner render loop so we can restart it when the tab becomes visible
let _renderPhysicsFn = null;

// Pause physics when the user switches tabs — no point burning CPU in the background
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    } else if (_renderPhysicsFn && physicsObjects.length > 0 && !animFrameId) {
        animFrameId = requestAnimationFrame(_renderPhysicsFn);
    }
});

function handleInteractiveCanvas(isSnowing, isRaining, isHeavy) {
    const card   = document.getElementById('main-card');
    const canvas = document.getElementById('fog-canvas');
    if (!card || !canvas) return;

    const ctx = canvas.getContext('2d');
    cancelAnimationFrame(animFrameId);
    animFrameId      = null;
    physicsObjects   = [];
    _renderPhysicsFn = null;

    if (!isSnowing && !isRaining) {
        canvas.style.opacity = '0';
        card.onmousemove = null;
        if (_prevWipeFn) {
            card.removeEventListener('touchmove', _prevWipeFn);
            _prevWipeFn = null;
        }
        return;
    }

    // Scale canvas to device pixel ratio so it looks sharp on retina/HiDPI screens
    const DPR    = Math.min(window.devicePixelRatio || 1, 2);
    const logicW = card.offsetWidth;
    const logicH = card.offsetHeight;

    canvas.width        = Math.round(logicW * DPR);
    canvas.height       = Math.round(logicH * DPR);
    canvas.style.width  = logicW + 'px';
    canvas.style.height = logicH + 'px';
    canvas.style.opacity = '1';
    ctx.scale(DPR, DPR);

    const mobile      = isMobile();
    const smallMobile = isSmallMobile();

    if (isSnowing) {
        // Large interactive ice crystals
        const crystalCount = smallMobile ? (isHeavy ? 5 : 3)
                           : mobile      ? (isHeavy ? 10 : 5)
                           :               (isHeavy ? 25 : 12);
        for (let i = 0; i < crystalCount; i++) {
            physicsObjects.push({
                type: 'crystal',
                x: Math.random() * logicW,
                y: Math.random() * logicH,
                size: Math.random() * 12 + 10,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.15,
                vy: 0, isFalling: false, hasPlayedSound: false,
            });
        }

        // Small background snow particles
        const snowCount = smallMobile ? (isHeavy ? 20 : 6)
                        : mobile      ? (isHeavy ? 40 : 12)
                        :               (isHeavy ? 120 : 30);
        for (let i = 0; i < snowCount; i++) {
            const size   = Math.random() * 4 + 2;
            const numPts = Math.floor(Math.random() * 3) + 4;
            const points = [];
            for (let j = 0; j < numPts; j++) {
                const angle = (j / numPts) * Math.PI * 2;
                const r     = size * (0.5 + Math.random() * 0.7);
                points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
            }
            physicsObjects.push({
                type: 'littlesnow',
                x: Math.random() * logicW,
                y: Math.random() * logicH,
                size, points,
                vy: 0, isFalling: false, hasPlayedSound: false,
            });
        }

        // Frozen corner chunks
        const corners = [
            { x: 0,      y: 0,      signX:  1, signY:  1 },
            { x: logicW, y: 0,      signX: -1, signY:  1 },
            { x: 0,      y: logicH, signX:  1, signY: -1 },
            { x: logicW, y: logicH, signX: -1, signY: -1 },
        ];
        corners.forEach(c => {
            const chunkCount = smallMobile ? (isHeavy ? 2 : 1)
                             : mobile      ? (isHeavy ? 4 : 2)
                             :               (isHeavy ? 9 : 4);
            for (let i = 0; i < chunkCount; i++) {
                const numSpikes = Math.floor(Math.random() * 4) + 5;
                const baseSize  = isHeavy ? (Math.random() * 25 + 15) : (Math.random() * 12 + 10);
                const spikes    = [];
                for (let j = 0; j < numSpikes; j++) {
                    const angle = (j / numSpikes) * Math.PI * 2;
                    const r     = baseSize * (0.5 + Math.random() * 0.5);
                    spikes.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
                }
                const spreadX = isHeavy ? (Math.random() * logicW * 0.22) : (Math.random() * 30);
                const spreadY = isHeavy ? (Math.random() * logicH * 0.22) : (Math.random() * 30);
                physicsObjects.push({
                    type: 'frozen-corner',
                    x: c.x + spreadX * c.signX,
                    y: c.y + spreadY * c.signY,
                    size: baseSize, spikes,
                    rot: Math.random() * Math.PI * 2,
                    vy: 0, isFalling: false, hasPlayedSound: false,
                });
            }
        });

    } else if (isRaining) {
        const dropCount = smallMobile ? (isHeavy ? 15 : 8)
                        : mobile      ? (isHeavy ? 30 : 15)
                        :               (isHeavy ? 80 : 40);
        for (let i = 0; i < dropCount; i++) {
            const sizeBase = Math.random() * 14 + 3;
            physicsObjects.push({
                type: 'drop',
                x: Math.random() * logicW,
                y: Math.random() * logicH,
                rX: sizeBase,
                rY: sizeBase * (1.0 + Math.random() * 0.2),
                vy: 0, isFalling: false, hasPlayedSound: false,
            });
        }
    }

    enableWiping(card, canvas, logicW, logicH, isSnowing);

    function renderPhysics() {
        ctx.clearRect(0, 0, logicW, logicH);

        physicsObjects.forEach(obj => {
            if (obj.isFalling) {
                obj.y  += obj.vy;
                obj.vy += 0.8;
                if (obj.type === 'crystal') obj.rot += obj.rotSpeed;

                if (obj.y >= logicH && !obj.hasPlayedSound) {
                    obj.hasPlayedSound = true;
                    if (appState.soundEnabled) {
                        if (isSnowing) {
                            const sfx = icePool[iceIdx];
                            sfx.currentTime = 0;
                            sfx.volume      = 0.5 + Math.random() * 0.3;
                            sfx.playbackRate = 0.9 + Math.random() * 0.2;
                            sfx.play().catch(() => {});
                            iceIdx = (iceIdx + 1) % icePool.length;
                        } else {
                            const sfx = dropPool[dropIdx];
                            sfx.currentTime = 0;
                            sfx.volume      = 0.6 + Math.random() * 0.3;
                            sfx.playbackRate = 0.9 + Math.random() * 0.2;
                            sfx.play().catch(() => {});
                            dropIdx = (dropIdx + 1) % dropPool.length;
                        }
                    }
                }
            }

            // Draw each physics object type
            if (obj.type === 'drop') {
                const grad = ctx.createRadialGradient(
                    obj.x - obj.rX / 4, obj.y - obj.rY / 4, obj.rX / 5,
                    obj.x, obj.y, obj.rY
                );
                grad.addColorStop(0,   'rgba(255, 255, 255, 0.95)');
                grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.10)');
                grad.addColorStop(0.8, 'rgba(0, 30, 60, 0.25)');
                grad.addColorStop(1,   'rgba(0, 0, 0, 0.55)');
                ctx.beginPath();
                ctx.ellipse(obj.x, obj.y, obj.rX, obj.rY, 0, 0, Math.PI * 2);
                ctx.fillStyle    = grad;
                ctx.shadowColor  = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur   = 4;
                ctx.shadowOffsetY = 2;
                ctx.fill();
                ctx.beginPath();
                ctx.shadowColor = 'transparent';
                ctx.ellipse(obj.x - obj.rX / 2.5, obj.y - obj.rY / 2.5, obj.rX / 4, obj.rY / 4, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.fill();

            } else if (obj.type === 'frozen-corner') {
                ctx.save();
                ctx.translate(obj.x, obj.y);
                ctx.rotate(obj.rot);
                ctx.beginPath();
                ctx.moveTo(obj.spikes[0].x, obj.spikes[0].y);
                for (let j = 1; j < obj.spikes.length; j++) {
                    ctx.lineTo(obj.spikes[j].x, obj.spikes[j].y);
                }
                ctx.closePath();
                ctx.fillStyle   = 'rgba(240, 248, 255, 0.85)';
                ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                ctx.shadowBlur  = 10;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(0, 0, obj.size * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.fill();
                ctx.restore();

            } else if (obj.type === 'crystal') {
                ctx.save();
                ctx.translate(obj.x, obj.y);
                ctx.rotate(obj.rot);
                ctx.beginPath();
                for (let j = 0; j < 6; j++) {
                    ctx.moveTo(0, 0); ctx.lineTo(obj.size, 0);
                    ctx.moveTo(obj.size * 0.4, 0);
                    ctx.lineTo(obj.size * 0.4 + obj.size * 0.25 * Math.cos(Math.PI / 3),  obj.size * 0.25 * Math.sin(Math.PI / 3));
                    ctx.moveTo(obj.size * 0.4, 0);
                    ctx.lineTo(obj.size * 0.4 + obj.size * 0.25 * Math.cos(-Math.PI / 3), obj.size * 0.25 * Math.sin(-Math.PI / 3));
                    ctx.moveTo(obj.size * 0.7, 0);
                    ctx.lineTo(obj.size * 0.7 + obj.size * 0.2 * Math.cos(Math.PI / 3),  obj.size * 0.2 * Math.sin(Math.PI / 3));
                    ctx.moveTo(obj.size * 0.7, 0);
                    ctx.lineTo(obj.size * 0.7 + obj.size * 0.2 * Math.cos(-Math.PI / 3), obj.size * 0.2 * Math.sin(-Math.PI / 3));
                    ctx.rotate((Math.PI * 2) / 6);
                }
                ctx.shadowColor  = 'rgba(0, 0, 0, 0.2)';
                ctx.shadowBlur   = 3;
                ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
                ctx.strokeStyle  = 'rgba(255, 255, 255, 0.9)';
                ctx.lineWidth    = obj.size / 12;
                ctx.lineCap      = 'round';
                ctx.stroke();
                ctx.beginPath();
                for (let j = 0; j < 6; j++) {
                    ctx.lineTo(
                        obj.size * 0.15 * Math.cos(j * Math.PI / 3),
                        obj.size * 0.15 * Math.sin(j * Math.PI / 3)
                    );
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.fill();
                ctx.restore();

            } else if (obj.type === 'littlesnow') {
                ctx.save();
                ctx.translate(obj.x, obj.y);
                ctx.beginPath();
                ctx.moveTo(obj.points[0].x, obj.points[0].y);
                for (let j = 1; j < obj.points.length; j++) {
                    ctx.lineTo(obj.points[j].x, obj.points[j].y);
                }
                ctx.closePath();
                const grad = ctx.createRadialGradient(
                    -obj.size / 4, -obj.size / 4, obj.size / 6,
                    0, 0, obj.size
                );
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0.40)');
                ctx.fillStyle   = grad;
                ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
                ctx.shadowBlur  = 4;
                ctx.fill();
                ctx.restore();
            }
        });

        // Clean up particles that have fully fallen off screen.
        // Without this, the array grows unboundedly across wipe interactions.
        physicsObjects = physicsObjects.filter(o => !(o.isFalling && o.y > logicH + 120));

        animFrameId = requestAnimationFrame(renderPhysics);
    }

    _renderPhysicsFn = renderPhysics;
    renderPhysics();
}

// Wipe interaction — mouse or touch on the card scatters nearby particles
function enableWiping(card, canvas, logicW, logicH, isSnowing) {
    // Remove the previous touchmove listener before adding a new one.
    // Using addEventListener without cleanup stacks up listeners on every
    // city search, which is a memory and CPU leak.
    if (_prevWipeFn) {
        card.removeEventListener('touchmove', _prevWipeFn);
        _prevWipeFn = null;
    }

    const wipe = (e) => {
        const rect    = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const x       = clientX - rect.left;
        const y       = clientY - rect.top;

        const newShards = [];

        physicsObjects.forEach(obj => {
            if (!obj.isFalling && Math.hypot(obj.x - x, obj.y - y) < 70) {
                if (obj.type === 'frozen-corner') {
                    obj.type      = 'crystal';
                    obj.isFalling = true;
                    obj.vy        = Math.random() * 2 + 1;
                    obj.rotSpeed  = (Math.random() - 0.5) * 0.3;
                    newShards.push({
                        type: 'crystal',
                        x: obj.x + (Math.random() * 20 - 10),
                        y: obj.y + (Math.random() * 20 - 10),
                        size: obj.size * (0.4 + Math.random() * 0.3),
                        rot: Math.random() * Math.PI * 2,
                        rotSpeed: (Math.random() - 0.5) * 0.4,
                        vy: Math.random() * 3 + 1,
                        isFalling: true, hasPlayedSound: false,
                    });
                } else {
                    obj.isFalling = true;
                    obj.vy        = Math.random() * 3 + 2;
                }
            }
        });

        if (newShards.length > 0) physicsObjects.push(...newShards);
    };

    card.onmousemove = wipe;
    // passive: true is critical here — it tells the browser this handler
    // won't call preventDefault(), allowing scroll to stay smooth on mobile
    card.addEventListener('touchmove', wipe, { passive: true });
    _prevWipeFn = wipe;
}

// ── Main Animation Manager ────────────────────────────────
// Called after every weather fetch. Reads conditions and drives
// themes, particles, weather messages, and lightning.
export function manageAnimations(data) {
    const stage  = document.getElementById('weather-stage');
    const body   = document.body;
    const msgBox = document.getElementById('weather-msg');

    if (stage) stage.innerHTML = '';
    body.className = '';

    if (appState.stormTimeout) clearTimeout(appState.stormTimeout);

    const cond      = data.current.condition.text.toLowerCase();
    const temp      = data.current.temp_c;
    const wind      = data.current.wind_kph;
    const clouds    = data.current.cloud;
    const precip    = data.current.precip_mm;
    const aqi       = data.current.air_quality ? data.current.air_quality.pm2_5 : 50;
    const isDayTime = (data.current.is_day == 1);

    const isSnowing   = cond.includes('snow') || cond.includes('blizzard') || cond.includes('ice') || cond.includes('pellets');
    const isRaining   = !isSnowing && (cond.includes('rain') || cond.includes('drizzle') || precip > 0);
    const isHeavy     = cond.includes('heavy') || cond.includes('extreme') || cond.includes('moderate') || cond.includes('thunder');
    const isThunder   = cond.includes('thunder');
    const isPleasant  = !isRaining && !isSnowing && !isThunder && temp >= 15 && temp <= 30 && wind <= 25;
    const isStargazer = !isDayTime && clouds < 20 && aqi < 20 && !isRaining && !isSnowing;

    // Save conditions so the sound manager can read them
    appState.conditions = { isRaining, isSnowing, isHeavy, wind, isPleasant };

    applyAmbientSounds();
    handleInteractiveCanvas(isSnowing, isRaining, isHeavy);

    if (isThunder || (isRaining && isHeavy)) {
        appState.stormTimeout = setTimeout(triggerLightningStrike, 1500);
    }

    // Pick weather theme
    if (isStargazer)                          body.classList.add('stargazer');
    else if (isThunder)                       body.classList.add('stormy-dark');
    else if (temp >= 40 && isDayTime)         body.classList.add('sunny-extreme');
    else if (!isDayTime && !isSnowing && !isRaining) body.classList.add('night');
    else if (isSnowing)                       body.classList.add('snowy');
    else if (isRaining)                       body.classList.add('rainy');
    else if (!isDayTime)                      body.classList.add('night');
    else if (clouds > 50)                     body.classList.add('cloudy');
    else                                      body.classList.add('sunny');

    updateThemeColor(body.className);

    // Contextual weather message
    if (msgBox) {
        let msgText  = '';
        let msgClass = '';
        if (isStargazer)                 { msgText = '🔭 Perfect stargazing tonight! Air is clear, skies are open. Look up.';          msgClass = 'msg-pleasant'; }
        else if (temp >= 40)             { msgText = '🔥 Scorching heat. Asphalt will be too hot for pets after 11 AM.';               msgClass = 'msg-warning';  }
        else if (temp <= -10)            { msgText = '🥶 Dangerously cold. A great excuse to stay under a heavy blanket.';             msgClass = 'msg-warning';  }
        else if (wind >= 50)             { msgText = '💨 Severe howling winds. Secure your outdoor plants and stay inside.';          msgClass = 'msg-warning';  }
        else if (isHeavy && isSnowing)   { msgText = '🌨️ Heavy snowfall. Cancel your driving plans and make hot chocolate.';           msgClass = 'msg-warning';  }
        else if ((isHeavy && isRaining) || isThunder) { msgText = '⛈️ Thunderstorms. Perfect weather to brew dark coffee and read.'; msgClass = 'msg-warning';  }
        else if (isSnowing)              { msgText = '❄️ Light snow falling. Break the ice off the screen with a swipe!';             msgClass = 'msg-info';     }
        else if (isRaining)              { msgText = '☂️ Steady rain. Don\'t forget to wipe the water drops off the card!';           msgClass = 'msg-info';     }
        else if (!isDayTime && !isHeavy) { msgText = '🌙 Peaceful night. Listen to the crickets and relax.';                         msgClass = 'msg-pleasant'; }
        else if (wind > 25)              { msgText = '🪁 Quite breezy! Great weather for flying a kite or a brisk walk.';            msgClass = 'msg-info';     }
        else if (temp >= 30)             { msgText = '😎 Beautifully hot. Excellent beach or pool day ahead.';                        msgClass = 'msg-pleasant'; }
        else if (isPleasant)             { msgText = '✨ The vibe is absolutely perfect today. You should be outside!';               msgClass = 'msg-pleasant'; }
        else if (temp > 0 && temp < 15)  { msgText = '🧣 Crisp, chilly air. Grab your favorite sweater or light jacket.';           msgClass = 'msg-pleasant'; }
        else                             { msgText = '🧊 Freezing outside. Wrap up warm if you venture out.';                        msgClass = 'msg-info';     }
        msgBox.innerText     = msgText;
        msgBox.className     = 'weather-msg ' + msgClass;
        msgBox.style.display = 'block';
    }

    if (!stage) return;

    const mobile      = isMobile();
    const smallMobile = isSmallMobile();

    // Shooting stars (stargazer mode)
    if (isStargazer) {
        const starCount = smallMobile ? 2 : mobile ? 3 : 6;
        for (let i = 0; i < starCount; i++) {
            const star          = document.createElement('div');
            star.className      = 'shooting-star';
            star.style.top      = (Math.random() * 40) + 'vh';
            star.style.left     = (Math.random() * 80 + 20) + 'vw';
            star.style.animationDuration = (Math.random() * 2 + 2) + 's';
            star.style.animationDelay    = (Math.random() * 8) + 's';
            stage.appendChild(star);
        }

    } else if (isSnowing) {
        const rawCount  = isHeavy ? 100 : 40;
        const count     = smallMobile ? Math.floor(rawCount / 5) : mobile ? Math.floor(rawCount / 2.5) : rawCount;
        const speedMult = isHeavy ? 0.5 : 1;
        const sizeMult  = isHeavy ? 2 : 1;
        for (let i = 0; i < count; i++) {
            const flake          = document.createElement('div');
            flake.className      = 'snowflake';
            flake.style.left     = Math.random() * 100 + 'vw';
            const size           = (Math.random() * 5 + 3) * sizeMult;
            flake.style.width    = flake.style.height = size + 'px';
            flake.style.animationDuration = (Math.random() * 3 + 3) * speedMult + 's';
            flake.style.animationDelay    = Math.random() * 5 + 's';
            stage.appendChild(flake);
        }

    } else if (isRaining) {
        const rawCount = isHeavy ? 80 : 30;
        const count    = smallMobile ? Math.floor(rawCount / 5) : mobile ? Math.floor(rawCount / 2.5) : rawCount;
        const speed    = isHeavy ? 0.3 : 0.7;
        for (let i = 0; i < count; i++) {
            const drop          = document.createElement('div');
            drop.className      = isHeavy ? 'rain-drop tilted' : 'rain-drop';
            drop.style.left     = (Math.random() * 120 - 10) + 'vw';
            drop.style.width    = isHeavy ? '3px' : '1.5px';
            drop.style.height   = isHeavy ? '35px' : '15px';
            drop.style.animationDuration = (Math.random() * 0.2 + speed) + 's';
            drop.style.animationDelay    = Math.random() * 2 + 's';
            stage.appendChild(drop);
        }
    }

    // Wind lines
    if (wind > 10) {
        const rawCount = wind > 40 ? 40 : wind > 25 ? 25 : wind > 20 ? 8 : 3;
        const count    = smallMobile ? Math.max(1, Math.floor(rawCount / 4))
                       : mobile      ? Math.max(1, Math.floor(rawCount / 2))
                       : rawCount;
        const speed    = wind > 40 ? 0.4 : wind > 25 ? 0.8 : wind > 20 ? 1.5 : 3;
        for (let i = 0; i < count; i++) {
            const wLine               = document.createElement('div');
            wLine.className           = 'wind-line';
            wLine.style.top           = Math.random() * 100 + 'vh';
            wLine.style.width         = (Math.random() * 100 + 50) + 'px';
            wLine.style.animationDuration = (Math.random() * 0.5 + speed) + 's';
            wLine.style.animationDelay    = Math.random() * 3 + 's';
            stage.appendChild(wLine);
        }
    }

    // Cloud particles
    if (clouds > 15 && !isStargazer) {
        const rawCount = clouds > 70 ? 8 : 4;
        const count    = smallMobile ? Math.max(1, Math.floor(rawCount / 4))
                       : mobile      ? Math.max(2, Math.floor(rawCount / 2))
                       : rawCount;
        for (let i = 0; i < count; i++) {
            const cloud          = document.createElement('div');
            cloud.className      = 'cloud-bit';
            cloud.style.left     = Math.random() * 100 + 'vw';
            cloud.style.top      = Math.random() * 60 + 'vh';
            const size           = Math.random() * 200 + 100;
            cloud.style.width    = (size * 1.5) + 'px';
            cloud.style.height   = size + 'px';
            cloud.style.animationDuration = (Math.random() * 20 + 30) + 's';
            stage.appendChild(cloud);
        }
    }
}

// Update the browser chrome color to match the current weather theme
function updateThemeColor(bodyClass) {
    let color = '#0f0c29';
    if      (bodyClass.includes('sunny-extreme')) color = '#ff416c';
    else if (bodyClass.includes('stormy-dark'))   color = '#020205';
    else if (bodyClass.includes('stargazer'))     color = '#020111';
    else if (bodyClass.includes('rainy'))         color = '#203a43';
    else if (bodyClass.includes('snowy'))         color = '#6190E8';
    else if (bodyClass.includes('cloudy'))        color = '#3e5151';
    else if (bodyClass.includes('night'))         color = '#0f0c29';
    else if (bodyClass.includes('sunny'))         color = '#1e3c72';

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta      = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    meta.content = color;
}