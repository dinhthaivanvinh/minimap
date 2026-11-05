import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SCRIPT = path.join(import.meta.dirname, 'run-tests.ts');
const IMPORT = "import test from 'node:test';\n";

function runIn(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimap-test-'));
  try {
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    // This variable tells a test run it's inside another one, which would change its output.
    const { NODE_TEST_CONTEXT: _, ...env } = process.env;
    return spawnSync(process.execPath, [SCRIPT], { cwd: dir, env, encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('finding no test files is a failure', () => {
  const { status, stderr } = runIn({ 'notes.txt': 'not a test' });
  assert.equal(status, 1);
  assert.match(stderr, /No tests ran/);
});

test('a test file with no tests in it is a failure', () => {
  assert.equal(runIn({ 'a.test.ts': '// nothing here\n' }).status, 1);
});

test('skipping every test is a failure', () => {
  assert.equal(runIn({ 'a.test.ts': `${IMPORT}test('skipped', { skip: true }, () => {});\n` }).status, 1);
});

test('a passing test succeeds', () => {
  const { status, stdout } = runIn({ 'a.test.ts': `${IMPORT}test('passes', () => {});\n` });
  assert.equal(status, 0, stdout);
});

test('a failing test fails', () => {
  assert.equal(runIn({ 'a.test.ts': `${IMPORT}test('fails', () => { throw new Error('no'); });\n` }).status, 1);
});
