const DEFAULT_DURATIONS = Object.freeze({
  disassemble: 360,
  hold: 640,
  reassemble: 420
});

function validDuration(value) {
  return Number.isFinite(value) && value >= 0;
}

function normalizeDurations(durations) {
  const candidate = { ...DEFAULT_DURATIONS, ...(durations || {}) };
  if (!Object.values(candidate).every(validDuration)) {
    throw new TypeError("Cinematic motion durations must be finite non-negative numbers.");
  }
  return Object.freeze(candidate);
}

/**
 * Public lifecycle seam shared by progressive cinematic adapters. It owns
 * timing only: adapters keep their data/state reducers and apply visual work
 * through the phase callback. A generation token makes rapid interactions
 * restartable even when a host timer fires after being cleared.
 */
export function createCinematicMotion({ timers = globalThis, durations, onPhase = () => {} } = {}) {
  if (!timers || typeof timers.setTimeout !== "function" || typeof timers.clearTimeout !== "function") {
    throw new TypeError("Cinematic motion requires timer functions.");
  }
  if (typeof onPhase !== "function") throw new TypeError("Cinematic motion requires an onPhase callback.");

  const timing = normalizeDurations(durations);
  let phase = "idle";
  let timer = null;
  let generation = 0;

  const setPhase = (nextPhase) => {
    if (phase === nextPhase) return;
    phase = nextPhase;
    onPhase(phase);
  };
  const clearTimer = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
  const schedule = (expectedGeneration, delay, nextPhase, next) => {
    timer = timers.setTimeout(() => {
      if (expectedGeneration !== generation) return;
      timer = null;
      setPhase(nextPhase);
      next();
    }, delay);
  };
  const scheduleReassemble = (expectedGeneration) => {
    schedule(expectedGeneration, timing.hold, "reassemble", () => {
      schedule(expectedGeneration, timing.reassemble, "idle", () => {});
    });
  };
  const scheduleHold = (expectedGeneration) => {
    schedule(expectedGeneration, timing.disassemble, "hold", () => scheduleReassemble(expectedGeneration));
  };

  return Object.freeze({
    get phase() {
      return phase;
    },
    start({ reducedMotion = false } = {}) {
      clearTimer();
      generation += 1;
      if (reducedMotion) {
        setPhase("idle");
        return phase;
      }
      setPhase("disassemble");
      scheduleHold(generation);
      return phase;
    },
    cancel() {
      clearTimer();
      generation += 1;
      setPhase("idle");
      return phase;
    }
  });
}
