import { appState } from './state.js';

// ── Fixed layout constants ────────────────────────────────
const PAD         = { top: 52, right: 55, bottom: 72, left: 58 };
const H           = 300;
const LABEL_EVERY = 4;    // show a time label every N hours
const RAIN_BAR_H  = 18;   // height of the rain probability bars in px

// ── Module-level state ────────────────────────────────────
let _animFrame      = null;
let _currentData    = null;
let _hoveredIndex   = null;
let _renderObserver = null;   // ResizeObserver used to defer first paint until visible

// ── Public: render 24-hour graph into #graph-container ───
export function renderWeatherGraph(data) {
    if (!data) return;
    _currentData  = data;
    _hoveredIndex = null;

    const container = document.getElementById('graph-container');
    if (!container) return;

    const hours = _getNext24Hours(data);
    if (hours.length < 4) {
        container.innerHTML = '<p class="graph-empty">Not enough hourly data available.</p>';
        return;
    }

    // Inject tooltip + legend styles once on first render
    if (!document.getElementById('graph-premium-styles')) {
        const s  = document.createElement('style');
        s.id     = 'graph-premium-styles';
        s.innerHTML = `
            .graph-tooltip {
                position: fixed;
                background: rgba(8, 5, 22, 0.90);
                backdrop-filter: blur(22px);
                -webkit-backdrop-filter: blur(22px);
                border: 1px solid rgba(255,255,255,0.11);
                border-radius: 18px;
                padding: 14px 16px 13px;
                pointer-events: none;
                z-index: 9999;
                min-width: 178px;
                box-shadow:
                    0 12px 40px rgba(0,0,0,0.55),
                    0  0   0 1px rgba(255,255,255,0.04),
                    inset 0 1px 0 rgba(255,255,255,0.08);
                opacity: 0;
                transform: translateY(10px) scale(0.95);
                transition: opacity 0.18s ease,
                            transform 0.22s cubic-bezier(0.34,1.2,0.64,1) !important;
                color: white;
                font-family: 'Poppins', sans-serif;
            }
            .graph-tooltip.gt-active {
                opacity: 1;
                transform: translateY(0) scale(1) !important;
            }
            .graph-tooltip::before {
                content: '';
                position: absolute;
                top: 0; left: 20px; right: 20px;
                height: 1px;
                background: linear-gradient(90deg,
                    transparent, rgba(255,140,80,0.5),
                    rgba(79,172,254,0.4), transparent);
                border-radius: 1px;
            }
            .gt-time {
                font-size: 0.64rem;
                opacity: 0.45;
                letter-spacing: 0.5px;
                font-weight: 500;
                margin-bottom: 2px;
            }
            .gt-cond {
                font-size: 0.77rem;
                color: rgba(255,255,255,0.88);
                font-weight: 600;
                margin-bottom: 10px;
                padding-bottom: 9px;
                border-bottom: 1px solid rgba(255,255,255,0.07);
            }
            .gt-temp-hero {
                font-size: 2.0rem;
                font-weight: 700;
                letter-spacing: -2px;
                line-height: 1;
                color: #ff8c50;
                margin-bottom: 1px;
                text-shadow: 0 0 20px rgba(255,120,50,0.4);
            }
            .gt-feels {
                font-size: 0.67rem;
                opacity: 0.45;
                margin-bottom: 10px;
                font-style: italic;
            }
            .gt-divider {
                height: 1px;
                background: rgba(255,255,255,0.06);
                margin: 7px 0;
            }
            .gt-row {
                display: flex;
                align-items: center;
                gap: 7px;
                font-size: 0.75rem;
                margin-bottom: 4px;
                opacity: 0.78;
            }
            .gt-swatch {
                width: 7px; height: 7px;
                border-radius: 50%;
                flex-shrink: 0;
            }
            .graph-legend {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
                font-size: 0.72rem;
                opacity: 0.75;
                margin-bottom: 10px;
                padding: 0 2px;
            }
            .gl-item {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .gl-swatch {
                width: 10px; height: 10px;
                border-radius: 50%;
                flex-shrink: 0;
            }
            .gl-temp-max .gl-swatch { background: #ff8c50; }
            .gl-temp-min .gl-swatch { background: #a8d8ff; }
        `;
        document.head.appendChild(s);
    }

    container.innerHTML = `
        <div class="graph-legend" aria-hidden="true">
            <span class="gl-item">
                <span class="gl-swatch" style="background:#ff8c50;box-shadow:0 0 6px rgba(255,120,50,0.6)"></span>Temperature
            </span>
            <span class="gl-item">
                <span class="gl-swatch" style="background:rgba(255,255,255,0.30);border:1px solid rgba(255,140,80,0.4)"></span>Feels Like
            </span>
            <span class="gl-item">
                <span class="gl-swatch" style="background:#4facfe"></span>Humidity
            </span>
            <span class="gl-item">
                <span class="gl-swatch" style="background:rgba(60,130,210,0.65);border-radius:2px"></span>Rain %
            </span>
            <span class="gl-item">
                <span class="gl-swatch" style="background:rgba(150,210,255,0.55);border:1px dashed rgba(150,210,255,0.6)"></span>Dew Point
            </span>
            <span class="gl-item">
                <span class="gl-swatch" style="background:linear-gradient(90deg,#4cc850,#fad200,#ff8700,#dc2828,#b41eb4);border-radius:2px"></span>UV Index
            </span>
        </div>
        <div class="graph-scroll graph-scroll-fill" id="graph-scroll"
             role="img" aria-label="24-hour temperature and humidity chart">
            <canvas id="wx-graph" aria-hidden="true"></canvas>
        </div>
    `;

    // Create the tooltip element once and reuse it across hovers
    let tip = document.getElementById('graph-tooltip');
    if (!tip) {
        tip           = document.createElement('div');
        tip.id        = 'graph-tooltip';
        tip.className = 'graph-tooltip';
        document.body.appendChild(tip);
    }

    _tryRender(hours);
}

// ── Deferred render via ResizeObserver ────────────────────
// The graph container may have zero width when the forecast panel is
// closed. This observer fires as soon as the container becomes visible
// and then disconnects itself.
function _tryRender(hours) {
    if (_renderObserver) {
        _renderObserver.disconnect();
        _renderObserver = null;
    }

    const scroll = document.getElementById('graph-scroll');
    if (!scroll) return;

    const w = scroll.clientWidth || scroll.offsetWidth;

    if (w < 80) {
        // Panel is hidden — wait for a resize event when it becomes visible
        _renderObserver = new ResizeObserver(() => {
            const sc = document.getElementById('graph-scroll');
            if (!sc) { _renderObserver?.disconnect(); _renderObserver = null; return; }
            const w2 = sc.clientWidth || sc.offsetWidth;
            if (w2 >= 80) {
                _renderObserver.disconnect();
                _renderObserver = null;
                // Use the freshest data in case the user changed city while waiting
                const freshHours = _currentData ? _getNext24Hours(_currentData) : hours;
                if (freshHours.length >= 4) _drawHourlyGraph(freshHours);
            }
        });
        _renderObserver.observe(scroll);
        return;
    }

    _drawHourlyGraph(hours);
}

// ── Public: forecast tab switching ───────────────────────
export function setupForecastTabs() {
    const tabStrip = document.getElementById('forecast-tabs');
    if (!tabStrip) return;
    tabStrip.querySelectorAll('.ftab').forEach(tab => {
        tab.addEventListener('click', () => {
            tabStrip.querySelectorAll('.ftab').forEach(t => {
                t.classList.remove('ftab-active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('ftab-active');
            tab.setAttribute('aria-selected', 'true');
            document.querySelectorAll('.forecast-panel').forEach(p => p.classList.remove('fp-active'));
            const panel = document.getElementById('panel-' + tab.dataset.tab);
            if (panel) panel.classList.add('fp-active');
            // Re-draw graph when switching to the graph tab — the canvas
            // may have been rendered while the tab was hidden (zero width)
            if (tab.dataset.tab === 'graph' && _currentData) {
                setTimeout(() => renderWeatherGraph(_currentData), 60);
            }
        });
    });
}

// ── Extract the next 24 hours from the current local time ──
function _getNext24Hours(data) {
    const todayH    = data.forecast?.forecastday[0]?.hour || [];
    const tomorrowH = data.forecast?.forecastday[1]?.hour || [];
    const allHours  = [...todayH, ...tomorrowH];
    const nowEpoch  = data.location?.localtime_epoch ?? Math.floor(Date.now() / 1000);
    const fromIdx   = allHours.findIndex(h => h.time_epoch >= nowEpoch);
    const start     = fromIdx >= 0 ? fromIdx : 0;
    return allHours.slice(start, start + 24);
}

function _fmtHour(epoch) {
    const d = new Date(epoch * 1000);
    const h = d.getHours();
    if (h === 0)  return '12 AM';
    if (h === 12) return '12 PM';
    return h > 12 ? (h - 12) + ' PM' : h + ' AM';
}

function _fmtFull(epoch) {
    const d    = new Date(epoch * 1000);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const h    = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr   = h % 12 || 12;
    return `${days[d.getDay()]} ${hr}:00 ${ampm}`;
}

// Canvas roundRect with fallback for older browsers
function _rrect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
    } else {
        const r2 = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r2, y);
        ctx.lineTo(x + w - r2, y);
        ctx.arcTo(x + w, y, x + w, y + r2, r2);
        ctx.lineTo(x + w, y + h - r2);
        ctx.arcTo(x + w, y + h, x + w - r2, y + h, r2);
        ctx.lineTo(x + r2, y + h);
        ctx.arcTo(x, y + h, x, y + h - r2, r2);
        ctx.lineTo(x, y + r2);
        ctx.arcTo(x, y, x + r2, y, r2);
        ctx.closePath();
    }
}

// Night band opacity — deep at midnight, near-zero at midday.
// Values are manually tuned to look good on the graph.
function _nightAlpha(h) {
    const curve = [
        0.42, 0.40, 0.38, 0.35, 0.32,
        0.22,
        0.08, 0.03, 0.01, 0.01,
        0.01, 0.01, 0.01, 0.01,
        0.01, 0.01, 0.01,
        0.04, 0.12,
        0.22, 0.32, 0.38,
        0.40, 0.42,
    ];
    return curve[Math.max(0, Math.min(23, h))] ?? 0.01;
}

// Warm golden tint during dawn (5–8 AM) and evening (16–19)
function _dawnAlpha(h) {
    if (h >= 5  && h <= 8)  return Math.sin((h - 5) / 3 * Math.PI) * 0.055;
    if (h >= 16 && h <= 19) return Math.sin((h - 16) / 3 * Math.PI) * 0.065;
    return 0;
}

// UV index → colour per WHO hazard scale
function _uvColor(uv, alpha) {
    if (uv < 1)  return `rgba(0,0,0,0)`;
    if (uv < 3)  return `rgba(76,200,80,${alpha})`;
    if (uv < 6)  return `rgba(250,210,0,${alpha})`;
    if (uv < 8)  return `rgba(255,135,0,${alpha})`;
    if (uv < 11) return `rgba(220,40,40,${alpha})`;
    return            `rgba(180,30,180,${alpha})`;
}
function _uvLabel(uv) {
    if (uv < 1)  return '';
    if (uv < 3)  return 'Low';
    if (uv < 6)  return 'Moderate';
    if (uv < 8)  return 'High';
    if (uv < 11) return 'Very High';
    return 'Extreme';
}

// ── Main Drawing Function ─────────────────────────────────
function _drawHourlyGraph(hours) {
    const scroll = document.getElementById('graph-scroll');
    const canvas = document.getElementById('wx-graph');
    if (!scroll || !canvas) return;

    const isCelsius  = appState.isCelsius;
    const DPR        = Math.min(window.devicePixelRatio || 1, 2);
    const n          = hours.length;

    const containerW = scroll.clientWidth || scroll.offsetWidth || 420;
    const usable     = containerW - PAD.left - PAD.right;
    const SPACING    = usable / Math.max(n - 1, 1);
    const W          = containerW;

    canvas.width        = W * DPR;
    canvas.height       = H * DPR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    scroll.style.overflowX = 'hidden';

    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    // ── Data arrays ───────────────────────────────────────
    const temps  = hours.map(h => isCelsius ? h.temp_c      : h.temp_f);
    const feels  = hours.map(h => isCelsius ? h.feelslike_c : h.feelslike_f);
    const humids = hours.map(h => h.humidity);
    const rains  = hours.map(h => h.chance_of_rain ?? 0);
    const epochs = hours.map(h => h.time_epoch);
    const uvs    = hours.map(h => h.uv ?? 0);
    const dewpts = hours.map(h => isCelsius ? (h.dewpoint_c ?? null) : (h.dewpoint_f ?? null));
    const windKph = hours.map(h => Math.round(h.wind_kph ?? 0));
    const windDir = hours.map(h => h.wind_dir ?? '');
    const visKm   = hours.map(h => h.vis_km ?? null);

    // Pad the temperature range so lines aren't squashed to the top/bottom
    const allT  = [...temps, ...feels, ...dewpts.filter(v => v !== null)];
    const tMin  = Math.min(...allT);
    const tMax  = Math.max(...allT);
    const tPad  = Math.max((tMax - tMin) * 0.4, 6);
    const yTmin = tMin - tPad;
    const yTmax = tMax + tPad;

    const chartTop    = PAD.top;
    const chartBottom = H - PAD.bottom;
    const chartH      = chartBottom - chartTop;
    const rainTop     = chartBottom + 6;
    const rainBottom  = rainTop + RAIN_BAR_H;

    const xAt  = i => PAD.left + i * SPACING;
    const yT   = t => chartTop + (1 - (t - yTmin) / (yTmax - yTmin)) * chartH;
    const yH   = h => chartTop + (1 - h / 100) * chartH;
    const cpOff = SPACING * 0.48;   // bezier control point offset

    if (_animFrame) cancelAnimationFrame(_animFrame);
    let progress = 0;

    const peakIdx = temps.indexOf(Math.max(...temps));

    function drawFrame(prog) {
        ctx.clearRect(0, 0, W, H);

        const endIdx = prog * (n - 1);
        const last   = Math.floor(endIdx);
        const frac   = endIdx - last;

        // ── Night / dawn bands ────────────────────────────
        // Each hour segment gets a horizontal gradient so transitions
        // between light levels blend smoothly
        for (let i = 0; i < n - 1; i++) {
            const h0 = new Date(epochs[i] * 1000).getHours();
            const h1 = new Date(epochs[Math.min(i + 1, n - 1)] * 1000).getHours();
            const a0 = _nightAlpha(h0);
            const a1 = _nightAlpha(h1);

            if (a0 > 0.008 || a1 > 0.008) {
                const bandGrad = ctx.createLinearGradient(xAt(i), 0, xAt(i + 1), 0);
                bandGrad.addColorStop(0, `rgba(10,8,30,${a0})`);
                bandGrad.addColorStop(1, `rgba(10,8,30,${a1})`);
                ctx.fillStyle = bandGrad;
                ctx.fillRect(xAt(i), chartTop, SPACING + 0.5, chartH);
            }

            const d0 = _dawnAlpha(h0);
            const d1 = _dawnAlpha(h1);
            if (d0 > 0 || d1 > 0) {
                const tintGrad = ctx.createLinearGradient(xAt(i), 0, xAt(i + 1), 0);
                tintGrad.addColorStop(0, `rgba(255,120,40,${d0})`);
                tintGrad.addColorStop(1, `rgba(255,120,40,${d1})`);
                ctx.fillStyle = tintGrad;
                ctx.fillRect(xAt(i), chartTop, SPACING + 0.5, chartH);
            }
        }

        // ── UV index strip at the top edge of the chart ───
        const UV_H = 5;
        for (let i = 0; i < n - 1; i++) {
            const uv0 = uvs[i];
            const uv1 = uvs[Math.min(i + 1, n - 1)];
            if (uv0 < 0.5 && uv1 < 0.5) continue;
            const uvGrad = ctx.createLinearGradient(xAt(i), 0, xAt(i + 1), 0);
            uvGrad.addColorStop(0, _uvColor(uv0, 0.65));
            uvGrad.addColorStop(1, _uvColor(uv1, 0.65));
            ctx.fillStyle = uvGrad;
            ctx.fillRect(xAt(i), chartTop, SPACING + 0.5, UV_H);
        }
        if (uvs.some(u => u >= 1)) {
            ctx.font         = '8.5px Poppins,sans-serif';
            ctx.textAlign    = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle    = 'rgba(255,230,100,0.50)';
            ctx.fillText('UV', PAD.left - 8, chartTop + UV_H / 2);
        }

        // ── Comfort zone band (18–26 °C / 64–79 °F) ──────
        // A subtle shaded band showing the comfortable temperature range
        const comfortMinC = 18, comfortMaxC = 26;
        const cMin = isCelsius ? comfortMinC : comfortMinC * 9/5 + 32;
        const cMax = isCelsius ? comfortMaxC : comfortMaxC * 9/5 + 32;
        if (cMin <= yTmax && cMax >= yTmin) {
            const cy1 = Math.max(yT(cMax), chartTop);
            const cy2 = Math.min(yT(cMin), chartBottom);
            if (cy2 > cy1 + 2) {
                const cGrad = ctx.createLinearGradient(0, cy1, 0, cy2);
                cGrad.addColorStop(0, 'rgba(80,220,120,0.055)');
                cGrad.addColorStop(1, 'rgba(80,220,120,0.018)');
                ctx.fillStyle = cGrad;
                ctx.fillRect(PAD.left, cy1, W - PAD.left - PAD.right, cy2 - cy1);
                ctx.setLineDash([3, 6]);
                ctx.lineWidth   = 0.8;
                ctx.strokeStyle = 'rgba(80,220,120,0.18)';
                [cy1, cy2].forEach(cy => {
                    ctx.beginPath();
                    ctx.moveTo(PAD.left, cy);
                    ctx.lineTo(W - PAD.right, cy);
                    ctx.stroke();
                });
                ctx.setLineDash([]);
                if (cy2 - cy1 > 14) {
                    ctx.font         = '8px Poppins,sans-serif';
                    ctx.textAlign    = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle    = 'rgba(80,220,120,0.38)';
                    ctx.fillText('COMFORT', PAD.left - 4, (cy1 + cy2) / 2);
                }
            }
        }

        // ── Grid lines ────────────────────────────────────
        ctx.lineWidth = 1;
        for (let g = 0; g <= 5; g++) {
            const y = chartTop + (g / 5) * chartH;
            ctx.strokeStyle = (g === 0 || g === 5)
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(255,255,255,0.035)';
            ctx.beginPath();
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(W - PAD.right, y);
            ctx.stroke();
        }

        // ── Hover beam ────────────────────────────────────
        if (prog === 1 && _hoveredIndex !== null) {
            const bx = xAt(_hoveredIndex);
            const bw = Math.max(SPACING * 1.1, 6);
            const beamGrad = ctx.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0);
            beamGrad.addColorStop(0,    'rgba(255,255,255,0)');
            beamGrad.addColorStop(0.35, 'rgba(255,255,255,0.055)');
            beamGrad.addColorStop(0.5,  'rgba(255,255,255,0.10)');
            beamGrad.addColorStop(0.65, 'rgba(255,255,255,0.055)');
            beamGrad.addColorStop(1,    'rgba(255,255,255,0)');
            ctx.fillStyle = beamGrad;
            ctx.fillRect(bx - bw / 2, chartTop - 5, bw, chartH + 5);
            ctx.beginPath();
            ctx.moveTo(bx, chartTop - 8);
            ctx.lineTo(bx, chartBottom);
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth   = 1;
            ctx.stroke();
        }

        // ── Axes ──────────────────────────────────────────
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(PAD.left, chartTop - 10);
        ctx.lineTo(PAD.left, chartBottom);
        ctx.lineTo(W - PAD.right, chartBottom);
        ctx.stroke();

        // Build a smooth bezier path through the data points
        function buildPath(valFn, fromI = 0, toI = last) {
            ctx.beginPath();
            ctx.moveTo(xAt(fromI), valFn(fromI));
            for (let i = fromI + 1; i <= toI; i++) {
                const x0 = xAt(i - 1), y0 = valFn(i - 1);
                const x1 = xAt(i),     y1 = valFn(i);
                ctx.bezierCurveTo(x0 + cpOff, y0, x1 - cpOff, y1, x1, y1);
            }
            if (frac > 0 && toI < n - 1 && toI === last) {
                const x0 = xAt(last),     y0 = valFn(last);
                const x1 = xAt(last + 1), y1 = valFn(last + 1);
                const tx  = x0 + frac * SPACING;
                const ty  = y0 + (y1 - y0) * frac;
                ctx.bezierCurveTo(x0 + cpOff * frac, y0, tx - cpOff * (1 - frac), ty, tx, ty);
            }
        }

        const endX = (frac > 0 && last < n - 1) ? xAt(last) + frac * SPACING : xAt(last);

        // ── Feels-like gradient fill ──────────────────────
        if (last >= 1 || frac > 0) {
            buildPath(i => yT(temps[i]));
            ctx.lineTo(endX, chartBottom);
            ctx.lineTo(xAt(0), chartBottom);
            ctx.closePath();
            const gFeel = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
            gFeel.addColorStop(0,   'rgba(255,200,120,0.07)');
            gFeel.addColorStop(0.6, 'rgba(255,200,120,0.02)');
            gFeel.addColorStop(1,   'rgba(255,200,120,0)');
            ctx.fillStyle = gFeel;
            ctx.fill();
        }

        // ── Temperature gradient fill ─────────────────────
        if (last >= 1 || frac > 0) {
            buildPath(i => yT(temps[i]));
            ctx.lineTo(endX, chartBottom);
            ctx.lineTo(xAt(0), chartBottom);
            ctx.closePath();
            const gTemp = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
            gTemp.addColorStop(0,    'rgba(255,100,40,0.55)');
            gTemp.addColorStop(0.30, 'rgba(255,130,70,0.25)');
            gTemp.addColorStop(0.70, 'rgba(255,140,80,0.08)');
            gTemp.addColorStop(1,    'rgba(255,140,80,0)');
            ctx.fillStyle = gTemp;
            ctx.fill();
        }

        // ── Humidity gradient fill ────────────────────────
        if (last >= 1 || frac > 0) {
            buildPath(i => yH(humids[i]));
            ctx.lineTo(endX, chartBottom);
            ctx.lineTo(xAt(0), chartBottom);
            ctx.closePath();
            const gHum = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
            gHum.addColorStop(0,   'rgba(79,172,254,0.18)');
            gHum.addColorStop(0.6, 'rgba(79,172,254,0.05)');
            gHum.addColorStop(1,   'rgba(79,172,254,0)');
            ctx.fillStyle = gHum;
            ctx.fill();
        }

        // ── Feels-like dashed line ────────────────────────
        if (last >= 2) {
            buildPath(i => yT(feels[i]));
            ctx.strokeStyle = 'rgba(255,210,150,0.38)';
            ctx.lineWidth   = 1.5;
            ctx.lineJoin    = 'round';
            ctx.lineCap     = 'round';
            ctx.setLineDash([3, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── Dew point dotted line ─────────────────────────
        // When dew point approaches the temperature, fog is imminent
        const validDew = dewpts.filter(v => v !== null);
        if (last >= 2 && validDew.length >= 2) {
            buildPath(i => yT(dewpts[i] ?? (temps[i] - 8)));
            ctx.strokeStyle = 'rgba(150,210,255,0.45)';
            ctx.lineWidth   = 1.4;
            ctx.lineJoin    = 'round';
            ctx.lineCap     = 'round';
            ctx.setLineDash([2, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── Humidity line ─────────────────────────────────
        if (last >= 1 || frac > 0) {
            buildPath(i => yH(humids[i]));
            ctx.strokeStyle = 'rgba(79,172,254,0.70)';
            ctx.lineWidth   = 2;
            ctx.lineJoin    = 'round';
            ctx.lineCap     = 'round';
            ctx.stroke();
        }

        // ── Temperature hero line (glowing thick stroke) ──
        if (last >= 1 || frac > 0) {
            buildPath(i => yT(temps[i]));
            ctx.strokeStyle = 'rgba(255,100,40,0.30)';
            ctx.lineWidth   = 9;
            ctx.lineJoin    = 'round';
            ctx.lineCap     = 'round';
            ctx.stroke();
            ctx.strokeStyle = '#ff8c50';
            ctx.lineWidth   = 3.5;
            ctx.shadowColor = 'rgba(255,110,40,0.55)';
            ctx.shadowBlur  = 10;
            ctx.stroke();
            ctx.shadowBlur  = 0;
        }

        // ── Data dots every LABEL_EVERY hours ────────────
        for (let i = 0; i <= last; i += LABEL_EVERY) {
            const active = prog === 1 && i === _hoveredIndex;
            const isPeak = i === peakIdx && prog === 1;

            ctx.beginPath();
            ctx.arc(xAt(i), yT(temps[i]), active || isPeak ? 7 : 4.5, 0, Math.PI * 2);
            ctx.fillStyle   = '#ff8c50';
            if (isPeak) { ctx.shadowColor = '#ff6020'; ctx.shadowBlur = 16; }
            ctx.fill();
            ctx.shadowBlur  = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth   = active ? 2.5 : 1.8;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(xAt(i), yH(humids[i]), active ? 5 : 3.5, 0, Math.PI * 2);
            ctx.fillStyle   = '#4facfe';
            if (active) { ctx.shadowColor = '#4facfe'; ctx.shadowBlur = 10; }
            ctx.fill();
            ctx.shadowBlur  = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // ── Peak temperature marker ───────────────────────
        if (prog === 1 && peakIdx <= last) {
            const px = xAt(peakIdx);
            const py = yT(temps[peakIdx]);

            [[24, 0.05], [16, 0.10], [10, 0.18]].forEach(([r, a]) => {
                ctx.beginPath();
                ctx.arc(px, py, r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,96,32,${a})`;
                ctx.fill();
            });

            ctx.shadowColor = '#ff6020';
            ctx.shadowBlur  = 22;
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fillStyle   = '#ff5010';
            ctx.fill();
            ctx.shadowBlur  = 0;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 2;
            ctx.stroke();

            ctx.font         = 'bold 9px Poppins,sans-serif';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            const pillW = 34, pillH = 14, pillY = py - 30;
            _rrect(ctx, px - pillW / 2, pillY - pillH / 2, pillW, pillH, 5);
            ctx.fillStyle = 'rgba(255,80,16,0.85)';
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText('PEAK', px, pillY);

            ctx.font         = 'bold 11px Poppins,sans-serif';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle    = 'rgba(255,150,90,0.95)';
            ctx.fillText(Math.round(temps[peakIdx]) + '°', px, pillY - pillH / 2 - 5);
        }

        // ── Temperature value labels ──────────────────────
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font         = 'bold 11px Poppins,sans-serif';
        for (let i = 0; i <= last; i += LABEL_EVERY) {
            if (i === peakIdx && prog === 1) continue;
            const active  = prog === 1 && i === _hoveredIndex;
            ctx.fillStyle = active ? '#fff' : 'rgba(255,155,90,0.92)';
            ctx.fillText(Math.round(temps[i]) + '°', xAt(i), yT(temps[i]) - 9);
        }

        // ── X-axis time labels ────────────────────────────
        ctx.font         = '10.5px Poppins,sans-serif';
        ctx.textBaseline = 'top';
        ctx.textAlign    = 'center';
        for (let i = 0; i < n; i += LABEL_EVERY) {
            const active     = prog === 1 && i === _hoveredIndex;
            const hourOfDay  = new Date(epochs[i] * 1000).getHours();
            const isMidnight = hourOfDay === 0;

            if (isMidnight) {
                const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                const d = new Date(epochs[i] * 1000);
                ctx.fillStyle = active ? '#fff' : 'rgba(0,242,254,0.82)';
                ctx.font      = 'bold 10px Poppins,sans-serif';
                ctx.fillText(dayNames[d.getDay()], xAt(i), chartBottom + 14);
                ctx.font      = '10.5px Poppins,sans-serif';
            } else {
                ctx.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.85)';
                ctx.fillText(_fmtHour(epochs[i]), xAt(i), chartBottom + 14);
            }
        }
        if ((n - 1) % LABEL_EVERY !== 0 && last >= n - 1) {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font      = '9.5px Poppins,sans-serif';
            ctx.fillText(_fmtHour(epochs[n - 1]), xAt(n - 1), chartBottom + 14);
        }

        // ── Rain probability bars ─────────────────────────
        if (prog >= 0.5) {
            const rainAlpha = Math.min(1, (prog - 0.5) * 2);
            for (let i = 0; i <= last; i++) {
                const rainPct = rains[i] / 100;
                const barH2   = rainPct * RAIN_BAR_H;
                const x       = xAt(i) - Math.max(SPACING * 0.35, 2);
                const w       = Math.max(SPACING * 0.7, 3);
                const active  = prog === 1 && i === _hoveredIndex;

                _rrect(ctx, x, rainTop, w, RAIN_BAR_H, 2);
                ctx.fillStyle = `rgba(79,172,254,${0.06 * rainAlpha})`;
                ctx.fill();

                if (rainPct > 0) {
                    const grad = ctx.createLinearGradient(0, rainTop + RAIN_BAR_H - barH2, 0, rainTop + RAIN_BAR_H);
                    grad.addColorStop(0, `rgba(50,130,210,${(active ? 0.92 : 0.58) * rainAlpha})`);
                    grad.addColorStop(1, `rgba(30,90,170,${(active ? 0.60 : 0.28) * rainAlpha})`);
                    _rrect(ctx, x, rainTop + RAIN_BAR_H - barH2, w, barH2, 2);
                    ctx.fillStyle = grad;
                    if (active) { ctx.shadowColor = 'rgba(79,172,254,0.7)'; ctx.shadowBlur = 7; }
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }

            ctx.font         = '9px Poppins,sans-serif';
            ctx.textAlign    = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle    = `rgba(79,172,254,${0.90 * rainAlpha})`;
            ctx.fillText('RAIN%', PAD.left - 5, rainTop + RAIN_BAR_H / 2);
        }

        // ── Y-axis: temperature (left) ────────────────────
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = 'rgba(255,140,80,0.95)';
        ctx.font         = '10.5px Poppins,sans-serif';
        const tStep = (yTmax - yTmin) / 5;
        for (let g = 0; g <= 5; g++) {
            const val = yTmin + g * tStep;
            ctx.fillText(
                isCelsius ? Math.round(val) + '°C' : Math.round(val) + '°F',
                PAD.left - 8, yT(val),
            );
        }

        // ── Y-axis: humidity (right) ──────────────────────
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(79,172,254,0.95)';
        for (let g = 0; g <= 4; g++) {
            const h = g * 25;
            ctx.fillText(h + '%', W - PAD.right + 8, yH(h));
        }

        // ── NOW marker ────────────────────────────────────
        if (prog >= 0.05) {
            const nowAlpha = Math.min(1, prog * 6);
            ctx.font         = 'bold 9px Poppins,sans-serif';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle    = `rgba(0,242,254,${0.88 * nowAlpha})`;
            ctx.fillText('NOW', xAt(0), chartTop - 32);

            ctx.beginPath();
            ctx.moveTo(xAt(0), chartTop - 30);
            ctx.lineTo(xAt(0), chartBottom);
            ctx.strokeStyle = `rgba(0,242,254,${0.18 * nowAlpha})`;
            ctx.lineWidth   = 1;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(xAt(0), yT(temps[0]), 5, 0, Math.PI * 2);
            ctx.fillStyle   = '#00f2fe';
            ctx.shadowColor = '#00f2fe';
            ctx.shadowBlur  = 12 * nowAlpha;
            ctx.fill();
            ctx.shadowBlur  = 0;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 2;
            ctx.stroke();
        }

        // ── Atmospheric fog lift at chart base ────────────
        if (prog === 1) {
            const fogGrad = ctx.createLinearGradient(0, chartBottom - 28, 0, chartBottom);
            fogGrad.addColorStop(0, 'rgba(255,255,255,0)');
            fogGrad.addColorStop(1, 'rgba(255,255,255,0.018)');
            ctx.fillStyle = fogGrad;
            ctx.fillRect(PAD.left, chartBottom - 28, W - PAD.left - PAD.right, 28);
        }
    }

    // Entry animation — draws from left to right over ~40 frames
    function frame() {
        progress = Math.min(progress + 0.025, 1);
        drawFrame(progress);
        if (progress < 1) {
            _animFrame = requestAnimationFrame(frame);
        } else {
            _setupTooltip(scroll, canvas, hours, epochs, xAt, temps, feels, humids, rains, isCelsius, SPACING, drawFrame, uvs, windKph, windDir, dewpts, visKm);
        }
    }
    _animFrame = requestAnimationFrame(frame);
}

// ── Hover / Touch Tooltip ─────────────────────────────────
function _setupTooltip(scroll, canvas, hours, epochs, xAt, temps, feels, humids, rains, isCelsius, SPACING, drawFrame, uvs, windKph, windDir, dewpts, visKm) {
    const tip = document.getElementById('graph-tooltip');
    if (!tip) return;

    function show(idx, clientX, clientY) {
        if (idx < 0 || idx >= hours.length) return;
        if (_hoveredIndex !== idx) { _hoveredIndex = idx; drawFrame(1); }

        const h      = hours[idx];
        const temp   = isCelsius ? Math.round(h.temp_c)      + '°C' : Math.round(h.temp_f)      + '°F';
        const feel   = isCelsius ? Math.round(h.feelslike_c) + '°C' : Math.round(h.feelslike_f) + '°F';
        const dew    = dewpts[idx];
        const dewStr = dew !== null
            ? (isCelsius ? Math.round(dew) + '°C' : Math.round(dew) + '°F')
            : null;
        const uv     = uvs[idx] ?? 0;
        const uvLbl  = _uvLabel(uv);
        const vis    = visKm[idx];
        const wKph   = windKph[idx] ?? 0;
        const wDir   = windDir[idx] ?? '';

        tip.innerHTML = `
            <div class="gt-time">${_fmtFull(h.time_epoch)}</div>
            <div class="gt-cond">${h.condition.text}</div>
            <div class="gt-temp-hero">${temp}</div>
            <div class="gt-feels">feels like ${feel}</div>
            <div class="gt-divider"></div>
            <div class="gt-row">
                <span class="gt-swatch" style="background:#4facfe;box-shadow:0 0 4px #4facfe"></span>
                <span>${humids[idx]}% humidity</span>
            </div>
            ${dewStr ? `
            <div class="gt-row">
                <span class="gt-swatch" style="background:rgba(150,210,255,0.6);border:1px dashed rgba(150,210,255,0.8)"></span>
                <span>Dew point ${dewStr}</span>
            </div>` : ''}
            ${wKph > 0 ? `
            <div class="gt-row">
                <span style="font-size:0.78rem">💨</span>
                <span>${wKph} km/h ${wDir}</span>
            </div>` : ''}
            ${rains[idx] > 0 ? `
            <div class="gt-row">
                <span style="font-size:0.78rem">🌧</span>
                <span>${rains[idx]}% rain chance</span>
            </div>` : ''}
            ${uv >= 1 ? `
            <div class="gt-row">
                <span style="font-size:0.78rem">☀️</span>
                <span>UV ${uv.toFixed(1)} — ${uvLbl}</span>
            </div>` : ''}
            ${vis !== null ? `
            <div class="gt-row">
                <span style="font-size:0.78rem">👁</span>
                <span>${vis} km visibility</span>
            </div>` : ''}
        `;

        // Position the tooltip so it stays within the viewport
        const rect = canvas.getBoundingClientRect();
        const dotX = rect.left + xAt(idx);
        let tx = dotX - 95;
        const vw = window.innerWidth;
        if (tx + 210 > vw - 4) tx = vw - 214;
        if (tx < 4)             tx = 4;
        let ty = clientY - 195;
        if (ty < 10) ty = clientY + 22;

        tip.style.left = tx + 'px';
        tip.style.top  = ty + 'px';
        tip.classList.add('gt-active');
    }

    function hide() {
        tip.classList.remove('gt-active');
        if (_hoveredIndex !== null) { _hoveredIndex = null; drawFrame(1); }
    }

    function idxFromClient(clientX) {
        const rect   = canvas.getBoundingClientRect();
        const xOnCvs = clientX - rect.left;
        return Math.max(0, Math.min(Math.round((xOnCvs - PAD.left) / SPACING), hours.length - 1));
    }

    canvas.addEventListener('mousemove',   e => show(idxFromClient(e.clientX), e.clientX, e.clientY));
    canvas.addEventListener('mouseleave',  hide);
    canvas.addEventListener('touchstart',  e => show(idxFromClient(e.touches[0].clientX), e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    canvas.addEventListener('touchmove',   e => show(idxFromClient(e.touches[0].clientX), e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    canvas.addEventListener('touchend',    hide, { passive: true });
    canvas.addEventListener('touchcancel', hide, { passive: true });
}