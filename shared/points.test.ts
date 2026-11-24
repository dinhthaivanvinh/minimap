// Tests for the reward points rules shared by the server and the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPoints,
  claimWindow,
  cleanSettings,
  closeDay,
  DEFAULT_SETTINGS,
  earningOffices,
  officeMinutes,
  pointsDay,
  pointsFor,
  unclaimed,
  windowsText,
  workdaysText,
} from './points.ts';

const at = (iso: string) => new Date(iso);
const PLACES = ['main', 'other'];

test('only time in office hours on a workday counts, split by day', () => {
  const s = DEFAULT_SETTINGS; // 07:00 to 19:00, Monday to Friday
  // Tuesday 06:30 to 08:15: 75 minutes, from 07:00.
  assert.deepEqual([...officeMinutes(at('2026-11-10T06:30:00Z'), at('2026-11-10T08:15:00Z'), s, 'UTC')], [['2026-11-10', 75]]);
  // Tuesday 18:00 to Wednesday 08:00: an hour each day, nothing overnight.
  assert.deepEqual([...officeMinutes(at('2026-11-10T18:00:00Z'), at('2026-11-11T08:00:00Z'), s, 'UTC')], [['2026-11-10', 60], ['2026-11-11', 60]]);
  // Saturday counts nothing.
  assert.equal(officeMinutes(at('2026-11-14T09:00:00Z'), at('2026-11-14T12:00:00Z'), s, 'UTC').size, 0);
  // The team's clock decides: 01:00 UTC is 08:00 in Ho Chi Minh City.
  assert.deepEqual([...officeMinutes(at('2026-11-10T01:00:00Z'), at('2026-11-10T02:00:00Z'), s, 'Asia/Ho_Chi_Minh')], [['2026-11-10', 60]]);
});

test('points follow the hourly rate, up to the daily cap, and a balance never goes below zero', () => {
  assert.equal(pointsFor(90, DEFAULT_SETTINGS), 15);
  assert.equal(pointsFor(12 * 60, DEFAULT_SETTINGS), 80); // capped at 8 hours
  assert.equal(unclaimed(180, 20, DEFAULT_SETTINGS), 10);
  assert.equal(unclaimed(60, 30, DEFAULT_SETTINGS), 0, 'a lowered cap never takes claimed points back');
  assert.equal(addPoints(15, -20), 0);
  assert.equal(addPoints(15, 5), 20);
});

test('a points day runs from one reset to the next, and Claim works only in its windows that day', () => {
  assert.equal(pointsDay(at('2026-11-10T04:59:00Z'), '05:00', 'UTC'), '2026-11-09');
  assert.equal(pointsDay(at('2026-11-10T05:00:00Z'), '05:00', 'UTC'), '2026-11-10');
  assert.equal(pointsDay(at('2026-11-01T00:30:00Z'), '05:00', 'UTC'), '2026-10-31', 'across a month');

  const day = '2026-11-10';
  const [noon, evening] = DEFAULT_SETTINGS.claimWindows;
  const when = (iso: string) => claimWindow(at(iso), day, DEFAULT_SETTINGS, 'UTC');
  assert.deepEqual(when('2026-11-10T11:59:00Z'), { open: false, window: noon });
  assert.deepEqual(when('2026-11-10T12:00:00Z'), { open: true, window: noon });
  assert.deepEqual(when('2026-11-10T14:00:59Z'), { open: true, window: noon }, 'the last minute counts');
  assert.deepEqual(when('2026-11-10T14:01:00Z'), { open: false, window: evening });
  assert.deepEqual(when('2026-11-10T23:59:30Z'), { open: true, window: evening });
  assert.deepEqual(when('2026-11-11T02:00:00Z'), { open: false, window: null }, 'after midnight, before the reset');
  assert.equal(windowsText(DEFAULT_SETTINGS.claimWindows), '12:00 to 14:00 and 17:00 to 23:59');
});

test('a closed day keeps what was claimed, loses the rest, and fines someone on its list who never checked in', () => {
  const minutes = new Map([['lan', 180], ['kim', 60]]);
  const claimed = new Map([['lan', 20]]);
  // Tuesday: mai never checked in; lan claimed 20 of 30; kim never claimed.
  assert.deepEqual(closeDay('2026-11-10', ['lan', 'mai', 'kim'], new Set(['lan', 'kim']), minutes, claimed, DEFAULT_SETTINGS), [
    { username: 'lan', earned: 20, lost: 10, penalty: 0 },
    { username: 'mai', earned: 0, lost: 0, penalty: 20 },
    { username: 'kim', earned: 0, lost: 10, penalty: 0 },
  ]);
  // Nobody came: a holiday.
  assert.deepEqual(closeDay('2026-11-10', ['lan', 'mai'], new Set(), new Map(), new Map(), DEFAULT_SETTINGS), []);
  // Saturday costs nothing.
  assert.deepEqual(closeDay('2026-11-14', ['lan', 'mai'], new Set(['lan']), new Map(), new Map(), DEFAULT_SETTINGS), []);
});

test('the main office earns unless the admin picked others still on the map', () => {
  assert.deepEqual(earningOffices({ offices: [] }, PLACES), ['main']);
  assert.deepEqual(earningOffices({ offices: ['other', 'gone'] }, PLACES), ['other']);
  assert.deepEqual(earningOffices({ offices: ['gone'] }, PLACES), ['main']);
  assert.deepEqual(earningOffices({ offices: [] }, []), []);
});

test('settings are checked, and the first problem is explained', () => {
  const windows = [{ from: '17:00', to: '23:59' }, { from: '12:00', to: '14:00' }];
  const good = { ...DEFAULT_SETTINGS, offices: ['other'], workdays: [5, 1, 1], claimWindows: windows };
  assert.deepEqual(cleanSettings(good, PLACES), { ...good, workdays: [1, 5], claimWindows: [windows[1], windows[0]] });
  assert.match(cleanSettings({ ...good, perHour: -1 }, PLACES) as string, /Points an hour/);
  assert.match(cleanSettings({ ...good, start: '18:00', end: '08:00' }, PLACES) as string, /end after/);
  assert.match(cleanSettings({ ...good, offices: ['gone'] }, PLACES) as string, /offices that are on the map/);
  assert.match(cleanSettings({ ...good, dailyCapHours: 0 }, PLACES) as string, /daily cap/);
  assert.match(cleanSettings({ ...good, claimWindows: [] }, PLACES) as string, /1 to 4 claim windows/);
  assert.match(cleanSettings({ ...good, claimWindows: [{ from: 'noon', to: '14:00' }] }, PLACES) as string, /look like 12:00 to 14:00/);
  assert.match(cleanSettings({ ...good, claimWindows: ['12:00'] }, PLACES) as string, /look like 12:00 to 14:00/);
  assert.match(cleanSettings({ ...good, claimWindows: [{ from: '14:00', to: '14:00' }] }, PLACES) as string, /end after it starts/);
  assert.match(cleanSettings('x', PLACES) as string, /object/);
});

test('workdays read naturally', () => {
  assert.equal(workdaysText([1, 2, 3, 4, 5]), 'Mon to Fri');
  assert.equal(workdaysText([5, 1, 3]), 'Mon, Wed, Fri');
  assert.equal(workdaysText([]), 'no days');
});
