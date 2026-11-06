import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import catalog from '../shared/illustrations.json' with { type: 'json' };

test('illustration family uses eight distinct, local, consistently sized optimized assets', () => {
  assert.deepEqual(Object.keys(catalog.items).sort(), [
    'insights',
    'organize',
    'reading',
    'review',
    'search',
    'timer',
    'words',
    'writing',
  ]);
  const paths = new Set();
  for (const asset of Object.values(catalog.items)) {
    assert.match(asset.src, /^\/images\/mascots\/[a-z]+\.webp$/);
    assert.equal(asset.width, 512);
    assert.equal(asset.height, 512);
    assert.ok(!paths.has(asset.src));
    paths.add(asset.src);
    const bytes = readFileSync(resolve('public', '.' + asset.src));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.ok(bytes.length > 1000 && bytes.length < 100000, `${asset.src} should be optimized`);
  }
});

test('homepage scene illustrations share a wide, uncropped, optimized format', () => {
  assert.deepEqual(Object.keys(catalog.scenes), ['practice', 'notes', 'review']);
  for (const asset of Object.values(catalog.scenes)) {
    assert.match(asset.src, /^\/images\/feature-illustrations\/[a-z][a-z0-9-]*\.webp$/);
    assert.equal(asset.width, 1200);
    assert.equal(asset.height, 400);
    const bytes = readFileSync(resolve('public', '.' + asset.src));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.ok(bytes.length > 1000 && bytes.length < 120000, `${asset.src} should be optimized`);
  }
});

test('brand icons exist and the shared stylesheet is loaded by the application shell', () => {
  const html = readFileSync(resolve('index.html'), 'utf8');
  assert.match(html, /illustrations\.css/);
  for (const path of Object.values(catalog.icons)) {
    assert.ok(html.includes(path));
    const data = readFileSync(resolve('public', '.' + path));
    assert.equal(data.toString('ascii', 1, 4), 'PNG');
  }
});

test('the corrected practice illustration keeps its original artwork and verifiable history', () => {
  assert.equal(catalog.scenes.practice.src, '/images/feature-illustrations/practice-feet-v2.webp');
  const base = resolve('docs/design/feature-illustrations');
  const current = JSON.parse(readFileSync(resolve(base, 'assets.json'), 'utf8')).practice;
  assert.equal(current.previousVersions.length, 1);
  assert.notEqual(current.webSha256, current.previousVersions[0].webSha256);
  for (const version of [current, ...current.previousVersions]) {
    for (const [path, expected] of [
      [version.original, version.sourceSha256],
      [version.web, version.webSha256],
    ]) {
      assert.equal(
        createHash('sha256')
          .update(readFileSync(resolve(base, path)))
          .digest('hex'),
        expected,
      );
    }
  }
});
