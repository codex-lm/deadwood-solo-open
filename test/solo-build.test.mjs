import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSolo, UPSTREAM_COMMIT, UPSTREAM_URL } from '../scripts/build-solo.mjs';

// Export contract of the static solo build: manifest, licences and provenance,
// a self-contained bundled executable, and an export directory free of source,
// dev and package files. Comments and vendor strings may still name WebSocket
// and friends, so assertions target actual call and import constructs.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-solo');

const summary = await buildSolo(root);

async function exportFiles() {
  const files = [];
  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, item.name);
      if (item.isDirectory()) await walk(full);
      else files.push(relative(dist, full).split(sep).join('/'));
    }
  }
  await walk(dist);
  return files.sort();
}

test('the export root carries the LOB7 manifest with exact keys and solo English metadata', async () => {
  const manifest = JSON.parse(await readFile(join(dist, 'LOB7-GAME.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(),
    ['assetsLicense', 'controls', 'credits', 'description', 'entrypoint', 'genre', 'license', 'themes', 'title']);
  assert.equal(manifest.title, 'Deadwood Solo Open - Last Night');
  assert.equal(manifest.entrypoint, 'index.html');
  assert.equal(manifest.license, 'MIT');
  assert.deepEqual(manifest.genre, ['Survival', 'FPS']);
  assert.deepEqual(manifest.themes, ['Forest']);
  assert.ok(Array.isArray(manifest.controls) && manifest.controls.length > 0);
  assert.ok(manifest.controls.every(control => typeof control === 'string' && control.length <= 200));
  assert.ok(Array.isArray(manifest.credits) && manifest.credits.every(credit => credit.length <= 200));
  assert.match(manifest.description, /\b(solo|single-player)\b/i);
  assert.match(manifest.description, /\bbrowser\b/i);
  assert.doesNotMatch(manifest.description, /[éèêàçù]/, 'description stays English');
  assert.ok(manifest.credits.includes('Published by Nilo.'));
  assert.ok(manifest.credits.includes('Created with Codex, Claude and Kimi.'));
  assert.ok(manifest.credits.some(credit => credit.includes(UPSTREAM_URL)));
  assert.match(manifest.assetsLicense, /CC BY 4\.0/);
});

test('licence and provenance files keep the upstream copyright intact', async () => {
  assert.equal(await readFile(join(dist, 'LICENSE'), 'utf8'), await readFile(join(root, 'LICENSE'), 'utf8'),
    'LICENSE is copied unchanged');
  assert.match(await readFile(join(dist, 'LICENSE'), 'utf8'), /Copyright \(c\) 2026/);
  assert.equal(await readFile(join(dist, 'ASSETS-LICENSE.md'), 'utf8'), await readFile(join(root, 'ASSETS.md'), 'utf8'),
    'ASSETS.md ships as ASSETS-LICENSE.md');
  const notice = await readFile(join(dist, 'NOTICE.md'), 'utf8');
  assert.ok(notice.includes(UPSTREAM_URL));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.ok(notice.includes(commit), 'NOTICE names the exact upstream commit');
  assert.ok(notice.includes(UPSTREAM_COMMIT), 'NOTICE preserves the actual upstream baseline');
  assert.match(notice, /Three\.js MIT licence/);
  assert.match(notice, /MIT/);
  assert.match(notice, /CC BY 4\.0/);
  assert.match(notice, /no gameplay backend/i);
  assert.match(notice, /static file server/i);
});

test('index.html is transformed for standalone publishing', async () => {
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  assert.ok(html.includes('<script type="module" src="./game.js"></script>'), 'external module bootstrap');
  assert.equal((html.match(/<script\b/g) ?? []).length, 1, 'no inline bootstrap remains');
  assert.doesNotMatch(html, /\bonclick\s*=/);
  assert.doesNotMatch(html, /href="data:/);
  assert.ok(html.includes('<link rel="icon" href="./favicon.svg">'));
  assert.doesNotMatch(html, /(?:href|src)="\//, 'no absolute href/src paths');
  assert.ok(html.includes('href="./index.html"'), 'brand link points at the local document');
  assert.ok(existsSync(join(dist, 'favicon.svg')));
  assert.match(await readFile(join(dist, 'favicon.svg'), 'utf8'), /^<svg /);
});

test('the bundled executable has no remote imports, dynamic imports, workers or sockets', async () => {
  const bundle = await readFile(join(dist, 'game.js'), 'utf8');
  assert.doesNotMatch(bundle, /^\s*import\s/m, 'no static import statements survive bundling');
  assert.doesNotMatch(bundle, /^\s*export\s+[^;]*\bfrom\s*['"]/m, 'no re-export statements survive bundling');
  assert.doesNotMatch(bundle, /(?:from|import)\s*\(\s*['"]https?:/);
  assert.doesNotMatch(bundle, /(?:from|import)\s+['"]https?:/);
  assert.doesNotMatch(bundle, /(?<![\w$.])import\s*\(/, 'no dynamic import() calls');
  assert.doesNotMatch(bundle, /new\s+(?:Shared)?Worker\s*\(/, 'no worker construction');
  assert.doesNotMatch(bundle, /new\s+WebSocket\s*\(/, 'no socket construction');
  assert.doesNotMatch(bundle, /['"]\/vendor\//, 'no vendor URL references remain');
});

test('the export contains only supported files, no packages, sources or dev pages', async () => {
  const files = await exportFiles();
  const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.glb', '.gltf', '.bin', '.ktx2', '.wav', '.mp3', '.ogg', '.json', '.html', '.css', '.js', '.md']);
  for (const file of files) {
    const parts = file.split('/');
    const name = parts.at(-1);
    assert.ok(parts.every(part => !part.startsWith('.') && part !== 'node_modules' && part !== '.work'), `hidden or work path: ${file}`);
    assert.ok(name !== 'package.json' && !name.endsWith('-lock.json'), `package file: ${file}`);
    assert.ok(!name.includes('.test.'), `test file: ${file}`);
    assert.ok(name === 'LICENSE' || allowedExtensions.has(extname(name).toLowerCase()), `unsupported file: ${file}`);
  }
  assert.deepEqual(files.filter(file => file.endsWith('.js')), ['game.js'], 'bundled code only, no source JS');
  assert.deepEqual(files.filter(file => file.endsWith('.html')), ['index.html'], 'no lookdev or comparison pages');
  assert.deepEqual(files.filter(file => file.endsWith('.css')), ['frisson/feedback.css', 'frisson/frisson.css', 'style.css'], 'game and selectable ambiance styles are shipped');
  for (const required of ['index.html', 'game.js', 'style.css', 'favicon.svg', 'LICENSE', 'ASSETS-LICENSE.md', 'NOTICE.md', 'LOB7-GAME.json', 'audio/manifest.json'])
    assert.ok(files.includes(required), `missing ${required}`);
  assert.ok(files.includes('frisson/cabin.glb'), 'optional cabin dressing is shipped');
  assert.ok(!files.some(file => file.startsWith('levels/')), 'other maps stay outside the cabin edition');
  assert.ok(files.some(file => file.startsWith('audio/') && file.endsWith('.mp3')), 'music is shipped');
  assert.ok(!files.includes('weapon-damage-before.json'), 'dev fixture stays out');
});

test('the export stays within the served-file and size budget', () => {
  assert.ok(summary.files <= 499, `${summary.files} files`);
  assert.ok(summary.expandedBytes <= 256 * 1024 ** 2, `${summary.expandedBytes} bytes expanded`);
  assert.ok(summary.archiveBytes <= 100 * 1024 ** 2, `${summary.archiveBytes} bytes archive estimate`);
  assert.equal(summary.directory, dist);
});

test('repeated builds succeed against an existing export', async () => {
  const again = await buildSolo(root);
  assert.equal(again.directory, dist);
  assert.ok(again.files > 0);
});
