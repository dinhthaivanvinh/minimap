// Tests for the team fund's shared rules: reading the sheet, tiers, hiding and name suggestions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canHide, csvUrl, FundSheetError, parseSheet, sheetId, shownTier, suggestLinks, tierFor } from './fund.ts';

const SHEET = [
  '"Name","","Title"',
  '"anh n","-1","Con nợ"',
  '"Bặp Bặp","-3","Ốt dột"',
  '"cô Cà","1","Tốn tiền"',
  '"Thuận thảm thương","","Hm..."',
  '"Say ""hi""","4","Hào sảng"',
  '"Total Quỹ","",""',
  '',
].join('\n');

test('a tier follows the bands of the sheet’s title table', () => {
  const tiers = [-12, -3, -2, -1, 0, 1, 2, 3, 5, 6, 11, 12].map(tierFor);
  assert.deepEqual(tiers, ['broke', 'broke', 'broke', 'debtor', 'normal', 'rich', 'rich', 'generous', 'generous', 'tycoon', 'tycoon', 'billionaire']);
});

test('only people ahead can hide, and a hidden look comes back once they fall behind', () => {
  assert.equal(canHide('debtor'), false);
  assert.equal(canHide('normal'), false);
  assert.equal(canHide('rich'), true);
  assert.equal(shownTier({ tier: 'normal', hidden: false }), null);
  assert.equal(shownTier({ tier: 'rich', hidden: true }), null);
  assert.equal(shownTier({ tier: 'rich', hidden: false }), 'rich');
  assert.equal(shownTier({ tier: 'broke', hidden: true }), 'broke');
  assert.equal(shownTier(undefined), null);
});

test('the sheet’s rows keep names and titles, count a blank number as 0 and skip totals', () => {
  assert.deepEqual(parseSheet(SHEET, 2026), [
    { name: 'anh n', months: -1, title: 'Con nợ' },
    { name: 'Bặp Bặp', months: -3, title: 'Ốt dột' },
    { name: 'cô Cà', months: 1, title: 'Tốn tiền' },
    { name: 'Thuận thảm thương', months: 0, title: 'Hm...' },
    { name: 'Say "hi"', months: 4, title: 'Hào sảng' },
  ]);
});

test('another tab, which Google sends when the year’s tab is missing, is refused', () => {
  assert.throws(() => parseSheet('"1","Rick","500 đ"\n"2","Thảo","500 đ"', 2030), (err) => err instanceof FundSheetError && /2030/.test(err.message));
  assert.throws(() => parseSheet('', 2026), FundSheetError);
});

test('odd numbers are kept in range', () => {
  const rows = parseSheet('"Name","","Title"\n"a","99","X"\n"b","oops","Y"\n"c","1.5","Z"', 2026);
  assert.deepEqual(rows.map((r) => r.months), [12, 0, 0]);
});

test('a sheet id comes from a link or a bare id', () => {
  const id = '1GZPUWxBnRo4uqO4mXbiTq78d6mn09PdTTAYVNP9uTLc';
  assert.equal(sheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=2018447032`), id);
  assert.equal(sheetId(` ${id} `), id);
  assert.equal(sheetId('https://evil.example/spreadsheets/d/1GZPUWxBnRo4uqO4mXbiTq78d6/'), null);
  assert.equal(sheetId('not a sheet'), null);
  assert.match(csvUrl(id, 2026), /\/d\/1GZPUWxBnRo4uqO4mXbiTq78d6mn09PdTTAYVNP9uTLc\/gviz\/tq\?.*sheet=2026/);
});

test('suggestions match obvious names and skip unclear ones', () => {
  const names = ['Vinh', 'Định', 'anh Trung Cộng', 'Quang cat lon', 'Quang cat nho', 'cô Cà'];
  const found = suggestLinks(['vinh', 'dinh', 'trung', 'quang', 'ca', 'x'], names);
  assert.deepEqual(Object.fromEntries(found), { vinh: 'Vinh', dinh: 'Định', trung: 'anh Trung Cộng', ca: 'cô Cà' });
});
