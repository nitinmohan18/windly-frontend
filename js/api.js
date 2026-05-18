import { CONFIG } from './config.js';
import { appState } from './state.js';
import { setLoadingState, updateUI, renderHourlyForecast, renderForecastCard, updateHistory } from './ui.js';
import { manageAnimations } from './features.js';

// Gauge circumference: 2π × r=33 ≈ 207.3
const GAUGE_CIRC = 207.3;

// ── AI Atmospheric Analysis ───────────────────────────────
// Sends 5 weather features to the Random Forest backend and
// updates every visual element of the Atmospheric Intelligence card.
export async function getAIPrediction(temp, humidity, wind, pressure, cloud = 50, tomorrowDay = null) {
    try {
        const response = await fetch(`${CONFIG.BASE_URL}/predict`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ temperature: temp, humidity, pressure, wind, cloud }),
        });

        if (!response.ok) throw new Error('API error: ' + response.status);

        const data        = await response.json();
        const probability = typeof data.probability === 'number' ? data.probability : 0;
        const pct         = Math.round(probability * 100);

        // Map probability to a human-readable risk tier
        let riskKey, riskLabel, mainMsg, subMsg;
        if (pct < 20) {
            riskKey = 'low';   riskLabel = 'Stable Conditions';
            mainMsg = 'Clear Skies Expected';
            subMsg  = 'Atmospheric conditions are highly stable. Very little chance of precipitation — ideal conditions for outdoor activity.';
        } else if (pct < 40) {
            riskKey = 'low';   riskLabel = 'Low Risk';
            mainMsg = 'Mostly Dry Conditions';
            subMsg  = 'Mild atmospheric moisture present but unlikely to produce rain. Worth watching afternoon cloud build-up.';
        } else if (pct < 55) {
            riskKey = 'moderate'; riskLabel = 'Moderate Risk';
            mainMsg = 'Unsettled Weather Pattern';
            subMsg  = 'Atmospheric instability detected. Reasonable probability of showers developing — consider carrying an umbrella.';
        } else if (pct < 70) {
            riskKey = 'moderate'; riskLabel = 'Elevated Risk';
            mainMsg = 'Rain Possible Tomorrow';
            subMsg  = 'Elevated humidity and pressure gradient suggest periods of rain are probable. Plan outdoor activities for morning hours.';
        } else if (pct < 82) {
            riskKey = 'high';  riskLabel = 'High Risk';
            mainMsg = 'Rain Likely in Next 24 Hours';
            subMsg  = 'Significant precipitation probability detected. Prepare for wet conditions — umbrella and waterproof footwear advised.';
        } else {
            riskKey = 'severe'; riskLabel = 'Severe Risk';
            mainMsg = 'Heavy Rain Highly Probable';
            subMsg  = 'Atmospheric model detects very high disturbance. Expect sustained heavy rain. Avoid unnecessary travel if possible.';
        }

        _updateAIModule(pct, riskKey, riskLabel, mainMsg, subMsg,
                        { temp, humidity, wind, pressure, cloud },
                        tomorrowDay);

    } catch (err) {
        console.warn('Atmospheric analysis offline:', err.message);
        _setAIOffline();
    }
}

// ── Update the AI card ────────────────────────────────────
// All DOM text is set immediately. Animated values (gauge arc,
// spectrum marker, factor bars) are batched into a single
// requestAnimationFrame call to avoid triggering multiple reflows.
function _updateAIModule(pct, riskKey, riskLabel, mainMsg, subMsg, inputs, tomorrowDay) {
    const mod = document.getElementById('ai-prediction-module');
    if (!mod) return;

    // Risk theme (drives all color variables via CSS attribute selector)
    mod.setAttribute('data-risk', riskKey);

    // Text content — set directly, no animation needed
    _setText('ai-result-display', mainMsg);
    _setText('ai-sub-message',    subMsg);
    _setText('ai-risk-label',     riskLabel);

    // Animated counter — uses requestAnimationFrame for smooth 60fps easing
    _countUp('ai-pct-num', pct, 1300);

    // Batch all visual bar/marker updates into one paint frame.
    // Doing each in a separate rAF causes multiple style recalculations.
    requestAnimationFrame(() => {
        const gauge = document.getElementById('ai-gauge-fill');
        if (gauge) {
            gauge.style.strokeDashoffset = GAUGE_CIRC - (pct / 100) * GAUGE_CIRC;
        }

        const marker = document.getElementById('ai-spectrum-marker');
        if (marker) {
            // Clamp so marker never bleeds outside the track
            marker.style.left = Math.max(2, Math.min(96, pct)) + '%';
        }

        // Contributing factor bars — all set in same frame as gauge/marker
        if (inputs) {
            const isCelsius = appState.isCelsius;
            _setFactor('af-temp', 'af-temp-val',
                _normalize(inputs.temp, -10, 45),
                isCelsius ? Math.round(inputs.temp) + '°C' : Math.round(inputs.temp * 9/5 + 32) + '°F');

            _setFactor('af-humidity', 'af-humidity-val',
                _normalize(inputs.humidity, 0, 100),
                Math.round(inputs.humidity) + '%');

            // Pressure: lower pressure = more concerning, so we invert the range
            _setFactor('af-pressure', 'af-pressure-val',
                _normalize(1085 - inputs.pressure, 0, 215),
                Math.round(inputs.pressure) + ' mb');

            _setFactor('af-wind', 'af-wind-val',
                _normalize(inputs.wind, 0, 80),
                Math.round(inputs.wind) + ' km/h');

            _setFactor('af-cloud', 'af-cloud-val',
                _normalize(inputs.cloud, 0, 100),
                Math.round(inputs.cloud) + '%');
        }
    });

    // Tomorrow's snapshot strip
    if (tomorrowDay) {
        const isCelsius = appState.isCelsius;
        const high = isCelsius
            ? Math.round(tomorrowDay.day.maxtemp_c) + '°'
            : Math.round(tomorrowDay.day.maxtemp_f) + '°';
        const low  = isCelsius
            ? Math.round(tomorrowDay.day.mintemp_c) + '°'
            : Math.round(tomorrowDay.day.mintemp_f) + '°';

        _setText('ai-tmr-high', high);
        _setText('ai-tmr-low',  low);
        _setText('ai-tmr-rain', (tomorrowDay.day.daily_chance_of_rain ?? 0) + '%');
        _setText('ai-tmr-wind', Math.round(tomorrowDay.day.maxwind_kph) + ' km/h');

        const iconEl = document.getElementById('ai-tomorrow-icon');
        if (iconEl && tomorrowDay.day.condition?.icon) {
            iconEl.src = 'https:' + tomorrowDay.day.condition.icon;
            iconEl.alt = tomorrowDay.day.condition.text;
        }
    }
}

// ── Helpers ───────────────────────────────────────────────

function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Smooth counter animation using requestAnimationFrame and cubic ease-out
function _countUp(id, target, duration) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = performance.now();
    function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        // Cubic ease-out: starts fast, decelerates at the end
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function _normalize(val, min, max) {
    return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
}

function _setFactor(barId, valId, percent, label) {
    const bar = document.getElementById(barId);
    const val = document.getElementById(valId);
    if (bar) bar.style.width = percent + '%';
    if (val) val.textContent = label;
}

// Show the card in offline/error state
function _setAIOffline() {
    const mod = document.getElementById('ai-prediction-module');
    if (mod) mod.setAttribute('data-risk', 'moderate');

    ['ai-result-display', 'ai-sub-message', 'ai-risk-label', 'ai-pct-num',
     'ai-tmr-high', 'ai-tmr-low', 'ai-tmr-rain', 'ai-tmr-wind',
     'af-temp-val', 'af-humidity-val', 'af-pressure-val', 'af-wind-val', 'af-cloud-val']
    .forEach(id => _setText(id,
        id === 'ai-result-display' ? 'Analysis Unavailable'
      : id === 'ai-sub-message'   ? 'Cannot reach the atmospheric analysis server.'
      : id === 'ai-risk-label'    ? 'Offline' : '--'));

    const gauge  = document.getElementById('ai-gauge-fill');
    const marker = document.getElementById('ai-spectrum-marker');
    if (gauge)  gauge.style.strokeDashoffset = GAUGE_CIRC;
    if (marker) marker.style.left = '0%';
    ['af-temp','af-humidity','af-pressure','af-wind','af-cloud'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.width = '0%';
    });
}

// ── Weather Data Fetch ────────────────────────────────────
// Main entry point for getting weather data. Hits our FastAPI proxy
// which caches results and keeps the WeatherAPI key off the client.
export async function fetchData(q) {
    if (!q || !q.toString().trim()) return;
    setLoadingState();

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 8000);

    try {
        const query    = encodeURIComponent(q.toString().trim());
        const response = await fetch(
            `${CONFIG.BASE_URL}/weather/forecast?q=${query}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'City not found.');

        appState.cache = data;
        updateHistory(data.location.name, fetchData);
        updateUI(data);
        renderHourlyForecast(data);
        renderForecastCard(data);
        manageAnimations(data);

        const tomorrow = data.forecast.forecastday[1] ?? data.forecast.forecastday[0];

        // Run AI prediction using tomorrow's conditions
        getAIPrediction(
            tomorrow.day.avgtemp_c,
            tomorrow.day.avghumidity,
            tomorrow.day.maxwind_kph,
            data.current.pressure_mb,
            tomorrow.day.daily_chance_of_rain ?? tomorrow.day.cloud ?? 50,
            tomorrow,
        );

    } catch (e) {
        clearTimeout(timeoutId);
        let errorMsg = '📍 Location not found.', locationMsg = 'Invalid Location';
        if (!navigator.onLine)           { errorMsg = '📶 No internet connection.'; locationMsg = 'Network Error'; }
        else if (e.name === 'AbortError'){ errorMsg = '⏱ Request timed out.';       locationMsg = 'Timeout'; }
        else if (e.message)              { errorMsg = e.message; }
        _setText('description',  errorMsg);
        _setText('city-display', locationMsg);
    }
}

// ── City Autocomplete ─────────────────────────────────────
// Returns city suggestions as the user types. Empty array on failure.
export async function fetchSuggestions(query) {
    if (!query || query.length < 3) return [];
    try {
        const r = await fetch(
            `${CONFIG.BASE_URL}/weather/search?q=${encodeURIComponent(query)}`
        );
        if (!r.ok) return [];
        return await r.json();
    } catch {
        return [];
    }
}