import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { CONTEXT_RESTORE_WAIT_MS, watchContextLoss } from './contextLoss.ts';

function setup() {
  const canvas = new EventTarget();
  const onGone = mock.fn();
  const stop = watchContextLoss(canvas, onGone);
  return { canvas, onGone, stop };
}

const lost = () => new Event('webglcontextlost');
const restored = () => new Event('webglcontextrestored');

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

test('gives up on a lost context that never comes back', () => {
  const { canvas, onGone } = setup();
  canvas.dispatchEvent(lost());
  mock.timers.tick(CONTEXT_RESTORE_WAIT_MS - 1);
  assert.equal(onGone.mock.callCount(), 0);
  mock.timers.tick(1);
  assert.equal(onGone.mock.callCount(), 1);
});

test('keeps going when the context comes back in time', () => {
  const { canvas, onGone } = setup();
  canvas.dispatchEvent(lost());
  mock.timers.tick(CONTEXT_RESTORE_WAIT_MS - 1);
  canvas.dispatchEvent(restored());
  mock.timers.tick(CONTEXT_RESTORE_WAIT_MS);
  assert.equal(onGone.mock.callCount(), 0);
});

test('waits in full again after a second loss', () => {
  const { canvas, onGone } = setup();
  canvas.dispatchEvent(lost());
  canvas.dispatchEvent(restored());
  mock.timers.tick(CONTEXT_RESTORE_WAIT_MS - 1);
  canvas.dispatchEvent(lost());
  mock.timers.tick(CONTEXT_RESTORE_WAIT_MS - 1);
  assert.equal(onGone.mock.callCount(), 0);
  mock.timers.tick(1);
  assert.equal(onGone.mock.callCount(), 1);
});

test('ignores a context loss forced after it stops watching', () => {
  const { canvas, onGone, stop } = setup();
  stop();
  canvas.dispatchEvent(lost());
  mock.timers.tick(CONTEXT_RESTORE_WAIT_MS);
  assert.equal(onGone.mock.callCount(), 0);
});

test('stopping cancels a wait already under way', () => {
  const { canvas, onGone, stop } = setup();
  canvas.dispatchEvent(lost());
  stop();
  mock.timers.tick(CONTEXT_RESTORE_WAIT_MS);
  assert.equal(onGone.mock.callCount(), 0);
});
