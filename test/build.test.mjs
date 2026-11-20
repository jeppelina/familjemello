import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderPage } from '../build.mjs';

// index.html is generated. If this fails, someone edited src/ without rebuilding
// (or edited index.html by hand): run `npm run build`.
test('index.html is up to date with src/', async () => {
  const built = await renderPage();
  const onDisk = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(built === onDisk, 'index.html is stale: run npm run build');
  assert.ok(!onDisk.includes('babel'), 'no in-browser Babel in the published page');
});
