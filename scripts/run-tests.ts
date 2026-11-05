// Runs the tests like `node --test`, which reports success even when it finds none.
// That would let CI pass having checked nothing, so finding no tests is a failure here.
import { run } from 'node:test';
import { spec } from 'node:test/reporters';

const globPatterns = process.argv.slice(2);
let ran = 0;

// The time limit fails a test that hangs, which would otherwise hold up CI for hours.
const tests = run({ concurrency: true, timeout: 2 * 60 * 1000, ...(globPatterns.length ? { globPatterns } : {}) });
tests.on('test:pass', (event) => {
  // A file with no tests in it also passes, as itself. Real tests also say which file they ran from.
  const isRealTest = 'entryFile' in event;
  if (isRealTest && event.skip === undefined && event.todo === undefined) ran++;
});
tests.on('test:fail', ({ todo }) => {
  ran++;
  if (todo === undefined) process.exitCode = 1;
});
tests.compose(spec).pipe(process.stdout);
tests.on('end', () => {
  if (ran > 0) return;
  console.error('\nNo tests ran, so nothing was checked.');
  process.exitCode = 1;
});
