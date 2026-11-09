// Tests for how fund tiers dress a character, and for adding the fund to the team's users.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FUND_TIERS } from '../../shared/fund.ts';
import { MAX_DRAWING_POINTS } from '../../shared/look.ts';
import { fundArt, userFundTier, withFund } from './fundLook.ts';

test('normal and hidden looks wear nothing', () => {
  assert.deepEqual(fundArt(null).strokes, []);
  assert.deepEqual(fundArt('normal').strokes, []);
  assert.equal(userFundTier({ fund: { title: 'Tốn tiền', months: 1, tier: 'rich', hidden: true } }), null);
  assert.equal(userFundTier({}), null);
});

test('people behind look poor and get no headwear, people ahead dress up more the richer they are', () => {
  assert.equal(fundArt('broke').mouth, 'frown');
  assert.equal(fundArt('broke').cloud, true);
  assert.equal(fundArt('debtor').mouth, 'flat');
  for (const tier of ['broke', 'debtor'] as const) assert.equal(fundArt(tier).headwear, null);
  assert.equal(fundArt('tycoon').headwear, 'tophat');
  assert.equal(fundArt('billionaire').headwear, 'crown');
  const sizes = (['rich', 'generous', 'tycoon', 'billionaire'] as const).map((tier) => fundArt(tier).strokes.length);
  assert.deepEqual([...sizes].sort((a, b) => a - b), sizes);
});

test('every line stays in the character’s drawing space and within the drawing limits', () => {
  for (const tier of FUND_TIERS) {
    const { strokes } = fundArt(tier);
    const points = strokes.reduce((sum, s) => sum + s.points.length / 2, 0);
    assert.ok(points <= MAX_DRAWING_POINTS, tier);
    for (const stroke of strokes) {
      assert.equal(stroke.points.length % 2, 0);
      stroke.points.forEach((n, i) => assert.ok(n >= 0 && n <= (i % 2 ? 62 : 64), `${tier} point ${n}`));
    }
  }
});

test('the fund is added to the users it belongs to', () => {
  const users = [{ username: 'ann' }, { username: 'bob' }];
  const people = [{ username: 'bob', title: 'Ốt dột', months: -2, tier: 'broke' as const, hidden: false }];
  assert.deepEqual(withFund(users, people), [{ username: 'ann' }, { username: 'bob', fund: { title: 'Ốt dột', months: -2, tier: 'broke', hidden: false } }]);
  assert.equal(withFund(users, null), users);
});
