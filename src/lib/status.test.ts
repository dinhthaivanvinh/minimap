import test from 'node:test';
import assert from 'node:assert/strict';
import { statusKind } from './look.ts';
import { isStopWorkStatus, placeChange, STOP_WORK_REASONS } from './status.ts';

test('coming back to work clears the reason for stopping', () => {
  assert.deepEqual(placeChange('main', 'Left early'), { place: 'main', status: '' });
  assert.deepEqual(placeChange('wfh', 'Left early'), { place: 'wfh', status: '' });
});

test('other statuses are left alone when changing place', () => {
  assert.deepEqual(placeChange('main', 'In a meeting'), { place: 'main' });
  assert.deepEqual(placeChange('main', ''), { place: 'main' });
});

test('choosing Off or Out of Office by hand also clears it', () => {
  assert.deepEqual(placeChange('off', 'Left early'), { place: 'off', status: '' });
  assert.deepEqual(placeChange('out', 'Left early'), { place: 'out', status: '' });
});

test('reasons are recognised, and short enough to show on the map', () => {
  assert.equal(isStopWorkStatus('Left early'), true);
  assert.equal(isStopWorkStatus('Back soon'), false);
  for (const reason of STOP_WORK_REASONS) assert.equal(statusKind(reason.status), 'short', reason.status);
});
