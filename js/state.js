// Global app state — single source of truth shared across all modules.
// Import this object wherever you need to read or write shared state.
export const appState = {
    soundEnabled: false,
    stormTimeout: null,       // holds the setTimeout ID for recurring lightning
    isCelsius:    true,
    cache:        null,       // last raw WeatherAPI response object

    // Seed history from localStorage, fall back to a handful of default cities
    history: JSON.parse(localStorage.getItem('weatherHistory'))
                || ['Bhopal', 'Hong Kong', 'Bern', 'Seattle'],

    // Current weather condition flags — kept in sync by manageAnimations()
    // and read by applyAmbientSounds()
    conditions: {
        isRaining:  false,
        isSnowing:  false,
        isHeavy:    false,
        wind:       0,
        isPleasant: false,
    },
};