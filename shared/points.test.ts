// Tests for the reward points rules shared by the server and the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPoints,
  cleanIp,
  cleanSettings,
  closeDay,
  DEFAULT_SETTINGS,
  earningOffices,
  ipAllowed,
  officeMinutes,
  pointsFor,
  workdaysText,
} from './points.ts';

const at = (iso: string) => new Date(iso);
const PLACES = ['main', 'other'];

test('only time in office hours on a workday counts, split by day', () => {
  const s = DEFAULT_SETTINGS; // 08:00 to 18:00, Monday to Friday
  // Tuesday 07:30 to 09:15: 75 minutes, from 08:00.
  assert.deepEqual([...officeMinutes(at('2026-11-10T07:30:00Z'), at('2026-11-10T09:15:00Z'), s, 'UTC')], [['2026-11-10', 75]]);
  // Tuesday 17:00 to Wednesday 09:00: an hour each day, nothing overnight.
  assert.deepEqual([...officeMinutes(at('2026-11-10T17:00:00Z'), at('2026-11-11T09:00:00Z'), s, 'UTC')], [['2026-11-10', 60], ['2026-11-11', 60]]);
  // Saturday counts nothing.
  assert.equal(officeMinutes(at('2026-11-14T09:00:00Z'), at('2026-11-14T12:00:00Z'), s, 'UTC').size, 0);
  // The team's clock decides: 01:00 UTC is 08:00 in Ho Chi Minh City.
  assert.deepEqual([...officeMinutes(at('2026-11-10T01:00:00Z'), at('2026-11-10T02:00:00Z'), s, 'Asia/Ho_Chi_Minh')], [['2026-11-10', 60]]);
});

test('points follow the hourly rate, up to the daily cap, and a balance never goes below zero', () => {
  assert.equal(pointsFor(90, DEFAULT_SETTINGS), 15);
  assert.equal(pointsFor(12 * 60, DEFAULT_SETTINGS), 80); // capped at 8 hours
  assert.equal(addPoints(15, -20), 0);
  assert.equal(addPoints(15, 5), 20);
});

test('someone on the day’s list who never checks in loses points, unless nobody checked in at all', () => {
  const minutes = new Map([['lan', 120]]);
  // Tuesday: mai never checked in.
  assert.deepEqual(closeDay('2026-11-10', ['lan', 'mai'], new Set(['lan']), minutes, DEFAULT_SETTINGS), [
    { username: 'lan', earned: 20, penalty: 0 },
    { username: 'mai', earned: 0, penalty: 20 },
  ]);
  // Nobody came: a holiday.
  assert.deepEqual(closeDay('2026-11-10', ['lan', 'mai'], new Set(), new Map(), DEFAULT_SETTINGS), []);
  // Saturday costs nothing.
  assert.deepEqual(closeDay('2026-11-14', ['lan', 'mai'], new Set(['lan']), new Map(), DEFAULT_SETTINGS), []);
});

test('the main office earns unless the admin picked others still on the map', () => {
  assert.deepEqual(earningOffices({ offices: [] }, PLACES), ['main']);
  assert.deepEqual(earningOffices({ offices: ['other', 'gone'] }, PLACES), ['other']);
  assert.deepEqual(earningOffices({ offices: ['gone'] }, PLACES), ['main']);
  assert.deepEqual(earningOffices({ offices: [] }, []), []);
});

test('office addresses are checked exactly or by IPv4 range, and an empty list lets everyone through', () => {
  assert.equal(cleanIp(' 203.0.113.7 '), '203.0.113.7');
  assert.equal(cleanIp('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(cleanIp('203.0.113.0/24'), '203.0.113.0/24');
  assert.equal(cleanIp('2001:DB8::1'), '2001:db8::1');
  for (const bad of ['300.1.1.1', '1.2.3', '1.2.3.4/33', 'office', '2001:db8::/64', 7]) assert.equal(cleanIp(bad), null, String(bad));

  assert.equal(ipAllowed('1.2.3.4', []), true);
  assert.equal(ipAllowed(undefined, ['1.2.3.4']), false);
  assert.equal(ipAllowed('::ffff:203.0.113.7', ['203.0.113.7']), true);
  assert.equal(ipAllowed('203.0.113.200', ['203.0.113.0/24']), true);
  assert.equal(ipAllowed('203.0.114.1', ['203.0.113.0/24']), false);
  assert.equal(ipAllowed('2001:db8::1', ['2001:db8::1']), true);
});

test('settings are checked, and the first problem is explained', () => {
  const good = { ...DEFAULT_SETTINGS, offices: ['other'], ips: ['203.0.113.7', '203.0.113.7'], workdays: [5, 1, 1] };
  assert.deepEqual(cleanSettings(good, PLACES), { ...good, ips: ['203.0.113.7'], workdays: [1, 5] });
  assert.match(cleanSettings({ ...good, perHour: -1 }, PLACES) as string, /Points an hour/);
  assert.match(cleanSettings({ ...good, start: '18:00', end: '08:00' }, PLACES) as string, /end after/);
  assert.match(cleanSettings({ ...good, offices: ['gone'] }, PLACES) as string, /offices that are on the map/);
  assert.match(cleanSettings({ ...good, ips: ['home'] }, PLACES) as string, /home is not an IP address/);
  assert.match(cleanSettings({ ...good, dailyCapHours: 0 }, PLACES) as string, /daily cap/);
  assert.match(cleanSettings('x', PLACES) as string, /object/);
});

test('workdays read naturally', () => {
  assert.equal(workdaysText([1, 2, 3, 4, 5]), 'Mon to Fri');
  assert.equal(workdaysText([5, 1, 3]), 'Mon, Wed, Fri');
  assert.equal(workdaysText([]), 'no days');
});
