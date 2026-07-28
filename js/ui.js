import { appState } from './state.js';
import { renderWeatherGraph } from './graph.js';

// ── History Dock ──────────────────────────────────────────
// Renders the row of quick-access city buttons at the top of the card
export function renderHistory(onCityClick) {
    const dock = document.getElementById('city-dock');
    if (!dock) return;
    dock.innerHTML = '';
    appState.history.forEach(city => {
        const btn = document.createElement('button');
        btn.innerText = city;
        btn.setAttribute('aria-label', `Show weather for ${city}`);
        btn.addEventListener('click', () => onCityClick(city));
        dock.appendChild(btn);
    });
}

// Add or bump a city to the front of history, cap at 4 entries
export function updateHistory(newCity, onCityClick) {
    appState.history = appState.history.filter(c => c.toLowerCase() !== newCity.toLowerCase());
    appState.history.unshift(newCity);
    if (appState.history.length > 4) appState.history.pop();
    localStorage.setItem('weatherHistory', JSON.stringify(appState.history));
    renderHistory(onCityClick);
}

// ── Loading State ─────────────────────────────────────────
// Clears all dynamic values while a new city is being fetched
export function setLoadingState() {
    const placeholders = {
        'city-display':    'Loading...',
        'sub-location':    '',
        'description':     'Scanning the skies...',
        'temp':            '--',
        'feels-like':      '--',
        'hourly-forecast': '',
        'aqi':             '--',
        'uv-index':        '--',
        'humidity':        '--',
        'wind':            '--',
        'moon':            '--',
        'pressure':        '--',
    };
    Object.entries(placeholders).forEach(([id, text]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    });

    const msg = document.getElementById('weather-msg');
    if (msg) msg.style.display = 'none';

    const dailyContainer = document.getElementById('forecast-days-container');
    if (dailyContainer) dailyContainer.innerHTML = "<p class='forecast-placeholder'>Loading outlook...</p>";

    const graphContainer = document.getElementById('graph-container');
    if (graphContainer) graphContainer.innerHTML = '';

    const icon = document.getElementById('weather-icon');
    if (icon) icon.style.display = 'none';

    const flWrapper = document.getElementById('feels-like-wrapper');
    if (flWrapper) flWrapper.style.opacity = '0.4';
}

// ── Main UI Update ────────────────────────────────────────
// Populates all the card fields after a successful weather fetch
export function updateUI(data) {
    const { location, current } = data;

    // Update Local Time
    const timeSlot = document.getElementById('footer-time-slot');
    const timeText = document.getElementById('footer-local-time');
    if (timeSlot && timeText && location.localtime) {
        const timeStr = location.localtime.split(' ')[1]; // Extract "HH:MM"
        if (timeStr) {
            let [hour, minute] = timeStr.split(':');
            hour = parseInt(hour, 10);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            hour = hour % 12 || 12;
            timeText.innerText = `Local Time: ${hour}:${minute} ${ampm}`;
            timeSlot.style.display = 'inline-flex';
        }
    }

    const cityDisplay = document.getElementById('city-display');
    if (cityDisplay) cityDisplay.innerText = location.name;

    const subLocEl = document.getElementById('sub-location');
    if (subLocEl) {
        const parts = [];
        if (location.region?.trim() && location.region.toLowerCase() !== location.name.toLowerCase()) {
            parts.push(location.region);
        }
        if (location.country?.trim()) parts.push(location.country);
        subLocEl.innerText = parts.join(', ');
        subLocEl.title     = parts.join(', ');
    }

    const tempDisplay = document.getElementById('temp');
    if (tempDisplay) {
        tempDisplay.innerText = appState.isCelsius
            ? Math.round(current.temp_c) + '°'
            : Math.round(current.temp_f) + '°';
    }

    const feelsLikeEl = document.getElementById('feels-like');
    const flWrapper   = document.getElementById('feels-like-wrapper');
    if (feelsLikeEl) {
        feelsLikeEl.innerText = appState.isCelsius
            ? Math.round(current.feelslike_c) + '°'
            : Math.round(current.feelslike_f) + '°';
    }
    if (flWrapper) flWrapper.style.opacity = '';

    const descDisplay = document.getElementById('description');
    if (descDisplay) descDisplay.innerText = current.condition.text;

    // Use the 2x icon on high-DPI screens for sharper rendering
    const iconImg = document.getElementById('weather-icon');
    if (iconImg) {
        const baseUrl   = current.condition.icon.startsWith('http') ? current.condition.icon : 'https:' + current.condition.icon;
        iconImg.src     = window.devicePixelRatio >= 2
            ? baseUrl.replace('64x64', '128x128')
            : baseUrl;
        iconImg.style.display = 'block';
    }

    const precipInfo = document.getElementById('precip-info');
    if (precipInfo) {
        if (current.precip_mm > 0) {
            precipInfo.innerText     = `Precipitation: ${current.precip_mm} mm`;
            precipInfo.style.display = 'inline-block';
        } else {
            precipInfo.style.display = 'none';
        }
    }

    // Helper to avoid repetitive getElementById calls
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    set('humidity',  current.humidity + '%');
    set('wind',      current.wind_kph + ' km/h');
    set('uv-index',  current.uv);
    set('aqi',       current.air_quality ? Math.round(current.air_quality.pm2_5) : 'N/A');
    set('pressure',  current.pressure_mb + ' mb');

    if (data.forecast?.forecastday?.length > 0) {
        // Some locations (certain Australian cities, etc.) return forecastday
        // data without an astro block — guard against that so the rest of the
        // UI still renders normally and the moon field just shows '--'.
        const astro = data.forecast.forecastday[0].astro || {};
        set('moon',            astro.moon_phase || '--');
        set('sunrise-display', astro.sunrise    || '--');
        set('sunset-display',  astro.sunset     || '--');
    }

    triggerSunAnimation();
    
    // Update the new highly-useful header status with the actual API last_updated time
    const lastUpdateEl = document.getElementById('header-last-updated');
    if (lastUpdateEl && current.last_updated) {
        const textEl = lastUpdateEl.querySelector('.header-live-text');
        if (textEl) {
            // "2026-07-16 00:45" -> "00:45"
            const timeStr = current.last_updated.split(' ')[1] || current.last_updated;
            textEl.innerText = `Updated at ${timeStr}`;
        }
    }
}

// ── Sun Arc Animation ─────────────────────────────────────
// Re-plays the sunrise/sunset arc animations whenever new data arrives
function triggerSunAnimation() {
    const risePivot = document.getElementById('rise-pivot');
    const setPivot  = document.getElementById('set-pivot');
    if (!risePivot || !setPivot) return;

    // Force reflow between removing and re-applying the animation
    risePivot.style.animation = 'none';
    setPivot.style.animation  = 'none';
    void risePivot.offsetWidth;
    void setPivot.offsetWidth;

    risePivot.style.animation = 'riseArc 2.5s ease-out forwards';
    setPivot.style.animation  = 'setArc  2.5s ease-out forwards';
}

// ── 24-Hour Forecast Scroll ───────────────────────────────
// Builds the horizontal scrollable hourly strip using a DocumentFragment
// so the DOM is only touched once rather than once per hour card
export function renderHourlyForecast(data) {
    const slider = document.getElementById('hourly-forecast');
    if (!slider) return;
    slider.innerHTML = '';

    const allHours = [
        ...(data.forecast.forecastday[0]?.hour || []),
        ...(data.forecast.forecastday[1]?.hour || []),
    ];
    const currentEpoch = data.location.localtime_epoch;
    const next12       = allHours.filter(h => h.time_epoch >= currentEpoch).slice(0, 12);

    if (next12.length === 0) {
        slider.innerHTML = "<p style='opacity:0.5;font-size:0.8rem;'>No hourly data available.</p>";
        return;
    }

    const fragment = document.createDocumentFragment();

    next12.forEach(hourData => {
        const timeDate = new Date(hourData.time);
        let   hours    = timeDate.getHours();
        const ampm     = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const timeString = `${hours} ${ampm}`;

        const temp    = appState.isCelsius
            ? Math.round(hourData.temp_c) + '°C'
            : Math.round(hourData.temp_f) + '°F';
        const precip  = hourData.precip_mm;
        const iconUrl = hourData.condition.icon.startsWith('http') ? hourData.condition.icon : 'https:' + hourData.condition.icon;

        const card = document.createElement('div');
        card.className = 'hour-card';
        card.setAttribute('role', 'listitem');
        card.setAttribute('aria-label', `${timeString}: ${temp}, ${hourData.condition.text}`);

        card.innerHTML = `
            <span class="time">${timeString}</span>
            <img src="${iconUrl}" alt="${hourData.condition.text}" loading="lazy" width="30" height="30">
            <span class="hour-temp">${temp}</span>
            ${precip > 0 ? `<span class="hour-precip">${precip}mm</span>` : ''}
        `;
        fragment.appendChild(card);
    });

    slider.appendChild(fragment);
}

// ── Multi-Day Forecast Card ───────────────────────────────
// Works with 3-day (free plan) or up to 7-day (premium) without changes.
// Interactivity (click expand, keyboard, swipe) is set up once via event
// delegation on the container, so re-renders don't re-attach listeners.

let _activeDayIndex       = -1;
let _forecastDaysCount    = 0;
let _isInteractivitySetup = false;

export function renderForecastCard(data) {
    const container = document.getElementById('forecast-days-container');
    if (!container) return;
    container.innerHTML = '';
    _activeDayIndex = -1;

    // When innerHTML is cleared, the MutationObserver in ai-manager.js
    // never fires because it only watches attribute changes — not node removal.
    // So if a day was expanded before the city changed, .ai-sunken gets stuck
    // on the AI module. Remove it explicitly here since no day is expanded
    // after a fresh render.
    const aiModule = document.getElementById('ai-prediction-module');
    if (aiModule) aiModule.classList.remove('ai-sunken');

    const days = data.forecast.forecastday.slice(0, 7);
    if (days.length === 0) {
        container.innerHTML = "<p class='forecast-placeholder'>No forecast data available.</p>";
        return;
    }

    _forecastDaysCount = days.length;

    const globalMin = Math.min(...days.map(d => appState.isCelsius ? d.day.mintemp_c : d.day.mintemp_f));
    const globalMax = Math.max(...days.map(d => appState.isCelsius ? d.day.maxtemp_c : d.day.maxtemp_f));
    const tempRange = (globalMax - globalMin) || 1;

    const fragment = document.createDocumentFragment();

    days.forEach((dayData, index) => {
        const date     = new Date(dayData.date);
        const dayLabel = index === 0
            ? 'Today'
            : date.toLocaleDateString('en-US', { weekday: 'short' });
        const fullDate = date.toLocaleDateString('en-US', {
            weekday: 'long', month: 'short', day: 'numeric',
        });

        const icon       = dayData.day.condition.icon.startsWith('http') ? dayData.day.condition.icon : 'https:' + dayData.day.condition.icon;
        const min        = Math.round(appState.isCelsius ? dayData.day.mintemp_c : dayData.day.mintemp_f);
        const max        = Math.round(appState.isCelsius ? dayData.day.maxtemp_c : dayData.day.maxtemp_f);
        const avg        = Math.round(appState.isCelsius ? dayData.day.avgtemp_c : dayData.day.avgtemp_f);
        const rainChance = dayData.day.daily_chance_of_rain;
        const condText   = dayData.day.condition.text;
        const wind       = Math.round(dayData.day.maxwind_kph);
        const humidity   = dayData.day.avghumidity;
        const uv         = Math.round(dayData.day.uv || 0);
        const vis        = Math.round(dayData.day.avgvis_km || 0);

        const leftPercent  = ((min - globalMin) / tempRange) * 100;
        const widthPercent = ((max - min)       / tempRange) * 100;

        const prevLabel = index > 0
            ? (index === 1 ? 'Today' : new Date(days[index - 1].date).toLocaleDateString('en-US', { weekday: 'short' }))
            : null;
        const nextLabel = index < days.length - 1
            ? new Date(days[index + 1].date).toLocaleDateString('en-US', { weekday: 'short' })
            : null;

        // Summary row (collapsed state)
        const row = document.createElement('div');
        row.className = 'fday-row';
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-expanded', 'false');
        row.setAttribute('aria-controls', `fday-detail-${index}`);
        row.setAttribute('data-day-index', String(index));
        row.setAttribute('aria-label', `${dayLabel}: ${condText}, low ${min}°, high ${max}°. Press to expand.`);
        row.style.animationDelay = `${index * 0.08}s`;

        const condShort = condText.length > 20 ? condText.slice(0, 18) + '…' : condText;

        row.innerHTML = `
            <div class="fday-left">
                <span class="fday-name">${dayLabel}</span>
                <span class="fday-desc" title="${condText}">${condShort}</span>
            </div>
            <div class="fday-center">
                <img src="${icon}" alt="${condText}" class="fday-img" loading="lazy" width="40" height="40">
                ${rainChance > 0 ? `<span class="fday-rain">💧 ${rainChance}%</span>` : ''}
            </div>
            <div class="fday-right">
                <div class="fday-temps">
                    <span class="fday-min">${min}°</span>
                    <div class="fday-bar-bg" role="img" aria-label="Temperature range bar">
                        <div class="fday-bar-fill" style="left:${leftPercent}%;width:${Math.max(widthPercent, 8)}%;"></div>
                    </div>
                    <span class="fday-max">${max}°</span>
                </div>
                <div class="fday-stats">
                    <span><i class="material-icons" aria-hidden="true">air</i>${wind} km/h</span>
                    <span><i class="material-icons" aria-hidden="true">water_drop</i>${humidity}%</span>
                </div>
            </div>
            <span class="fday-chevron material-icons" aria-hidden="true">expand_more</span>
        `;

        // Hourly strip inside the expanded detail panel
        let hourlyHtml = `<div class="detail-hourly-wrapper" role="list" aria-label="Hourly forecast for ${fullDate}">`;
        if (dayData.hour?.length > 0) {
            // Show every other hour to keep the strip compact
            dayData.hour.forEach((h, i) => {
                if (i % 2 === 0) {
                    const time  = new Date(h.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    const hTemp = Math.round(appState.isCelsius ? h.temp_c : h.temp_f);
                    const hIcon = h.condition.icon.startsWith('http') ? h.condition.icon : 'https:' + h.condition.icon;
                    hourlyHtml += `
                        <div class="detail-hour-card" role="listitem" aria-label="${time}: ${hTemp}°, ${h.condition.text}">
                            <span class="detail-hour-time">${time}</span>
                            <img class="detail-hour-img" src="${hIcon}" alt="${h.condition.text}" loading="lazy" width="26" height="26">
                            <span class="detail-hour-temp">${hTemp}°</span>
                        </div>`;
                }
            });
        } else {
            hourlyHtml += `<span style="opacity:0.5;font-size:0.75rem;padding:8px 0;">No hourly data available.</span>`;
        }
        hourlyHtml += `</div>`;

        // Sunrise / sunset row — use empty object fallback so locations that
        // don't return an astro block show '--' instead of crashing the render
        const astro     = dayData.astro || {};
        const astroHtml = `
            <div class="detail-astro" aria-label="Sunrise and sunset times">
                <div class="detail-astro-item">
                    <span class="material-icons" style="color:#FFD700;" aria-hidden="true">wb_twilight</span>
                    <div>
                        <span class="detail-astro-label">Sunrise</span>
                        <span class="detail-astro-val">${astro.sunrise || '--'}</span>
                    </div>
                </div>
                <div class="detail-astro-item">
                    <span class="material-icons" style="color:#FF8C00;" aria-hidden="true">nights_stay</span>
                    <div>
                        <span class="detail-astro-label">Sunset</span>
                        <span class="detail-astro-val">${astro.sunset || '--'}</span>
                    </div>
                </div>
            </div>`;

        // Expanded detail panel
        const detail = document.createElement('div');
        detail.className = 'fday-detail';
        detail.id        = `fday-detail-${index}`;
        detail.setAttribute('aria-hidden', 'true');
        detail.setAttribute('role', 'region');
        detail.setAttribute('aria-label', `Detailed forecast for ${fullDate}`);

        detail.innerHTML = `
            <div class="fday-detail-header">
                <span class="fdd-date">${fullDate}</span>
            </div>
            <div class="fday-detail-grid">
                <div class="fday-detail-stat">
                    <span class="material-icons" style="color:#ff8c50">thermostat</span>
                    <span class="fdd-label">Avg Temp</span>
                    <span class="fdd-val">${avg}°</span>
                </div>
                <div class="fday-detail-stat">
                    <span class="material-icons" style="color:#4facfe">water_drop</span>
                    <span class="fdd-label">Humidity</span>
                    <span class="fdd-val">${humidity}%</span>
                </div>
                <div class="fday-detail-stat">
                    <span class="material-icons" style="color:#00f2fe">umbrella</span>
                    <span class="fdd-label">Rain</span>
                    <span class="fdd-val">${rainChance}%</span>
                </div>
                <div class="fday-detail-stat">
                    <span class="material-icons" style="color:#ffeb3b">wb_sunny</span>
                    <span class="fdd-label">UV Index</span>
                    <span class="fdd-val">${uv}</span>
                </div>
                <div class="fday-detail-stat">
                    <span class="material-icons" style="color:rgba(255,255,255,0.75)">air</span>
                    <span class="fdd-label">Max Wind</span>
                    <span class="fdd-val">${wind} km/h</span>
                </div>
                <div class="fday-detail-stat">
                    <span class="material-icons" style="color:rgba(255,255,255,0.75)">visibility</span>
                    <span class="fdd-label">Visibility</span>
                    <span class="fdd-val">${vis} km</span>
                </div>
            </div>
            ${hourlyHtml}
            ${astroHtml}
            <div class="fday-nav">
                ${prevLabel
                    ? `<button class="fday-nav-btn" data-target="${index - 1}" aria-label="Previous day: ${prevLabel}">
                           <span class="material-icons">chevron_left</span>${prevLabel}
                       </button>`
                    : '<span></span>'}
                ${nextLabel
                    ? `<button class="fday-nav-btn" data-target="${index + 1}" aria-label="Next day: ${nextLabel}">
                           ${nextLabel}<span class="material-icons">chevron_right</span>
                       </button>`
                    : '<span></span>'}
            </div>
            <p class="swipe-hint">← swipe to navigate days →</p>
        `;

        const wrapper = document.createElement('div');
        wrapper.className = 'fday-wrapper';
        wrapper.appendChild(row);
        wrapper.appendChild(detail);
        fragment.appendChild(wrapper);
    });

    container.appendChild(fragment);

    // Event delegation is set up once and reused across unit-toggle re-renders.
    // We don't re-attach listeners because the container element persists.
    if (!_isInteractivitySetup) {
        _setupForecastInteractivity(container);
        _isInteractivitySetup = true;
    }

    renderWeatherGraph(data);
}

// ── Forecast Expand / Collapse ────────────────────────────

function _openDay(container, index) {
    if (index === _activeDayIndex) {
        _closeDay(container, index);
        return;
    }
    if (_activeDayIndex >= 0) _closeDay(container, _activeDayIndex);

    _activeDayIndex = index;
    const row    = container.querySelector(`[data-day-index="${index}"]`);
    const detail = document.getElementById(`fday-detail-${index}`);
    if (!row || !detail) return;

    row.classList.add('fday-active');
    row.setAttribute('aria-expanded', 'true');
    detail.classList.add('fday-detail-open');
    detail.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
}

function _closeDay(container, index) {
    if (index < 0) return;
    const row    = container.querySelector(`[data-day-index="${index}"]`);
    const detail = document.getElementById(`fday-detail-${index}`);
    if (row)    { row.classList.remove('fday-active'); row.setAttribute('aria-expanded', 'false'); }
    if (detail) { detail.classList.remove('fday-detail-open'); detail.setAttribute('aria-hidden', 'true'); }
    if (_activeDayIndex === index) _activeDayIndex = -1;
}

// Click delegation handles both row taps and the prev/next nav buttons
function _setupForecastInteractivity(container) {
    container.addEventListener('click', e => {
        const navBtn = e.target.closest('.fday-nav-btn');
        if (navBtn) {
            e.stopPropagation();
            _openDay(container, parseInt(navBtn.dataset.target, 10));
            return;
        }
        const row = e.target.closest('.fday-row');
        if (row) {
            e.stopPropagation();
            _openDay(container, parseInt(row.dataset.dayIndex, 10));
        }
    });

    container.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const row = e.target.closest('.fday-row');
        if (row) {
            e.preventDefault();
            _openDay(container, parseInt(row.dataset.dayIndex, 10));
        }
    });

    // Swipe left/right to move between expanded day details
    let swipeTouchStartX = 0;
    let swipeTouchStartY = 0;

    container.addEventListener('touchstart', e => {
        swipeTouchStartX = e.touches[0].clientX;
        swipeTouchStartY = e.touches[0].clientY;
    }, { passive: true });

    container.addEventListener('touchend', e => {
        if (_activeDayIndex < 0) return;
        const dx = e.changedTouches[0].clientX - swipeTouchStartX;
        const dy = Math.abs(e.changedTouches[0].clientY - swipeTouchStartY);
        if (Math.abs(dx) < 60 || dy > 40) return;
        if (dx < 0 && _activeDayIndex < _forecastDaysCount - 1) {
            _openDay(container, _activeDayIndex + 1);
        } else if (dx > 0 && _activeDayIndex > 0) {
            _openDay(container, _activeDayIndex - 1);
        }
    }, { passive: true });
}