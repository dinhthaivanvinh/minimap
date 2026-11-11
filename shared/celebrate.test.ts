// Tests for the rules birthdays and anniversaries share: valid dates, leap days, the coming list and its words.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  celebrations,
  celebrationText,
  dateIn,
  fallsOn,
  isDate,
  isMonthDay,
  todayKind,
  todayText,
  whenText,
  wishesFor,
  type CelebrateDates,
} from './celebrate.ts';

const none: CelebrateDates = { birthday: null, joined: null };

test('only real days count as birthdays and start dates', () => {
  assert.ok(isMonthDay('02-29'));
  assert.ok(isMonthDay('12-31'));
  for (const bad of ['02-30', '13-01', '00-10', '1-5', '04-31', 5, null]) assert.equal(isMonthDay(bad), false, String(bad));
  assert.ok(isDate('2024-02-29'));
  for (const bad of ['2023-02-29', '1969-12-31', '2024-13-01', '2024-1-1', '']) assert.equal(isDate(bad), false, bad);
});

test('a day is read on the team’s calendar, and adding days crosses months and years', () => {
  const late = new Date('2026-11-09T18:30:00Z');
  assert.equal(dateIn(late, 'UTC'), '2026-11-09');
  assert.equal(dateIn(late, 'Asia/Ho_Chi_Minh'), '2026-11-10');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('a 29 February birthday falls on the 28th in other years', () => {
  assert.ok(fallsOn('02-29', '2028-02-29'));
  assert.equal(fallsOn('02-29', '2028-02-28'), false);
  assert.ok(fallsOn('02-29', '2027-02-28'));
  assert.ok(fallsOn('11-10', '2026-11-10'));
});

test('the list runs from today, soonest first, and anniversaries start at one year', () => {
  const people: [string, CelebrateDates][] = [
    ['lan', { birthday: '11-12', joined: null }],
    ['minh', { birthday: null, joined: '2023-11-10' }],
    ['new', { birthday: null, joined: '2026-11-10' }],
    ['past', { birthday: '11-09', joined: null }],
    ['none', none],
  ];
  const list = celebrations(people, '2026-11-10', 30);
  assert.deepEqual(
    list.map((c) => [c.username, c.kind, c.days, c.years]),
    [
      ['minh', 'anniversary', 0, 3],
      ['lan', 'birthday', 2, undefined],
    ],
  );
  // Last year's birthday comes round again within the window it is looked for in.
  assert.equal(celebrations(people, '2026-11-10', 365).find((c) => c.username === 'past')?.date, '2027-11-09');
});

test('a birthday wins over an anniversary on the same day, and wishes are counted once', () => {
  const view = {
    today: '2026-11-10',
    celebrations: [
      { username: 'lan', kind: 'anniversary' as const, date: '2026-11-10', days: 0, years: 2, wishes: ['bob'] },
      { username: 'lan', kind: 'birthday' as const, date: '2026-11-10', days: 0, wishes: ['bob', 'cat'] },
      { username: 'cat', kind: 'birthday' as const, date: '2026-11-11', days: 1, wishes: [] },
    ],
  };
  assert.equal(todayKind(view, 'lan'), 'birthday');
  assert.equal(todayKind(view, 'cat'), null);
  assert.equal(todayKind(null, 'lan'), null);
  assert.deepEqual(wishesFor(view, 'lan'), ['bob', 'cat']);
});

test('the words say whose day it is and when', () => {
  assert.equal(celebrationText({ kind: 'birthday' }, 'Lan'), 'Lan’s birthday');
  assert.equal(celebrationText({ kind: 'anniversary', years: 1 }, 'Minh'), 'Minh: 1 year on the team');
  assert.equal(celebrationText({ kind: 'anniversary', years: 4 }, 'Minh'), 'Minh: 4 years on the team');
  assert.deepEqual([0, 1, 5].map(whenText), ['Today', 'Tomorrow', 'In 5 days']);
  assert.equal(todayText({ kind: 'birthday' }), 'Birthday today!');
  assert.equal(todayText({ kind: 'anniversary', years: 2 }), '2 years on the team today!');
});
