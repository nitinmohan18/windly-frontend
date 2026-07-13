# 🌦️ Windly Weather App — Complete Architecture & Technical Documentation

## Overview

**Windly** is a full-stack, AI-powered weather application that combines real-time weather data with a Machine Learning rain prediction model. It features a premium glassmorphism UI with interactive 3D effects, canvas-based weather visualizations, and a rich particle animation system.

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES Modules) | Premium single-page weather dashboard |
| **Backend** | Python FastAPI + Uvicorn | REST API server, ML inference, weather data proxy |
| **ML Model** | scikit-learn RandomForestClassifier | Binary rain prediction (will it rain tomorrow?) |
| **External API** | WeatherAPI.com | Real-time weather data, 3-day forecasts, city search |
| **Deployment** | Vercel (Frontend) + Render (Backend) | Production hosting |

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph "👤 User"
        Browser["Browser / Mobile"]
    end

    subgraph "🖥️ Frontend (Vercel)"
        HTML["index.html<br/>Single Page App"]
        CSS["CSS Modules<br/>6 files"]
        JS["JS Modules<br/>8 files"]
    end

    subgraph "⚙️ Backend (Render)"
        FastAPI["FastAPI Server<br/>app.py"]
        Cache["In-Memory TTL Cache"]
        MLModel["ML Model<br/>random_forest.pkl"]
        Predict["predict.py"]
        Preprocess["preprocess.py"]
    end

    subgraph "🌐 External"
        WeatherAPI["WeatherAPI.com"]
    end

    subgraph "📊 Training (Offline)"
        Dataset["GlobalWeatherRepository.csv<br/>36.8 MB"]
        TrainScript["train.py"]
    end

    Browser -->|"HTTPS"| HTML
    HTML --> CSS
    HTML --> JS
    JS -->|"GET /weather/forecast?q=city"| FastAPI
    JS -->|"GET /weather/search?q=query"| FastAPI
    JS -->|"POST /predict"| FastAPI
    FastAPI -->|"Proxy + Cache"| Cache
    Cache -->|"Cache Miss"| WeatherAPI
    FastAPI -->|"ML Inference"| Predict
    Predict -->|"Load"| MLModel
    Dataset -->|"Offline Training"| TrainScript
    TrainScript -->|"Export"| MLModel
```

---

## 2. Complete Project File Structure

```
windly/
├── 📂 backend/                          ← Python FastAPI server
│   ├── .env                             ← API key (secret)
│   ├── requirements.txt                 ← Python dependencies
│   ├── README.md                        ← Backend documentation
│   │
│   ├── 📂 api/
│   │   └── app.py                       ← FastAPI server (main entry point)
│   │
│   ├── 📂 model/
│   │   ├── train.py                     ← ML training pipeline
│   │   ├── predict.py                   ← ML inference module
│   │   ├── random_forest.pkl            ← Trained model (59.5 MB)
│   │   └── feature_columns.json         ← Feature names reference
│   │
│   ├── 📂 utils/
│   │   └── preprocess.py                ← Data cleaning utilities
│   │
│   └── 📂 data/
│       └── GlobalWeatherRepository.csv  ← Training dataset (36.8 MB)
│
└── 📂 frontend/                         ← Static web app
    ├── index.html                       ← Main (only) HTML page
    ├── style.css                        ← CSS import aggregator
    ├── favicon.ico                      ← App icon
    ├── vercel.json                      ← Deployment config
    │
    ├── 📂 css/
    │   ├── base.css                     ← CSS reset & variables
    │   ├── themes.css                   ← 11 weather background themes
    │   ├── layout.css                   ← Responsive grid & breakpoints
    │   ├── components.css               ← All UI component styles
    │   ├── animations.css               ← Particles, lightning, effects
    │   └── enhancements.css             ← Polish, interactions, GPU optimizations
    │
    ├── 📂 js/
    │   ├── config.js                    ← API URL auto-detection
    │   ├── state.js                     ← Global app state
    │   ├── main.js                      ← Bootstrap, event wiring, gestures
    │   ├── api.js                       ← Network layer, AI card updates
    │   ├── ui.js                        ← DOM rendering (cards, forecasts)
    │   ├── features.js                  ← Animations, audio, particle engine
    │   ├── graph.js                     ← Canvas-based 24-hour graph
    │   └── ai-manager.js               ← AI card positioning logic
    │
    ├── 📂 images/
    │   └── windly-social-preview.png    ← Social media preview image
    │
    └── 📂 sound/
        ├── bird.mp3, crickets.mp3       ← Ambient nature sounds
        ├── heavy-rain.mp3, light-rain.mp3 ← Rain audio
        ├── thunder.mp3, wind.mp3        ← Storm audio
        ├── water-drop.mp3, ding.mp3     ← Interaction sounds
        └── foot-step-snow.mp3           ← Snow crunch sound
```

---

## 3. Frontend Architecture — Module Dependency Graph

```mermaid
graph TD
    subgraph "Entry Point"
        MAIN["main.js<br/>Bootstrap & Events"]
    end

    subgraph "Core Modules"
        CONFIG["config.js<br/>API URL detection"]
        STATE["state.js<br/>Global state object"]
        API["api.js<br/>Network & AI updates"]
        UI["ui.js<br/>DOM rendering"]
        FEATURES["features.js<br/>Animations & Audio"]
        GRAPH["graph.js<br/>Canvas graph engine"]
    end

    subgraph "Standalone"
        AIMANAGER["ai-manager.js<br/>AI card positioning"]
    end

    MAIN -->|"imports"| API
    MAIN -->|"imports"| UI
    MAIN -->|"imports"| FEATURES
    MAIN -->|"imports"| GRAPH

    API -->|"imports"| CONFIG
    API -->|"imports"| STATE
    API -->|"imports"| UI
    API -->|"imports"| FEATURES

    UI -->|"imports"| GRAPH
```

### What Each JS File Does

| File | Lines | Responsibility |
|------|-------|---------------|
| **config.js** | 13 | Auto-detects dev (`localhost:8000`) vs production (`onrender.com`) API URL |
| **state.js** | 22 | Single `appState` object: sound toggle, temperature unit (°C/°F), city history, weather conditions |
| **main.js** | 375 | App bootstrap on `DOMContentLoaded`: renders city history, starts clock, wires all button/search/voice/GPS events, manages forecast panel open/close, swipe-to-close gestures |
| **api.js** | 341 | Network layer: `fetchData(city)` fetches weather with 50s timeout (handles Render cold starts), `fetchSuggestions()` for autocomplete, `getAIPrediction()` POSTs to ML model and updates AI card visuals |
| **ui.js** | 523 | Renders ALL DOM content: city name, temperature, feels-like, condition, weather icon, hourly forecast strip (12 hours), 7-day forecast with expandable detail panels, dashboard stats (AQI, UV, wind, humidity, pressure, moon), sun arc animation |
| **features.js** | 701 | Animation engine: particle system (rain drops, snowflakes, cloud bits, wind lines, shooting stars), canvas-based interactive physics (wipe rain/snow with mouse), lightning bolts, ambient sounds (rain, birds, crickets, thunder), weather theme management, extreme heat sun effect |
| **graph.js** | 941 | Pure Canvas 2D graph: plots temperature, feels-like, humidity, dew point, rain probability, UV index over 24 hours. Animated left-to-right draw, night/dawn bands, comfort zone, hover tooltips, peak marker |
| **ai-manager.js** | 106 | Moves the AI Prediction card between desktop (inside forecast) and mobile (inside forecast days) layouts. Collapses with animation when forecast day details are expanded |

---

## 4. CSS Architecture

| File | Lines | Purpose |
|------|-------|---------|
| **base.css** | 25 | CSS reset, CSS variable `--primary: #00f2fe`, Poppins font, body styling |
| **themes.css** | 42 | 11 weather-driven background gradients (sunny, rainy, cloudy, night, stormy, snowy, etc.) |
| **layout.css** | 248 | Responsive layout with 4 breakpoints: desktop → tablet → mobile → compact |
| **components.css** | 1046 | All visual components: glassmorphism cards, search box, dashboard panels, forecast rows, graph card |
| **animations.css** | 299 | Keyframe animations: rain fall, snow sway, cloud drift, lightning flash, sun arc, shooting stars |
| **enhancements.css** | 647 | Polish layer: micro-interactions, hover effects, expandable panels, mobile GPU optimizations, CSS containment |

---

## 5. ML Rain Prediction Model — Complete Pipeline

### 5.1 Training Pipeline

```mermaid
flowchart LR
    subgraph "📥 Data Source"
        CSV["GlobalWeatherRepository.csv<br/>36.8 MB Kaggle Dataset"]
    end

    subgraph "🔧 Preprocessing (preprocess.py)"
        LOAD["Load CSV"]
        CLEAN["Drop NaN rows"]
        TARGET["Create target:<br/>precip_mm > 0 → RainTomorrow"]
        SELECT["Select 5 features"]
    end

    subgraph "📊 Feature Engineering"
        F1["temperature_celsius"]
        F2["humidity (%)"]
        F3["pressure_mb"]
        F4["wind_kph"]
        F5["cloud (%)"]
    end

    subgraph "🏋️ Training (train.py)"
        SPLIT["Stratified 80/20 Split<br/>random_state=42"]
        RF["RandomForestClassifier<br/>120 trees, max_depth=10"]
        CALIB["CalibratedClassifierCV<br/>Sigmoid, 5-fold CV"]
        EVAL["Evaluate:<br/>Accuracy, ROC-AUC,<br/>Classification Report"]
    end

    subgraph "💾 Output"
        PKL["random_forest.pkl<br/>59.5 MB trained model"]
    end

    CSV --> LOAD --> CLEAN --> TARGET --> SELECT
    SELECT --> F1 & F2 & F3 & F4 & F5
    F1 & F2 & F3 & F4 & F5 --> SPLIT --> RF --> CALIB --> EVAL --> PKL
```

### 5.2 Model Details

| Parameter | Value | Explanation |
|-----------|-------|-------------|
| **Algorithm** | Random Forest | An ensemble of 120 decision trees that each vote on whether it will rain |
| **n_estimators** | 120 | Number of decision trees in the forest |
| **max_depth** | 10 | Maximum depth of each tree (prevents overfitting) |
| **min_samples_split** | 4 | Minimum samples needed to split a node |
| **Calibration** | Sigmoid (Platt Scaling), 5-fold CV | Makes the output probabilities realistic (e.g., 70% means it actually rains 70% of the time) |
| **Target Variable** | `precip_mm > 0` → Binary (0 = No Rain, 1 = Rain) | If precipitation is above 0mm, it's classified as "rain" |

### 5.3 The 5 Input Features

| # | Feature | Range | What It Measures |
|---|---------|-------|-----------------|
| 1 | **Temperature** | -90°C to 60°C | Current air temperature |
| 2 | **Humidity** | 0% to 100% | Moisture content in the air |
| 3 | **Pressure** | 870 to 1085 mb | Atmospheric pressure (low pressure → storms) |
| 4 | **Wind Speed** | 0 to 300 km/h | Wind velocity |
| 5 | **Cloud Cover** | 0% to 100% | Percentage of sky covered by clouds |

### 5.4 Inference Pipeline (How Prediction Happens at Runtime)

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant FE as 🖥️ Frontend (JS)
    participant BE as ⚙️ Backend (FastAPI)
    participant ML as 🧠 ML Model

    User->>FE: Searches for a city
    FE->>BE: GET /weather/forecast?q=London
    BE->>BE: Check cache (5min TTL)
    BE-->>FE: Weather data (3 days)
    
    Note over FE: Extract tomorrow's data:<br/>avgtemp, humidity, pressure,<br/>wind, cloud
    
    FE->>BE: POST /predict<br/>{temperature: 22, humidity: 78,<br/>pressure: 1013, wind: 15, cloud: 65}
    BE->>BE: Pydantic validates ranges
    BE->>ML: predict_rain(features)
    ML->>ML: model.predict() → 0 or 1
    ML->>ML: model.predict_proba() → [0.32, 0.68]
    ML-->>BE: {prediction: 1, probability: 0.68}
    BE-->>FE: JSON response
    
    Note over FE: Map 0.68 → "Moderate Risk"<br/>Update AI card visuals
    FE->>User: Display: "Elevated Risk"<br/>Gauge shows 68%
```

### 5.5 Risk Tier Mapping (Frontend)

The raw probability from the model is mapped to human-readable risk levels:

| Probability Range | Risk Level | Display Label | Card Color Theme |
|-------------------|------------|---------------|-----------------|
| 0% – 19% | 🟢 Low | Stable Conditions | Green glow |
| 20% – 39% | 🟢 Low | Low Risk | Green glow |
| 40% – 54% | 🟡 Moderate | Moderate Risk | Yellow/amber glow |
| 55% – 69% | 🟡 Moderate | Elevated Risk | Yellow/amber glow |
| 70% – 81% | 🟠 High | High Risk | Orange glow |
| 82% – 100% | 🔴 Severe | Severe Risk | Red glow |

---

## 6. Backend API Architecture

```mermaid
graph LR
    subgraph "FastAPI Server (app.py)"
        HEALTH["GET /<br/>Health Check"]
        FORECAST["GET /weather/forecast<br/>?q=city"]
        SEARCH["GET /weather/search<br/>?q=query"]
        PREDICT["POST /predict<br/>{5 features}"]
    end

    subgraph "Middleware"
        CORS["CORS<br/>Only windly-weather.vercel.app"]
        GZIP["GZip<br/>≥500 bytes"]
    end

    subgraph "Cache Layer"
        CACHE["In-Memory Dict<br/>Forecast: 5min TTL<br/>Search: 15min TTL"]
    end

    subgraph "External"
        WAPI["WeatherAPI.com"]
    end

    subgraph "ML"
        MODEL["predict.py<br/>→ random_forest.pkl"]
    end

    CORS --> HEALTH
    CORS --> FORECAST
    CORS --> SEARCH
    CORS --> PREDICT

    FORECAST --> CACHE --> WAPI
    SEARCH --> CACHE --> WAPI
    PREDICT --> MODEL
```

### API Endpoints

| Method | Endpoint | Cache TTL | Description |
|--------|---------|-----------|-------------|
| `GET/HEAD` | `/` | — | Health check: returns `{status: 'ok', service: 'Windly API v2.0'}` |
| `GET` | `/weather/forecast?q={city}` | 5 min | Proxies WeatherAPI forecast (3 days, AQI included) |
| `GET` | `/weather/search?q={query}` | 15 min | City autocomplete search |
| `POST` | `/predict` | — | ML inference: accepts 5 weather features, returns rain prediction + probability |

### Backend Key Features
- **Connection pooling**: `httpx.AsyncClient` with 20 max connections, 10 keepalive
- **TTL caching**: Avoids hitting WeatherAPI rate limits
- **CORS security**: Only allows requests from the production frontend domain
- **GZip compression**: Reduces response payload size
- **Input validation**: Pydantic models enforce valid ranges for all 5 ML features

---

## 7. Complete Data Flow — End to End

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant FE as 🖥️ Frontend
    participant BE as ⚙️ Backend
    participant WA as 🌐 WeatherAPI
    participant ML as 🧠 ML Model

    Note over U,ML: === STEP 1: App Loads ===
    U->>FE: Opens windly-weather.vercel.app
    FE->>FE: Load last city from localStorage
    FE->>FE: Try GPS geolocation (6s timeout)

    Note over U,ML: === STEP 2: Fetch Weather ===
    FE->>BE: GET /weather/forecast?q=Bhopal
    BE->>BE: Check cache
    alt Cache Hit
        BE-->>FE: Cached weather data
    else Cache Miss
        BE->>WA: GET forecast.json?q=Bhopal&days=3&aqi=yes
        WA-->>BE: Full weather JSON
        BE->>BE: Store in cache (5min TTL)
        BE-->>FE: Weather data
    end

    Note over U,ML: === STEP 3: Render UI ===
    FE->>FE: updateUI() → City, temp, condition, icon
    FE->>FE: renderHourlyForecast() → 12 hour cards
    FE->>FE: renderForecastCard() → 7 day forecast
    FE->>FE: manageAnimations() → Theme, particles, sounds
    FE->>FE: renderWeatherGraph() → Canvas 24h graph

    Note over U,ML: === STEP 4: AI Prediction ===
    FE->>BE: POST /predict {temp:32, humidity:78, pressure:1008, wind:12, cloud:65}
    BE->>ML: predict_rain(features)
    ML-->>BE: {prediction:1, probability:0.68}
    BE-->>FE: JSON response
    FE->>FE: Update AI card → "Elevated Risk", gauge 68%

    Note over U,ML: === STEP 5: Interactions ===
    U->>FE: Moves mouse over cards
    FE->>FE: VanillaTilt 3D rotation
    U->>FE: Wipes rain drops on card
    FE->>FE: Canvas physics → gravity fall + sound
    U->>FE: Opens forecast day
    FE->>FE: Expand detail panel + collapse AI card
```

---

## 8. Visual Effects & Premium Features

### 8.1 Glassmorphism Design
Every card uses the "frosted glass" effect:
```css
background: linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03));
backdrop-filter: blur(35px) saturate(130%);
border: 1px solid rgba(255,255,255,0.25);
box-shadow: 0 40px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25);
```

### 8.2 Interactive Features
| Feature | Technology | Description |
|---------|-----------|-------------|
| **3D Card Tilt** | VanillaTilt.js | Cards rotate in 3D following mouse position (4° max) |
| **Rain/Snow Physics** | Canvas 2D API | Interactive particles on main card, wipe them with mouse/touch |
| **Lightning Bolts** | SVG paths + CSS | Randomly generated branching SVG bolts with flash overlay |
| **Particle System** | CSS animations | Rain drops, snowflakes, cloud bits, wind lines spawned in `#weather-stage` |
| **Ambient Audio** | Web Audio | Context-aware: rain, thunder, birds (day), crickets (night), wind |
| **Voice Search** | Web Speech API | Full speech recognition with iOS Safari support |
| **GPS Location** | Geolocation API | Auto-detect user's city |
| **Pendulum Graph** | CSS + JS | Graph card swings in with pendulum physics, sways with mouse |

### 8.3 Weather Themes
The entire background dynamically changes based on weather conditions:

| Theme | Trigger | Colors |
|-------|---------|--------|
| Sunny | Clear day | Warm orange → yellow gradient |
| Sunny Extreme | Temp > 40°C | Deep red → orange |
| Rainy | Rain detected | Dark blue → slate |
| Stormy | Thunder conditions | Near-black → dark purple |
| Snowy | Snow detected | White → ice blue |
| Night | After sunset | Deep navy → black |
| Cloudy | Overcast | Gray → slate |
| Stargazer | Clear night | Deep purple → black with shooting stars |

---

## 9. Performance Optimizations

| Optimization | Where | Purpose |
|-------------|-------|---------|
| CSS `contain: layout style paint` | All panels | Isolates each panel for faster browser repaints during zoom |
| `backdrop-filter: blur(10px)` | Mobile AI card | Reduces GPU cost by ~65% on mobile (from 30px → 10px) |
| `translateZ(0)` | Mobile cards | Promotes elements to GPU compositor layers |
| `will-change: auto` | Mobile forecast rows | Prevents excessive GPU memory usage |
| `DocumentFragment` | Hourly forecast | Batches DOM insertions for zero layout thrash |
| `requestAnimationFrame` | AI card updates | Batches all visual updates into single frame |
| `ResizeObserver` | Graph | Defers rendering until container is actually visible |
| Particle scaling | Features.js | Mobile: ÷5, Tablet: ÷2.5 particle counts |
| TTL Cache | Backend | Avoids redundant API calls (5min forecast, 15min search) |
| Connection pooling | Backend | Reuses HTTP connections to WeatherAPI |
| GZip middleware | Backend | Compresses responses ≥500 bytes |

---

## 10. Deployment Architecture

```mermaid
graph LR
    subgraph "User Devices"
        DESKTOP["💻 Desktop Browser"]
        MOBILE["📱 Mobile Browser"]
    end

    subgraph "Vercel (Frontend CDN)"
        STATIC["Static Files<br/>HTML + CSS + JS"]
    end

    subgraph "Render (Backend PaaS)"
        FASTAPI["FastAPI + Uvicorn<br/>Python 3.x"]
    end

    subgraph "WeatherAPI.com"
        WEATHER["Weather Data API"]
    end

    DESKTOP -->|"HTTPS"| STATIC
    MOBILE -->|"HTTPS"| STATIC
    STATIC -->|"API Calls"| FASTAPI
    FASTAPI -->|"Proxy"| WEATHER
```

| Component | Platform | URL |
|-----------|---------|-----|
| Frontend | Vercel | `https://windly-weather.vercel.app` |
| Backend | Render | `https://windly-backend.onrender.com` |
| Weather Data | WeatherAPI.com | `https://api.weatherapi.com/v1` |

---

## 11. Key Technical Decisions Summary

| Decision | Why |
|----------|-----|
| **No framework (Vanilla JS)** | Maximum performance, zero bundle size overhead, full control |
| **ES Modules** | Clean dependency graph, native browser support, no bundler needed |
| **FastAPI (Python)** | Async support, automatic API docs, Pydantic validation, ML ecosystem compatibility |
| **Random Forest** | Handles non-linear weather patterns well, fast inference, interpretable |
| **Sigmoid Calibration** | Raw Random Forest probabilities are unreliable; calibration makes them meaningful |
| **Server-side API proxy** | Keeps WeatherAPI key secret, enables caching, adds CORS security |
| **Canvas 2D for graph** | Full pixel control, no chart library dependency, custom visual effects |
| **CSS particles (not Canvas)** | Simpler, GPU-accelerated via `will-change`, individually styled |
| **Canvas for interactive physics** | Needed for collision detection (mouse wipe), gravity simulation |
