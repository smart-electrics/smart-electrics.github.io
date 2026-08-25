import assert from "node:assert/strict";
import test from "node:test";

import { createCinematicMotion } from "../../assets/js/cinematic-motion.js";

function createClock() {
  const pending = [];
  return {
    setTimeout(callback, delay) {
      const task = { callback, delay, cancelled: false };
      pending.push(task);
      return task;
    },
    clearTimeout(task) {
      task.cancelled = true;
    },
    runNext() {
      const task = pending.shift();
      if (task && !task.cancelled) task.callback();
      return task;
    },
    pending() {
      return pending.filter((task) => !task.cancelled);
    }
  };
}

test("runs one bounded disassemble, clean hold, reassemble lifecycle", () => {
  const clock = createClock();
  const phases = [];
  const motion = createCinematicMotion({
    timers: clock,
    durations: { disassemble: 120, hold: 240, reassemble: 120 },
    onPhase: (phase) => phases.push(phase)
  });

  assert.equal(motion.phase, "idle");
  motion.start();
  assert.deepEqual(phases, ["disassemble"]);
  assert.deepEqual(clock.pending().map((task) => task.delay), [120]);

  clock.runNext();
  assert.equal(motion.phase, "hold");
  clock.runNext();
  assert.equal(motion.phase, "reassemble");
  clock.runNext();

  assert.equal(motion.phase, "idle");
  assert.deepEqual(phases, ["disassemble", "hold", "reassemble", "idle"]);
});

test("restarts from the latest interaction and cancels every stale lifecycle callback", () => {
  const clock = createClock();
  const phases = [];
  const motion = createCinematicMotion({
    timers: clock,
    durations: { disassemble: 120, hold: 240, reassemble: 120 },
    onPhase: (phase) => phases.push(phase)
  });

  motion.start();
  const stale = clock.pending()[0];
  motion.start();
  stale.callback();
  assert.equal(motion.phase, "disassemble");
  assert.deepEqual(clock.pending().map((task) => task.delay), [120]);

  clock.runNext();
  clock.runNext();
  clock.runNext();
  clock.runNext();
  assert.deepEqual(phases, ["disassemble", "hold", "reassemble", "idle"]);
});

test("bypasses timers for reduced motion and can cancel a running lifecycle", () => {
  const clock = createClock();
  const phases = [];
  const motion = createCinematicMotion({ timers: clock, onPhase: (phase) => phases.push(phase) });

  motion.start({ reducedMotion: true });
  assert.equal(motion.phase, "idle");
  assert.deepEqual(phases, []);
  assert.equal(clock.pending().length, 0);

  motion.start();
  motion.cancel();
  assert.equal(motion.phase, "idle");
  assert.deepEqual(phases, ["disassemble", "idle"]);
  assert.equal(clock.pending().length, 0);
});
