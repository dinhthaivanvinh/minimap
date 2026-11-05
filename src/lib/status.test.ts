import test from 'node:test';
import assert from 'node:assert/strict';
import { statusKind } from './look.ts';
import { clockTime, nextInstant, scheduledText, shownStatus, timeInputValue } from './status.ts';

const AT = new Date(2026, 10, 3, 16, 0).toISOString();
const TIME = clockTime(AT);
const change = (status: string) => ({ at: AT, place: 'out', status });

test('the scheduled text shows the time, with the message if there is one', () => {
  assert.equal(scheduledText({ scheduled: change('Dentist appointment') }), `${TIME}: Dentist appointment`);
  assert.equal(scheduledText({ scheduled: change('') }), `Leaving at ${TIME}`);
});

test('nothing pending means no scheduled text', () => {
  assert.equal(scheduledText({ scheduled: null }), '');
  assert.equal(scheduledText({}), '');
});

test('the shown status joins the current status and the scheduled text', () => {
  assert.equal(shownStatus({ status: '', scheduled: change('Dentist appointment') }), `${TIME}: Dentist appointment`);
  assert.equal(shownStatus({ status: '', scheduled: change('') }), `Leaving at ${TIME}`);
  assert.equal(shownStatus({ status: 'In a meeting', scheduled: change('Dentist appointment') }), `In a meeting · ${TIME}: Dentist appointment`);
  assert.equal(shownStatus({ status: 'In a meeting', scheduled: change('') }), `In a meeting · Leaving at ${TIME}`);
});

test('the shown status is just the status when nothing is pending', () => {
  assert.equal(shownStatus({ status: 'In a meeting', scheduled: null }), 'In a meeting');
  assert.equal(shownStatus({ status: '' }), '');
});

test('a long combined status counts as long, so it moves behind the "!" on badges', () => {
  assert.equal(statusKind('Busy'), 'short');
  assert.equal(statusKind(shownStatus({ status: 'Busy', scheduled: change('Dentist appointment') })), 'long');
});

test('a picked time means today if it is still to come, and tomorrow if it has passed', () => {
  const now = new Date(2026, 10, 3, 13, 0);
  assert.equal(nextInstant('16:00', now), new Date(2026, 10, 3, 16, 0).toISOString());
  assert.equal(nextInstant('12:00', now), new Date(2026, 10, 4, 12, 0).toISOString());
  assert.equal(nextInstant('13:00', now), new Date(2026, 10, 4, 13, 0).toISOString(), 'right now has already passed');
});

test('tomorrow works across the end of a month and a year', () => {
  const now = new Date(2026, 11, 31, 23, 0);
  assert.equal(nextInstant('02:00', now), new Date(2027, 0, 1, 2, 0).toISOString());
});

test('an instant becomes a value for the time input, and back again', () => {
  assert.equal(timeInputValue(new Date(2026, 10, 3, 9, 5).toISOString()), '09:05');
  assert.equal(timeInputValue(nextInstant('16:30', new Date(2026, 10, 3, 13, 0))), '16:30');
});
