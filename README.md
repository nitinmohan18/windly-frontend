# 🌬️ Windly — Feel the Weather Breathe.

> *A cinematic, AI-powered weather experience built for the modern web.*

**Live Demo:** [windly-weather.vercel.app](https://windly-weather.vercel.app) &nbsp;|&nbsp; **Backend:** [windly-backend](https://github.com/nitinmohan18/windly-backend) &nbsp;|&nbsp; **Status:** ![Deployed](https://img.shields.io/badge/deployed-live-brightgreen) ![Vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![No Build Step](https://img.shields.io/badge/build%20step-none-blue)

---

## 🌊 About Windly

Most weather apps show you numbers. Windly makes you **feel** the weather.

Every condition — a thunderstorm rolling in, a heatwave baking the afternoon, a clear starlit night — is translated into a living, breathing visual experience. Rain falls across your screen. Lightning flickers in the dark. The sky shifts gradients as the sun traces its arc. An ML model reads the atmosphere and tells you what's coming before it arrives.

Windly was built on a simple idea: **weather is cinematic, and your app should be too.**

No frameworks. No bloat. Just the browser, raw JavaScript, and a backend doing real machine learning.

---

## ✨ Features

### 🤖 Atmospheric Intelligence
A Random Forest ML model analyses 5 real atmospheric inputs — temperature, humidity, pressure, wind speed, and cloud cover — and returns a calibrated rain probability. The result is visualised as a live animated gauge, a spectrum risk marker, and individual contributing factor bars, all updating in a single `requestAnimationFrame` pass to avoid layout thrashing.

### 🎬 Cinematic Weather Stage
A full-screen GPU-composited stage renders the weather as it actually feels:
- **Rain** — individual drop elements with tilted variants for wind-driven storms
- **Snow** — drifting flake particles with sinusoidal horizontal sway
- **Lightning** — full-screen flash overlay + SVG bolt strikes with double-flash timing
- **Wind** — flowing gradient lines blowing across the viewport
- **Heat** — a pulsating blazing sun corona fixed in the corner
- **Night** — animated shooting stars across a deep space gradient

### 🎨 Dynamic Weather Themes
The entire UI repaints to match the sky: `sunny`, `sunny-extreme`, `rainy`, `cloudy`, `night`, `snowy`, `stormy-dark`, and `stargazer`. Background gradients, card tones, and text contrast all shift as one.

### ☀️ Sun Arc Tracker
A real-time sunrise-to-sunset arc animates the sun's current position across the sky, calculated from the API's actual sunrise and sunset timestamps.

### 📡 Smart City Autocomplete
City suggestions appear as you type, debounced and cached for 15 minutes on the backend. Results never duplicate and degrade gracefully on network failure.

### 🔊 Ambient Sound Design
Weather-matched audio — heavy rain, light rain, thunder, wind, birds, crickets, snow footsteps, water drops — toggled by a single button and tied to live condition flags in app state.

### 📊 Hourly & 7-Day Forecast
An interactive graph and a 7-day expandable forecast card, with flip-in row animations and collapsible day detail panels.

### 🌡️ Live Unit Toggle
Switch between °C and °F instantly — every displayed value, including the AI card factor bars, recalculates without a network call.

### 📱 Mobile-First Responsive
Breakpoints at 1050px, 768px, and 480px. The AI card repositions itself between desktop and mobile layouts at runtime via a `MutationObserver`. Safe-area insets support notched iPhones. Reduced-motion media queries respected throughout.

---

## 💡 Why Vanilla JavaScript?

Windly is built without React, Vue, or any framework — and that's a deliberate engineering choice, not a limitation.

| Advantage | Detail |
|---|---|
| **Zero build step** | No Webpack, Vite, or compiler. Open `index.html` and it runs. |
| **Direct browser performance** | No VDOM diff overhead. DOM updates happen exactly when and where needed. |
| **Lightweight delivery** | No framework runtime shipped to the client. The entire JS payload is your app. |
| **Trivial deployment** | Any static host works — Vercel, Netlify, GitHub Pages, or a plain CDN. |
| **Full control** | Animation timing, DOM batching, and render cycles are owned entirely by the app, not a framework scheduler. |

ES Modules (`import`/`export`) give clean code organisation without the complexity of a bundler.

---

## ⚡ Performance Engineering

Windly treats the browser's rendering pipeline as a first-class concern. Every animation-heavy feature was profiled and optimised.

### GPU Compositing
The weather stage uses `contain: strict` so all particle repaints are isolated from the rest of the page — a layout change inside the stage cannot trigger a full-page reflow. Individual particles carry `will-change: transform` so the browser promotes them to dedicated compositor layers, keeping animations on the GPU thread.

### RequestAnimationFrame Batching
All visual updates on the AI card — the gauge arc, spectrum marker, and five factor bars — are batched into a **single `requestAnimationFrame` call**. Spreading them across separate frames would cause multiple style recalculations per paint cycle. One frame = one pass = no jank.

### Smooth Counters
The probability percentage counter uses a **cubic ease-out** easing function inside `requestAnimationFrame`, not `setInterval`. This produces silky 60fps deceleration rather than mechanical ticking.

### Mobile Particle Reduction
On screens ≤768px, `backdrop-filter` blur radius is halved, the sun corona is downsized, and cloud particle blur is reduced from 25px to 18px. Mid-range Android GPUs handle these passes significantly better without a visible quality loss.

### Passive Event Listeners
Scroll and touch listeners are registered as `{ passive: true }` so the browser never waits on JavaScript before committing a scroll frame — critical for smooth mobile interactions.

### Cold-Start Resilience
Render's free tier sleeps after ~10 minutes of inactivity. Windly handles this with a 50-second `AbortController` timeout and a neutral waiting message shown after 7 seconds — so users aren't left staring at a blank screen wondering if the app is broken.

---

## 🗂️ File Structure

```
frontend/
├── index.html
├── style.css                   # Imports all CSS modules
├── css/
│   ├── base.css                # Reset, typography, body
│   ├── themes.css              # Weather-driven backgrounds + safe-area insets
│   ├── layout.css              # Responsive grid & breakpoints (1050 / 768 / 480px)
│   ├── components.css          # Cards, buttons, inputs, forecast rows
│   ├── animations.css          # Particle keyframes, lightning, sun, shooting stars
│   └── enhancements.css        # Polish & micro-interactions
├── js/
│   ├── main.js                 # Entry point, event listeners
│   ├── api.js                  # Weather fetch, AI prediction, error handling
│   ├── ui.js                   # DOM rendering — conditions, forecast, hourly
│   ├── state.js                # Global app state (single source of truth)
│   ├── config.js               # Base URL — dev/prod auto-detection
│   ├── features.js             # Particle spawning, ambient sound, animation flags
│   ├── graph.js                # Hourly temperature/rain graph
│   └── ai-manager.js           # AI card desktop↔mobile placement + collapse observer
└── sound/
    ├── heavy-rain.mp3
    ├── light-rain.mp3
    ├── thunder.mp3
    ├── wind.mp3
    ├── bird.mp3
    ├── crickets.mp3
    ├── water-drop.mp3
    └── floraphonic-foot-step-snow-*.mp3
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────┐
│         User's Browser          │
│   Vanilla JS + CSS (Vercel)     │
└────────────────┬────────────────┘
                 │ HTTPS
                 ▼
┌─────────────────────────────────┐
│      FastAPI Backend (Render)   │
│  • WeatherAPI proxy (TTL cache) │
│  • /predict — ML inference      │
│  • GZip compression             │
│  • Shared async httpx client    │
└──────────┬──────────────┬───────┘
           │              │
           ▼              ▼
┌──────────────┐  ┌───────────────────┐
│  WeatherAPI  │  │  Random Forest    │
│  (forecast,  │  │  Classifier       │
│   search)    │  │  (random_forest   │
│              │  │   .pkl — sigmoid  │
│              │  │   calibrated)     │
└──────────────┘  └───────────────────┘
```

The frontend never touches WeatherAPI directly — all calls go through the FastAPI proxy, which handles caching, key security, and error normalisation.

---

## 📸 Screenshots & Preview

| | |
|---|---|
| **Desktop UI** | ![Desktop UI](screenshots/desktop.png) |
| **Mobile UI** | ![Mobile UI](screenshots/mobile.png) |
| **AI Atmospheric Analysis Card** | ![AI Card](screenshots/ai-card.png) |
| **Hourly Forecast Graph** | ![Graph](screenshots/graph.png) |
| **Storm Theme** | ![Storm](screenshots/storm-theme.png) |
| **Night / Stargazer Theme** | ![Night](screenshots/night-theme.png) |

---

## 📱 Mobile & Accessibility

Windly is built mobile-first, not mobile-adapted.

- **Safe-area insets** — `env(safe-area-inset-*)` padding on all sides for notched iPhones (iPhone X+) and Android. Requires `viewport-fit=cover` in the meta tag.
- **Three responsive breakpoints** — 1050px (tablet/small laptop), 768px (mobile), 480px (small phone). Each breakpoint has intentional layout changes, not just scaled-down desktop styles.
- **Touch-optimised interactions** — hover states are disabled on touch screens (`pointer: none` guard). The AI card relocates to the Forecast tab panel on mobile so it's always visible in context.
- **Reduced-motion support** — `@media (prefers-reduced-motion: reduce)` disables all particle animations and shortens transitions. The app remains fully functional; it just stops moving.
- **OLED battery consideration** — The `stormy-dark` theme lightens slightly on mobile to reduce pure-black pixel stress on OLED screens during long sessions.

---

## 🚀 Running Locally

No build step. No package install. Just serve and run.

```bash
# Clone the repo
git clone https://github.com/nitinmohan18/windly-frontend.git
cd windly-frontend

# Serve with any static server
npx serve .
```

Open `http://localhost:3000`. That's it.

> The [backend](https://github.com/nitinmohan18/windly-backend) should be running on port `8000` locally. `config.js` points there automatically when it detects `localhost`.

---

## ⚙️ Configuration

`js/config.js` auto-detects environment — no `.env` file needed on the frontend:

```js
const isDev = location.hostname === 'localhost'
           || location.hostname === '127.0.0.1'
           || location.hostname.startsWith('192.168.')
           ...

export const CONFIG = {
    BASE_URL: isDev
        ? `http://${location.hostname}:8000`      // local FastAPI
        : 'https://windly-backend.onrender.com',  // production
};
```

---

## 🌐 Deployment

### Frontend → Vercel

1. Push this repo to GitHub
2. Import on [Vercel](https://vercel.com)
3. **No build command** — set output directory to `.` (root)
4. Deploy

Vercel serves the static files directly. All API calls route to the Render backend via `config.js`.

---

## 🛠️ Tech Stack

### Frontend
| | |
|---|---|
| Language | Vanilla JavaScript (ES Modules) |
| Styling | CSS3 — modular, no preprocessor |
| Animations | CSS keyframes + `requestAnimationFrame` |
| State | Single shared `appState` object (no store library) |
| Build | None — runs directly in the browser |

### Backend
| | |
|---|---|
| Framework | FastAPI |
| Server | Uvicorn |
| HTTP Client | httpx (async, connection-pooled) |
| Caching | In-memory TTL dict (5 min forecast, 15 min search) |
| Compression | GZipMiddleware (≥500 byte responses) |

### Machine Learning
| | |
|---|---|
| Algorithm | Random Forest Classifier |
| Calibration | Sigmoid (`CalibratedClassifierCV`, 5-fold CV) |
| Library | scikit-learn |
| Training Data | Global Weather Repository (Kaggle) |
| Features | Temperature, Humidity, Pressure, Wind, Cloud |

### Deployment
| | |
|---|---|
| Frontend | Vercel |
| Backend | Render |
| Weather Data | WeatherAPI.com |

---

## 📄 License

MIT — fork it, extend it, make it your own.

---

<p align="center"><i>Built with obsessive attention to detail.<br>Feel the Weather Breathe.</i></p>
