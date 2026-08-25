import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("keeps every residence phase animation inside the shared lifecycle", () => {
  const clock = createClock();
  const motion = createCinematicMotion({ timers: clock });

  motion.start();
  const disassembleDuration = clock.pending()[0]?.delay;
  const styles = readFileSync(new URL("../../_sass/_cinematic.scss", import.meta.url), "utf8");
  const outgoing = styles.match(/\.residence-spine__outgoing-snapshot\[data-cinematic-snapshot-active="true"\] \{\s*animation: residence-spine-outgoing (\d+)ms(?: (\d+)ms)?/u);
  assert.ok(outgoing, "residence outgoing animation must remain declared");
  const renderMargin = 32;
  assert.ok(Number(outgoing[1]) + Number(outgoing[2] || 0) + renderMargin <= disassembleDuration, "residence outgoing animation plus two render frames must settle before clean hold");

  clock.runNext();
  clock.runNext();
  const reassembleDuration = clock.pending()[0]?.delay;
  assert.equal(motion.phase, "reassemble");

  const animations = [
    ["scene", /\.residence-spine\[data-cinematic-motion-phase="reassemble"\] \.residence-spine__scene:not\(\[hidden\]\) \{\s*animation: residence-spine-scene-in (\d+)ms(?: (\d+)ms)?/u],
    ["panel", /\.residence-spine\[data-cinematic-motion-phase="reassemble"\] \.residence-spine__panel:not\(\[hidden\]\) \{\s*animation: residence-spine-panel-reveal (\d+)ms(?: (\d+)ms)?/u],
    ["type", /\.residence-spine\[data-cinematic-motion-phase="reassemble"\] \.residence-spine__panel:not\(\[hidden\]\) > :is\(p, h3, a, div, ul\) \{\s*animation: residence-spine-type-reveal (\d+)ms(?: (\d+)ms)?/u]
  ];

  for (const [name, pattern] of animations) {
    const match = styles.match(pattern);
    assert.ok(match, `${name} residence reassemble animation must remain declared`);
    const duration = Number(match[1]);
    const delay = Number(match[2] || 0);
    assert.ok(duration + delay + renderMargin <= reassembleDuration, `${name} animation plus two render frames must settle before lifecycle idle`);
  }
});

test("keeps every smart-home phase animation inside the shared lifecycle", () => {
  const clock = createClock();
  const motion = createCinematicMotion({ timers: clock });
  const styles = readFileSync(new URL("../../_sass/_smart-home.scss", import.meta.url), "utf8");
  const renderMargin = 32;
  const assertFits = (name, pattern, phaseDuration) => {
    const match = styles.match(pattern);
    assert.ok(match, `${name} smart-home animation must remain declared`);
    const duration = Number(match[1]);
    const delay = Number(match[2] || 0);
    assert.ok(duration + delay + renderMargin <= phaseDuration, `${name} animation plus two render frames must settle inside its smart-home phase`);
  };

  motion.start();
  const disassembleDuration = clock.pending()[0]?.delay;
  for (const [name, pattern] of [
    ["snapshot", /data-motion-phase="disassemble"\] \.smart-home__outgoing-snapshot \{\s*animation: smart-home-disassemble (\d+)ms(?: (\d+)ms)?/u],
    ["panel exit", /data-motion-phase="disassemble"\] \.smart-home__preset-panel:not\(\[hidden\]\) \{\s*animation: smart-home-panel-exit (\d+)ms(?: (\d+)ms)?/u],
    ["copy exit", /data-motion-phase="disassemble"\] \.smart-home__scene-topology \{\s*animation: smart-home-copy-exit (\d+)ms(?: (\d+)ms)?/u]
  ]) assertFits(name, pattern, disassembleDuration);

  clock.runNext();
  clock.runNext();
  const reassembleDuration = clock.pending()[0]?.delay;
  for (const [name, pattern] of [
    ["scene", /data-motion-phase="reassemble"\] \.smart-home__scene-background:not\(\[hidden\]\) \{\s*animation: smart-home-scene-reassemble (\d+)ms(?: (\d+)ms)?/u],
    ["light", /data-motion-phase="reassemble"\] \.smart-home__scene-wash \{\s*animation: smart-home-light-reassemble (\d+)ms(?: (\d+)ms)?/u],
    ["preview", /data-motion-phase="reassemble"\] \.smart-home__scene-preview \{\s*animation: smart-home-preview-reassemble (\d+)ms(?: (\d+)ms)?/u],
    ["scene type", /data-motion-phase="reassemble"\] \.smart-home__scene-copy \{\s*animation: smart-home-type-reveal (\d+)ms(?: (\d+)ms)?/u],
    ["topology", /data-motion-phase="reassemble"\] \.smart-home__scene-topology \{\s*animation: smart-home-type-reveal (\d+)ms(?: (\d+)ms)?/u],
    ["connector", /data-motion-phase="reassemble"\] \.smart-home__scene-topology \[data-topology-connector\] \{\s*animation: smart-home-topology-draw (\d+)ms(?: (\d+)ms)?/u],
    ["panel", /data-motion-phase="reassemble"\] \.smart-home__preset-panel:not\(\[hidden\]\) \{\s*animation: smart-home-panel-reveal (\d+)ms(?: (\d+)ms)?/u],
    ["panel type", /data-motion-phase="reassemble"\] \.smart-home__preset-panel:not\(\[hidden\]\) > \* \{\s*animation: smart-home-type-reveal (\d+)ms(?: (\d+)ms)?/u]
  ]) assertFits(name, pattern, reassembleDuration);
});
