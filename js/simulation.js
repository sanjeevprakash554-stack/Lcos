/**
 * Logistics Operations Control System (LCOS) - Simulation Engine & API Bridge
 * Manages simulated time progression, background check-in requirements,
 * random incident events, and the 3-strike driver call escalation process.
 */

const LCOS_Sim = {
    timerId: null,
    lastCheckRealTime: null,
    onClockTickCallbacks: [],
    onAlertTriggeredCallbacks: [],

    init() {
        this.lastCheckRealTime = Date.now();
        this.start();
    },

    start() {
        const settings = LCOS_State.getSystemSettings();
        if (!settings.isSimulating) return;

        if (this.timerId) clearInterval(this.timerId);
        this.timerId = setInterval(() => {
            this.step();
        }, 1000);
    },

    stop() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    },

    step() {
        const settings = LCOS_State.getSystemSettings();
        if (!settings.isSimulating) return;

        const now = Date.now();
        const elapsedRealSeconds = (now - this.lastCheckRealTime) / 1000;
        this.lastCheckRealTime = now;

        const simulatedMinutesToAdd = elapsedRealSeconds * settings.simulationSpeed;
        
        let simTime = new Date(settings.simulationTime);
        simTime.setMinutes(simTime.getMinutes() + simulatedMinutesToAdd);
        settings.simulationTime = simTime.toISOString();

        this.onClockTickCallbacks.forEach(cb => cb(settings.simulationTime));
    },

    escalations: {},

    async attemptEscalationCall(alertId) {
        try {
            if (window.LCOS_API) {
                const res = await LCOS_API.escalateAlertCallAttempt(alertId);
                await LCOS_State.loadFromBackend();
                return {
                    success: res.success,
                    answered: res.answered,
                    strikesExceeded: res.strikesExceeded,
                    message: res.message
                };
            }
        } catch (err) {
            console.error('attemptEscalationCall API error:', err);
        }

        return {
            success: false,
            message: 'Failed to process escalation call on backend'
        };
    },

    registerOnClockTick(cb) {
        this.onClockTickCallbacks.push(cb);
    },

    registerOnAlertTriggered(cb) {
        this.onAlertTriggeredCallbacks.push(cb);
    }
};

LCOS_Sim.init();
window.LCOS_Sim = LCOS_Sim;
