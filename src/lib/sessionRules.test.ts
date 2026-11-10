// Client session decisions must distinguish revoked logins from temporary connection failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldDropSession } from './sessionRules.ts';

test('a missing account or a 401 drops the saved login', () => {
  assert.equal(shouldDropSession(false), true);
  assert.equal(shouldDropSession(true, 401), true);
  assert.equal(shouldDropSession(false, 503), true);
});

test('an unloaded roster or a successful check keeps the saved login', () => {
  assert.equal(shouldDropSession(null), false);
  assert.equal(shouldDropSession(true), false);
  assert.equal(shouldDropSession(true, 200), false);
});

test('network failures and server errors keep credentials available for Retry', () => {
  for (const status of [undefined, 0, 408, 429, 500, 502, 503]) {
    assert.equal(shouldDropSession(true, status), false, `status ${status}`);
  }
});
