import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, scrollProgress, activePanel, scrollForPanel, scrollMetrics } from '../scroll-model.mjs';

test('scroll progress respects the section offset and elastic overscroll', () => {
  assert.equal(scrollProgress(-40, 200, 1200), 0);
  assert.equal(scrollProgress(200, 200, 1200), 0);
  assert.equal(scrollProgress(800, 200, 1200), 0.5);
  assert.equal(scrollProgress(1400, 200, 1200), 1);
  assert.equal(scrollProgress(9000, 200, 1200), 1);
});

test('the nearest panel switches exactly at its midpoint and stays within the story', () => {
  assert.equal(activePanel(0, 7), 0);
  assert.equal(activePanel((2.5 / 6) - 0.00001, 7), 2);
  assert.equal(activePanel(2.5 / 6, 7), 3);
  assert.equal(activePanel(1, 7), 6);
  assert.equal(activePanel(100, 7), 6);
  assert.equal(activePanel(-100, 7), 0);
});

test('rail targets round-trip through native scroll at every screen', () => {
  for (const count of [2, 5, 7]) {
    for (let index = 0; index < count; index += 1) {
      const target = scrollForPanel(index, count, 180, 4104);
      assert.equal(activePanel(scrollProgress(target, 180, 4104), count), index);
    }
  }
  assert.equal(scrollForPanel(-10, 7, 180, 4104), 180);
  assert.equal(scrollForPanel(99, 7, 180, 4104), 4284);
  assert.equal(scrollForPanel(2.8, 7, 180, 4104), scrollForPanel(3, 7, 180, 4104));
});

test('desktop journey has one horizontal viewport per step without excessive vertical travel', () => {
  assert.deepEqual(scrollMetrics(1280, 720, 7), {
    travel: 7680,
    scrollDistance: 4104,
    stageHeight: 4824,
  });
});

test('portrait resize changes geometry while preserving the selected screen', () => {
  const desktop = scrollMetrics(1280, 720, 7);
  const phone = scrollMetrics(375, 812, 7);
  assert.equal(phone.travel, 2250);
  assert.equal(phone.scrollDistance, 4628.4);
  for (let screen = 0; screen < 7; screen += 1) {
    const before = scrollProgress(scrollForPanel(screen, 7, 0, desktop.scrollDistance), 0, desktop.scrollDistance);
    const after = scrollProgress(scrollForPanel(screen, 7, 0, phone.scrollDistance), 0, phone.scrollDistance);
    assert.ok(Math.abs(before - after) < 1e-12);
    assert.equal(activePanel(after, 7), screen);
  }
});

test('short landscapes retain a usable scroll interval and one-panel stories do not move', () => {
  assert.deepEqual(scrollMetrics(1000, 200, 3), { travel: 2000, scrollDistance: 640, stageHeight: 840 });
  assert.deepEqual(scrollMetrics(375, 812, 1), { travel: 0, scrollDistance: 0, stageHeight: 812 });
  assert.equal(scrollForPanel(6, 1, 50, 0), 50);
  assert.equal(scrollProgress(100, 50, 0), 0);
  assert.equal(activePanel(1, 1), 0);
});

test('invalid dimensions, counts and scroll values never yield invalid CSS geometry', () => {
  assert.deepEqual(scrollMetrics(NaN, Infinity, NaN), { travel: 0, scrollDistance: 0, stageHeight: 0 });
  assert.deepEqual(scrollMetrics(-10, -40, -8), { travel: 0, scrollDistance: 0, stageHeight: 0 });
  assert.equal(scrollProgress(NaN, 200, 1200), 0);
  assert.equal(scrollProgress(500, NaN, Infinity), 0);
  assert.equal(scrollProgress(500, 0, -100), 0);
  assert.equal(scrollForPanel(Infinity, 7, 200, 1200), 200);
  assert.equal(activePanel(NaN, 7), 0);
  assert.equal(activePanel(1, 0), 0);
});

test('clamping handles unbounded values and malformed bounds predictably', () => {
  assert.equal(clamp(NaN), 0);
  assert.equal(clamp(Infinity), 1);
  assert.equal(clamp(-Infinity), 0);
  assert.equal(clamp(5, 10, 0), 5);
  assert.equal(clamp(5, NaN, Infinity), 1);
});
