// Tests for who wears a party hat today and when confetti plays for new wishes.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { CelebrateView } from '../../shared/celebrate.ts';
import { wishReactions, withCelebration } from './celebrateLook.ts';

const view = (wishes: string[], today = '2026-11-10'): CelebrateView => ({
  today,
  celebrations: [
    { username: 'lan', kind: 'birthday', date: today, days: 0, wishes },
    { username: 'minh', kind: 'anniversary', date: '2026-11-12', days: 2, years: 3, wishes: [] },
  ],
});

test('only people celebrating today are dressed up', () => {
  const users = [{ username: 'lan' }, { username: 'minh' }, { username: 'bob' }];
  assert.deepEqual(withCelebration(users, view([])), [{ username: 'lan', celebration: 'birthday' }, { username: 'minh' }, { username: 'bob' }]);
  assert.equal(withCelebration(users, null), users);
});

test('new wishes play confetti once, and a new day or a fresh map plays nothing', () => {
  assert.deepEqual(wishReactions(view([]), view(['bob'])), [{ username: 'lan', kind: 'confetti', ms: 1500 }]);
  assert.deepEqual(wishReactions(view(['bob']), view(['bob'])), []);
  assert.deepEqual(wishReactions(null, view(['bob'])), []);
  assert.deepEqual(wishReactions(view([], '2026-11-09'), view(['bob'])), []);
});
