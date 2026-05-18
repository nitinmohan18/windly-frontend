// ai-manager.js — moves the AI card to the right container based on screen size
//
// Desktop (>768px): appended to #forecast-wrapper, below the forecast card
// Mobile  (≤768px): appended to #panel-days, which is the Forecast tab panel.
//   On mobile, when the user switches to the Graph tab, #panel-days gets
//   display:none — so the AI card disappears automatically with no extra code.
//
// Collapse behaviour:
//   A MutationObserver watches the forecast days container. When any day row
//   is expanded (.fday-active), the AI card gets .ai-sunken added, which
//   animates it to height:0. Removed automatically when the day closes.

class AIInteractionManager {
    constructor() {
        this.aiModule    = document.getElementById('ai-prediction-module');
        this.isAnimating = false;
        this._lastTarget = null;
        this._observer   = null;

        // Short delay to let the DOM settle before first placement
        setTimeout(() => this.init(), 120);
    }

    init() {
        if (!this.aiModule) return;

        this.evaluateAndMove();

        // Re-evaluate placement on resize (e.g. rotation, split-screen)
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (!this.isAnimating) this.evaluateAndMove();
            }, 150);
        });

        this._setupDayObserver();
    }

    // Watch for expanded forecast day rows and collapse the AI card when one is open
    _setupDayObserver() {
        const container = document.getElementById('forecast-days-container');
        if (!container) {
            setTimeout(() => this._setupDayObserver(), 400);
            return;
        }

        this._observer = new MutationObserver(() => {
            const anyActive = container.querySelector('.fday-active') !== null;
            this._setAISunken(anyActive);
        });

        this._observer.observe(container, {
            subtree:         true,
            attributes:      true,
            attributeFilter: ['class'],
        });
    }

    _setAISunken(sink) {
        if (!this.aiModule) return;
        this.aiModule.classList.toggle('ai-sunken', sink);
    }

    // Move the AI module to the correct parent container for the current screen size
    evaluateAndMove() {
        if (!this.aiModule) return;

        const isMobile = window.innerWidth <= 768;
        const target   = isMobile
            ? document.getElementById('panel-days')
            : document.getElementById('forecast-wrapper');

        if (!target) return;

        // Skip if already in the right place
        if (target === this._lastTarget && target.contains(this.aiModule)) return;

        this.isAnimating = true;

        // Fade out before moving
        this.aiModule.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.25,0.8,0.25,1)';
        this.aiModule.style.opacity    = '0';
        this.aiModule.style.transform  = 'translateY(12px)';

        setTimeout(() => {
            if (!target.contains(this.aiModule)) {
                target.appendChild(this.aiModule);
                this._lastTarget = target;
            }

            // Force a reflow so the next transition plays from the correct position
            void this.aiModule.offsetWidth;

            this.aiModule.style.opacity   = '1';
            this.aiModule.style.transform = 'translateY(0)';

            setTimeout(() => { this.isAnimating = false; }, 420);
        }, 360);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AIInteractionManager();
});