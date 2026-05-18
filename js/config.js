// Auto-detects local vs production environment.
// Covers localhost, 127.0.0.1, and all private IP ranges.
const isDev = location.hostname === 'localhost'
           || location.hostname === '127.0.0.1'
           || location.hostname.startsWith('192.168.')
           || location.hostname.startsWith('10.')
           || location.hostname.startsWith('172.');

export const CONFIG = {
    BASE_URL: isDev
        ? `http://${location.hostname}:8000`        // local FastAPI server
        : 'https://windly-backend.onrender.com',        // ← replace when deploying
};