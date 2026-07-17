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
    mod.style.animationPlayState = 'running';

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
// Main entry point for fetching weather. Hits our FastAPI proxy which
// caches results and keeps the WeatherAPI key off the client.
//
// IMPORTANT — two separate try/catch blocks on purpose:
//
//   Block 1 (network): handles fetch failures, timeouts, bad city names,
//   and non-2xx responses. Shows user-facing error messages on failure.
//
//   Block 2 (rendering): wraps all UI update calls. Some locations return
//   weather data that is missing optional fields (e.g. moon_phase for
//   certain regions). Without this separation, a crash inside updateUI()
//   would bubble up to the network catch and incorrectly show
//   "Invalid Location" even though the fetch fully succeeded.
//   Rendering errors are logged to the console only — the user still
//   sees whatever parts of the UI rendered successfully.
//
// Cold-start handling:
//   Render's free tier sleeps after ~10 min of inactivity. First request
//   after sleep can take 30-40 seconds. We give it 50s before aborting,
//   and show a calm waiting message after 7s so the user knows to hang tight.
export async function fetchData(q) {
    setLoadingState();

    const controller = new AbortController();

    // Hard limit of 50s — covers worst-case cold starts on Render free tier
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    // After 7s with no response, show a neutral waiting notice.
    // Neutral wording covers both a cold-starting server AND a slow mobile
    // connection — we can't tell which from the client side, so we don't guess.
    const warmingTimer = setTimeout(() => {
        _setText('city-display', 'Please Wait…');
        _setText('description',  '⏳ Taking longer than usual. This can happen on the first load or on a slow connection — please hang tight.');
    }, 7000);

    // ── Block 1: Network / fetch errors ──────────────────
    let data;
    try {
        const url = (q && q.toString().trim())
            ? `${CONFIG.BASE_URL}/weather/forecast?q=${encodeURIComponent(q.toString().trim())}`
            : `${CONFIG.BASE_URL}/weather/forecast`;
            
        const response = await fetch(url, { signal: controller.signal });

        // Server responded — cancel both timers.
        // clearTimeout on an already-fired timer is safe (no-op).
        clearTimeout(timeoutId);
        clearTimeout(warmingTimer);

        data = await response.json();

        // Non-2xx means wrong city name or a structured API error
        if (!response.ok) throw new Error(data.error?.message || 'City not found.');

    } catch (e) {
        // Clean up timers on every error path
        clearTimeout(timeoutId);
        clearTimeout(warmingTimer);

        let errorMsg    = '📍 Location not found. Please check the city name and try again.';
        let locationMsg = 'Not Found';

        if (!navigator.onLine) {
            // Device has no network connectivity at all
            errorMsg    = '📶 No internet connection. Please check your Wi-Fi or mobile data and try again.';
            locationMsg = 'No Internet';

        } else if (e.name === 'AbortError') {
            // 50s timeout fired — server never responded in time.
            // Almost always means the server finished waking up during the
            // wait, so a second search will succeed instantly.
            errorMsg    = '🔄 Connection timed out. The server should be ready now — please search your city once more.';
            locationMsg = 'Try Again';

        } else if (e.message) {
            // Covers wrong city name (WeatherAPI error) and unexpected errors
            errorMsg = e.message;
        }

        _setText('description',  errorMsg);
        _setText('city-display', locationMsg);
        return; // stop here — no data to render
    }

    // ── Block 2: UI rendering errors ─────────────────────
    // The fetch succeeded and data is valid. Render everything.
    // Each call is guarded individually so one broken field (e.g. a missing
    // moon_phase for some locations) cannot crash the others or make the
    // app show "Invalid Location" when the city was found perfectly fine.
    appState.cache = data;
    if (!data.current || !data.current.temp_c || !data.forecast?.forecastday?.length) {
            _setText('city-display', 'Service Unavailable');
            _setText('description', '🌤️ Our weather service is temporarily unavailable. This is not an issue with the app — please try again in a few minutes!.');
            return;
        }
    updateHistory(data.location.name, fetchData);

    try { updateUI(data); }
    catch (err) { console.warn('updateUI error (non-critical):', err.message); }

    try { renderHourlyForecast(data); }
    catch (err) { console.warn('renderHourlyForecast error (non-critical):', err.message); }

    try { renderForecastCard(data); }
    catch (err) { console.warn('renderForecastCard error (non-critical):', err.message); }

    // Render Auto-Location & Alerts
    try {
        const locSlot = document.getElementById('footer-location-slot');
        const mainCardAlert = document.getElementById('main-card-alert');

        const allAlerts = data.alerts?.alert || [];
        
        if (allAlerts.length > 0) {
            // 1. ALWAYS show the most critical alert in the warning pill
            const currentAlert = allAlerts[0];
            const headline = currentAlert.headline || currentAlert.event || 'Weather Alert';
            
            if (mainCardAlert) {
                document.getElementById('main-card-alert-text').textContent = headline;
                mainCardAlert.classList.add('show');
                
                // Add click listener to open the dedicated alert page
                mainCardAlert.onclick = () => {
                    sessionStorage.setItem('windly_alert_headline', headline);
                    sessionStorage.setItem('windly_alert_desc', currentAlert.desc || headline);
                    sessionStorage.setItem('windly_alert_instruction', currentAlert.instruction || '');
                    window.open('alert.html', '_blank');
                };
            }

            // 2. Check if ANY alert is severe enough to trigger the red emergency background
            const isSevereEmergency = allAlerts.some(alert => {
                const sev = (alert.severity || '').toLowerCase();
                const head = (alert.headline || '').toLowerCase();
                const event = (alert.event || '').toLowerCase();
                
                // EXPLICITLY IGNORE SAFE/MINOR ALERTS FIRST
                // Even if the API calls it a "Warning" or "Moderate", if it's explicitly "Green" or "Yellow" (or "Grüne"), it's safe!
                if (sev === 'minor' || head.includes('green') || head.includes('grüne') || head.includes('yellow') || head.includes('gelbe')) {
                    return false;
                }
                
                // Check API severity fields (Adding 'moderate' as requested)
                if (sev === 'severe' || sev === 'extreme' || sev === 'moderate') return true;
                
                // Fallback: Check for emergency keywords
                if (head.includes('red ') || head.includes('orange ') || head.includes('warning') || head.includes('warnung') || head.includes('emergency') || head.includes('severe')) return true;
                if (event.includes('warning') || event.includes('warnung') || event.includes('emergency')) return true;
                
                return false;
            });
            
            // 3. App-Wide Background State & Pill Styling
            if (isSevereEmergency) {
                document.body.classList.add('severe-weather-alert');
            } else {
                document.body.classList.remove('severe-weather-alert');
            }

            // Determine specific color theme for the warning pill based on the alert
            let pillColorClass = 'red'; // default for severe
            const headStr = headline.toLowerCase();
            const sevStr = (currentAlert.severity || '').toLowerCase();
            
            if (headStr.includes('green') || headStr.includes('grüne') || sevStr === 'minor') {
                pillColorClass = 'green';
            } else if (headStr.includes('yellow') || headStr.includes('gelb')) {
                pillColorClass = 'yellow';
            } else if (headStr.includes('orange')) {
                pillColorClass = 'orange';
            }
            
            if (mainCardAlert) {
                // Clear any previous color classes
                mainCardAlert.classList.remove('red', 'orange', 'yellow', 'green', 'advisory');
                mainCardAlert.classList.add(pillColorClass);
            }
            
            // 4. Keep the footer slot showing the IP location
            if (locSlot) {
                locSlot.innerHTML = `
                    <span class="material-icons slot-icon">my_location</span>
                    <span class="slot-text">${data.location.name}, ${data.location.country} (IP Synced)</span>
                `;
            }
            
        } else {
            // No alerts — perfectly safe state
            document.body.classList.remove('severe-weather-alert');
            if (mainCardAlert) {
                mainCardAlert.className = 'main-card-alert-pill'; // Reset to base classes only
            }
            
            if (locSlot) {
                locSlot.innerHTML = `
                    <span class="material-icons slot-icon">my_location</span>
                    <span class="slot-text">${data.location.name}, ${data.location.country} (IP Synced)</span>
                `;
            }
        }
    } catch (err) { console.warn('alert render error:', err.message); }

    try { manageAnimations(data); }
    catch (err) { console.warn('manageAnimations error (non-critical):', err.message); }

    const tomorrow = data.forecast.forecastday[1] ?? data.forecast.forecastday[0];

    // Run AI prediction using tomorrow's forecast conditions
    getAIPrediction(
        tomorrow.day.avgtemp_c,
        tomorrow.day.avghumidity,
        tomorrow.day.maxwind_kph,
        data.current.pressure_mb ?? 1013,
        tomorrow.day.daily_chance_of_rain ?? tomorrow.day.cloud ?? 50,
        tomorrow,
    );
}

// ── Premium Fuzzy Spell Check for Top Cities ───────────────
const COMMON_CITIES = [
    "London", "New York", "Paris", "Tokyo", "Sydney", "Berlin", "Los Angeles", 
    "Chicago", "Toronto", "Dubai", "Rome", "Madrid", "Beijing", "Mumbai", 
    "Moscow", "Cairo", "Seoul", "Jakarta", "Mexico City", "Istanbul", 
    "Shanghai", "Delhi", "Bangkok", "Houston", "Dallas", "Singapore", 
    "Washington", "Barcelona", "Atlanta", "Miami", "Seattle", "Boston", 
    "Melbourne", "Montreal", "Amsterdam", "Vienna", "Prague", "Stockholm", 
    "Dublin", "Athens", "Munich", "Frankfurt", "Zurich", "Geneva",
    "San Francisco", "Las Vegas", "Orlando", "Denver", "Austin", "Kolkata"
];

function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function getFuzzyCorrection(query) {
    const q = query.toLowerCase();
    let best = null;
    let minD = 3; // Max typo severity to auto-correct
    for (const city of COMMON_CITIES) {
        const c = city.toLowerCase();
        if (Math.abs(c.length - q.length) > 2) continue;
        const d = levenshtein(q, c);
        if (d < minD) {
            minD = d;
            best = city;
            if (d === 1) break; // Perfect fuzzy match
        }
    }
    return best;
}

// ── City Autocomplete ─────────────────────────────────────
// Returns city suggestions as the user types. Implements premium fuzzy fallback.
export async function fetchSuggestions(query, isRetry = false) {
    if (!query || query.length < 3) return [];
    try {
        const r = await fetch(
            `${CONFIG.BASE_URL}/weather/search?q=${encodeURIComponent(query)}`
        );
        if (!r.ok) return [];
        const results = await r.json();
        
        // Premium feature: If 0 results on a typo, auto-correct and try once more
        if (results.length === 0 && !isRetry && query.length >= 4) {
            const corrected = getFuzzyCorrection(query);
            if (corrected && corrected.toLowerCase() !== query.toLowerCase()) {
                return await fetchSuggestions(corrected, true); // Recursive retry with correct spelling
            }
        }
        
        return results;
    } catch {
        return [];
    }
}