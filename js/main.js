import { appState } from './state.js';
import { fetchData, fetchSuggestions } from './api.js';
import { renderHistory, updateUI, renderHourlyForecast, renderForecastCard } from './ui.js';
import { updateClock, ding, applyAmbientSounds, createClickEffect } from './features.js';
import { setupForecastTabs } from './graph.js';

const isMobile = () => window.innerWidth <= 768;

function dismissKeyboard() {
    if (document.activeElement?.blur) document.activeElement.blur();
}

// ── App Bootstrap ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // Fade in once CSS is fully loaded — prevents left-flash on refresh
    const wrapper = document.querySelector('.app-wrapper');
    if (wrapper) {
        wrapper.style.transition = 'opacity 0.3s ease';
        wrapper.style.opacity = '1';
    }

    renderHistory(fetchData);
    setInterval(updateClock, 1000);
    updateClock();

    document.getElementById('search-btn').addEventListener('click', handleSearch);
    document.getElementById('city').addEventListener('keypress', e => {
        if (e.key === 'Enter') handleSearch();
    });
    document.getElementById('sound-toggle').addEventListener('click', toggleSound);
    document.getElementById('unit-toggle').addEventListener('click', toggleUnit);
    document.getElementById('mic-btn').addEventListener('click', startVoiceSearch);
    document.getElementById('location-btn').addEventListener('click', fetchCurrentLocation);

    const toggleBtn = document.getElementById('forecast-toggle-btn');
    const closeBtn  = document.getElementById('close-forecast-btn');
    const headerForecastBtn = document.getElementById('header-forecast-btn');

    const headerWeatherBtn  = document.getElementById('header-weather-btn');
    const headerGraphBtn    = document.getElementById('header-graph-btn');
    const headerAIBtn       = document.getElementById('header-ai-btn');

    if (toggleBtn) toggleBtn.addEventListener('click', toggleForecast);
    if (closeBtn)  closeBtn.addEventListener('click',  toggleForecast);

    function updateNavActiveState(activeBtn) {
        document.querySelectorAll('.site-nav .nav-link').forEach(btn => btn.classList.remove('active'));
        if (activeBtn) activeBtn.classList.add('active');
    }

    if (headerWeatherBtn) {
        headerWeatherBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const wrapper = document.getElementById('forecast-wrapper');
            // Close forecast if it is open, returning to single-column view
            if (wrapper && wrapper.classList.contains('open')) {
                toggleForecast();
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
            updateNavActiveState(headerWeatherBtn);
        });
    }

    if (headerForecastBtn) {
        headerForecastBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const wrapper = document.getElementById('forecast-wrapper');
            if (wrapper && !wrapper.classList.contains('open')) toggleForecast(); 
            else if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Explicitly switch to Forecast tab
            const daysTab = document.querySelector('.ftab[data-tab="days"]');
            if (daysTab) daysTab.click();
            updateNavActiveState(headerForecastBtn);
        });
    }

    if (headerGraphBtn) {
        headerGraphBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // The swinging Graph card is structurally tied to the Forecast architecture.
            // If the forecast is closed, the graph card is display:none. We must open it first.
            const wrapper = document.getElementById('forecast-wrapper');
            if (wrapper && !wrapper.classList.contains('open')) {
                toggleForecast(); 
            }
            
            const graphCard = document.getElementById('graph-card-wrapper');
            if (graphCard) {
                // Ensure the Graph tab is actively selected
                const graphTab = document.querySelector('.ftab[data-tab="graph"]');
                if (graphTab) graphTab.click();
                
                // Allow the CSS animation to initialize before scrolling
                setTimeout(() => {
                    graphCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
            updateNavActiveState(headerGraphBtn);
        });
    }

    if (headerAIBtn) {
        headerAIBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // The AI Module is structurally appended inside the Forecast architecture.
            // If the forecast is closed, the AI card is completely hidden (width 0 or height 0).
            const wrapper = document.getElementById('forecast-wrapper');
            if (wrapper && !wrapper.classList.contains('open')) {
                toggleForecast(); 
            }
            
            const aiModule = document.getElementById('ai-prediction-module');
            if (aiModule) {
                // On mobile, the AI module is appended inside the "Days" tab panel.
                // We must ensure the "Days" tab is active so it's not display:none.
                const daysTab = document.querySelector('.ftab[data-tab="days"]');
                if (daysTab) daysTab.click();
                
                // Allow CSS transition to unlock the height/width before scrolling
                setTimeout(() => {
                    aiModule.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
            
            updateNavActiveState(headerAIBtn);
        });
    }

    setupSwipeToCloseForecast();
    setupForecastTabs();

    // ── Autocomplete ──
    const cityInput      = document.getElementById('city');
    const suggestionsBox = document.getElementById('suggestions-box');
    let debounceTimer;

    cityInput.addEventListener('input', e => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);
        if (query.length >= 3) {
            // 300ms debounce keeps suggestion requests manageable as the user types
            debounceTimer = setTimeout(async () => {
                const suggestions = await fetchSuggestions(query);
                renderSuggestions(suggestions);
            }, 300);
        } else {
            hideSuggestions();
        }
    });

    // Close suggestions when clicking outside the search box
    document.addEventListener('click', e => {
        if (!e.target.closest('.search-box')) hideSuggestions();

        // Spawn click ripple effects everywhere except buttons and inputs
        if (e.target.closest('button') || e.target.closest('input')) return;
        const type = (appState.cache?.current?.temp_c <= 0) ? 'ice' : 'drop';
        createClickEffect(e.clientX, e.clientY, type);
    });

    // Load the last known city immediately so the app renders right away.
    // Then try geolocation in the background — if it succeeds within 6s,
    // silently update to the user's actual location.
    // This eliminates the 10-12s blank screen caused by waiting for GPS.
    fetchData(appState.history[0]);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            p  => fetchData(`${p.coords.latitude},${p.coords.longitude}`),
            () => {},   // already showing history city, nothing to do on failure
            { timeout: 6000, maximumAge: 300000 },
        );
    }

    // VanillaTilt is too heavy on very narrow screens — destroy it there
    if (window.innerWidth <= 480) {
        document.querySelectorAll('[data-tilt]').forEach(el => {
            if (el.vanillaTilt) el.vanillaTilt.destroy();
        });
    }
});

// ── Autocomplete Rendering ────────────────────────────────
function renderSuggestions(suggestions) {
    const box       = document.getElementById('suggestions-box');
    const cityInput = document.getElementById('city');
    if (!suggestions?.length) { hideSuggestions(); return; }

    box.innerHTML = '';
    suggestions.forEach(loc => {
        const li     = document.createElement('li');
        li.className = 'suggestion-item';
        li.setAttribute('role', 'option');
        const region = loc.region ? loc.region + ', ' : '';
        li.innerHTML = `
            <span class="material-icons">location_on</span>
            ${loc.name}
            <span class="region">${region}${loc.country}</span>`;

        // touchstart + preventDefault prevents the 300ms tap delay on mobile
        li.addEventListener('touchstart', e => {
            e.preventDefault();
            cityInput.value = loc.name;
            hideSuggestions();
            handleSearch();
        }, { passive: false });

        li.addEventListener('click', () => {
            cityInput.value = loc.name;
            hideSuggestions();
            handleSearch();
        });
        box.appendChild(li);
    });
    box.classList.add('active');
}

function hideSuggestions() {
    document.getElementById('suggestions-box')?.classList.remove('active');
}

// ── Search ────────────────────────────────────────────────
function handleSearch() {
    const input = document.getElementById('city');
    if (!input.value.trim()) { alert('Please enter a city name!'); return; }
    hideSuggestions();
    fetchData(input.value.trim());
    input.value = '';
    if (isMobile()) dismissKeyboard();
}

// ── Sound Toggle ──────────────────────────────────────────
function toggleSound() {
    appState.soundEnabled = !appState.soundEnabled;
    const icon = document.getElementById('sound-icon');
    if (icon) icon.innerText = appState.soundEnabled ? 'volume_up' : 'volume_off';
    if (appState.soundEnabled) { ding.currentTime = 0; ding.play().catch(() => {}); }
    applyAmbientSounds();
}

// ── Unit Toggle °C / °F ───────────────────────────────────
function toggleUnit() {
    appState.isCelsius = !appState.isCelsius;
    const btn = document.getElementById('unit-toggle');
    if (btn) btn.innerText = appState.isCelsius ? 'Switch to °F' : 'Switch to °C';
    if (appState.cache) {
        updateUI(appState.cache);
        renderHourlyForecast(appState.cache);
        renderForecastCard(appState.cache);
    }
}

// ── Voice Search ──────────────────────────────────────────
// Works on Chrome/Firefox (Android + desktop) and Safari iOS 14.5+ over HTTPS.
// iOS requires: HTTPS (Vercel/Render satisfies this), a direct user gesture
// (button tap satisfies this), and explicit lang + separated event handlers.
let activeRecognition = null;

function startVoiceSearch() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        // Truly unsupported — older iOS or non-Chromium Android browsers.
        // Point iOS users to the keyboard dictation button as a fallback.
        alert('Voice search is not supported in this browser.\n\nOn iPhone/iPad, tap the 🎤 button on your keyboard to dictate a city name instead.');
        return;
    }

    const btn = document.getElementById('mic-btn');

    // Tapping the mic button again while recording cancels it cleanly
    if (activeRecognition) {
        activeRecognition.onresult = null;
        activeRecognition.onerror  = null;
        activeRecognition.onend    = null;
        activeRecognition.abort();
        activeRecognition = null;
        btn?.classList.remove('recording', 'listening');
        return;
    }

    if (appState.soundEnabled) { ding.currentTime = 0; ding.play().catch(() => {}); }

    const rec = new SR();

    // iOS Safari requires lang to be set explicitly — without it recognition
    // can silently fail or return no results on some devices
    rec.lang            = navigator.language || 'en-US';
    rec.continuous      = false;   // stop after first phrase (correct for search)
    rec.interimResults  = false;   // we only want the final result
    rec.maxAlternatives = 1;

    activeRecognition = rec;
    btn?.classList.add('recording', 'listening');

    // Separate handlers — iOS fires onerror and onend in a different order
    // than Chrome, so sharing one handler causes the button to get stuck

    rec.onresult = e => {
        const transcript = e.results[0][0].transcript.trim();
        if (transcript) fetchData(transcript);
        btn?.classList.remove('recording', 'listening');
        activeRecognition = null;
    };

    rec.onerror = e => {
        btn?.classList.remove('recording', 'listening');
        if (activeRecognition === rec) activeRecognition = null;

        // Give the user a clear reason rather than silently failing
        if (e.error === 'not-allowed') {
            alert('Microphone access was denied.\n\nGo to your browser settings, allow microphone permission for this site, then try again.');
        } else if (e.error === 'audio-capture') {
            alert('No microphone was found on your device.');
        }
        // 'no-speech' is ignored — very common on iOS when the user hesitates.
        // The button is already cleaned up above so nothing gets stuck.
    };

    rec.onend = () => {
        // Always clean up the button when recognition ends for any reason.
        // This fires after onresult too — classList.remove is safe to call twice.
        btn?.classList.remove('recording', 'listening');
        if (activeRecognition === rec) activeRecognition = null;
    };

    // Wrap start() in try/catch — iOS throws a real DOMException if the mic
    // permission was previously denied and the browser cached that decision
    try {
        rec.start();
    } catch (err) {
        btn?.classList.remove('recording', 'listening');
        activeRecognition = null;
        if (err.name === 'NotAllowedError') {
            alert('Microphone access was denied.\n\nGo to your browser settings, allow microphone permission for this site, then try again.');
        }
    }
}
// ── GPS Location ──────────────────────────────────────────
function fetchCurrentLocation() {
    if (!navigator.geolocation) { alert('Geolocation is not supported by your browser.'); return; }
    const display = document.getElementById('city-display');
    if (display) display.innerText = 'Locating...';
    if (isMobile()) dismissKeyboard();
    navigator.geolocation.getCurrentPosition(
        p  => fetchData(`${p.coords.latitude},${p.coords.longitude}`),
        () => alert('Location access denied. Please check your browser permissions.'),
    );
}

// ── Forecast Panel Toggle ─────────────────────────────────
// Button label and aria state update to reflect open/closed status
function toggleForecast() {
    const wrapper    = document.getElementById('forecast-wrapper');
    const btn        = document.getElementById('forecast-toggle-btn');
    const appWrapper = document.querySelector('.app-wrapper');
    if (!wrapper || !appWrapper) return;

    wrapper.classList.contains('open')
        ? _closeForecast(wrapper, btn, appWrapper)
        : _openForecast(wrapper, btn, appWrapper);
}

function _openForecast(wrapper, btn, appWrapper) {
    wrapper.classList.add('open');
    wrapper.setAttribute('aria-hidden', 'false');
    appWrapper.classList.add('forecast-open');

    if (btn) {
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        const label = document.getElementById('forecast-btn-label');
        const arrow = document.getElementById('forecast-btn-arrow');
        if (label) label.textContent = 'Hide Forecast';
        if (arrow) arrow.textContent = 'expand_less';
    }

    const graphWrapper = document.getElementById('graph-card-wrapper');
    if (graphWrapper) graphWrapper.classList.add('show');

    if (window.innerWidth <= 800) {
        setTimeout(() => {
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 150);
    }
}

function _closeForecast(wrapper, btn, appWrapper) {
    wrapper.classList.remove('open');
    wrapper.setAttribute('aria-hidden', 'true');
    appWrapper.classList.remove('forecast-open');

    if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
        const label = document.getElementById('forecast-btn-label');
        const arrow = document.getElementById('forecast-btn-arrow');
        if (label) label.textContent = 'See Upcoming Forecasts';
        if (arrow) arrow.textContent = 'arrow_forward';
    }

    const graphWrapper = document.getElementById('graph-card-wrapper');
    if (graphWrapper) graphWrapper.classList.remove('show');
}

// ── Swipe Down to Close Forecast (mobile) ─────────────────
// Uses velocity + direction to distinguish a deliberate "swipe to dismiss"
// from normal scrolling inside the forecast panel.
//
// Previous approach checked window.scrollY — but scrolling happens INSIDE
// the forecast card, so window.scrollY never changes and the panel was
// closing on every scroll gesture. Fixed by tracking touch velocity and
// requiring a fast, short, downward-only gesture to trigger close.
function setupSwipeToCloseForecast() {
    const forecastCard = document.getElementById('forecast-card');
    if (!forecastCard) return;

    let startY      = 0;
    let startX      = 0;
    let startTime   = 0;
    let isScrolling = false;   // true once the gesture looks like a scroll

    forecastCard.addEventListener('touchstart', e => {
        startY      = e.touches[0].clientY;
        startX      = e.touches[0].clientX;
        startTime   = Date.now();
        isScrolling = false;
    }, { passive: true });

    // During touchmove, decide early if this is a scroll gesture.
    // If the finger moves more than 12px vertically before 10px horizontally,
    // mark it as scrolling so touchend won't close the panel.
    forecastCard.addEventListener('touchmove', e => {
        const moveY = Math.abs(e.touches[0].clientY - startY);
        const moveX = Math.abs(e.touches[0].clientX - startX);
        if (moveY > 12 && moveY > moveX) isScrolling = true;
    }, { passive: true });

    forecastCard.addEventListener('touchend', e => {
        const dy       = e.changedTouches[0].clientY - startY;
        const dx       = Math.abs(e.changedTouches[0].clientX - startX);
        const duration = Date.now() - startTime;
        // velocity in px/ms — a deliberate swipe is fast, a scroll is slow
        const velocity = dy / duration;

        // Only close when ALL conditions are true:
        //   - deliberate downward motion (> 80px)
        //   - mostly vertical (not a diagonal scroll)
        //   - fast gesture (> 0.5 px/ms) — rules out slow content scrolling
        //   - completed quickly (< 350ms) — rules out long press + slow drag
        //   - not already detected as a scroll gesture during touchmove
        if (dy > 80 && dx < 50 && velocity > 0.5 && duration < 350 && !isScrolling) {
            const wrapper    = document.getElementById('forecast-wrapper');
            const btn        = document.getElementById('forecast-toggle-btn');
            const appWrapper = document.querySelector('.app-wrapper');
            if (wrapper?.classList.contains('open')) {
                _closeForecast(wrapper, btn, appWrapper);
                setTimeout(() => {
                    document.getElementById('main-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        }
    }, { passive: true });
}