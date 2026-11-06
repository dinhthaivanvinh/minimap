// Tests for reading the login and admin password this browser remembers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { savedAdminPassword, savedLogin } from './savedLogin.ts';

const holding = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null });
const blocked = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
};

test('a saved login is read when it has a token and a username', () => {
  assert.deepEqual(savedLogin(holding({ 'minimap.auth': '{"token":"t","username":"ann"}' })), { token: 't', username: 'ann' });
});

test('anything else, or blocked storage, reads as not logged in', () => {
  for (const text of ['', 'not json', 'null', '[]', '{"token":"t"}', '{"token":1,"username":"ann"}', '{"token":"","username":"ann"}']) {
    assert.equal(savedLogin(holding({ 'minimap.auth': text })), null, text);
  }
  assert.equal(savedLogin(holding({})), null);
  assert.equal(savedLogin(blocked), null);
  assert.equal(savedLogin(undefined), null);
});

test('the admin password is read from its own key, or is empty', () => {
  assert.equal(savedAdminPassword(holding({ 'minimap.admin': 'secret' })), 'secret');
  assert.equal(savedAdminPassword(holding({})), '');
  assert.equal(savedAdminPassword(blocked), '');
});
