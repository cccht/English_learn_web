import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';

const ink = {
  baseRevision: 0,
  formatVersion: 1,
  pageWidth: 720,
  textNote: 'A reading note',
  strokes: [
    {
      id: 'stroke-1',
      tool: 'pen',
      color: '#3869ab',
      size: 4,
      pressure: true,
      points: [
        [42, 80, 0.2],
        [140, 100, 0.8],
      ],
    },
  ],
};
async function fixture(t, options = {}) {
  const service = createApp({ dbPath: ':memory:', ...options });
  await service.ready;
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await service.close();
  };
  t.after(close);
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = 'GET', body, cookie) => {
    const response = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    return {
      status: response.status,
      data,
      raw,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  };
  const start = async (cookie) => {
    const bootstrap = await request('/api/bootstrap', 'GET', undefined, cookie);
    const paper = bootstrap.data.papers.find((paper) => paper.available);
    const attempt = (await request('/api/attempts', 'POST', { paperId: paper.id }, cookie)).data;
    return {
      ...attempt,
      path: `/api/attempts/${attempt.attempt.id}/annotations/${attempt.paper.sections[0].groups[0].id}`,
    };
  };
  return { ...service, request, start, close };
}

test('annotation revisions preserve pressure and notes across database reopen; scores remain unchanged', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'shici-ink-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'data.sqlite');
  const f = await fixture(t, { dbPath });
  const session = await f.start();
  assert.deepEqual((await f.request(session.path)).data.annotation.strokes, []);
  const saved = await f.request(session.path, 'PUT', ink);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.annotation.revision, 1);
  assert.deepEqual(saved.data.annotation.strokes, ink.strokes);
  const conflict = await f.request(session.path, 'PUT', { ...ink, textNote: 'stale' });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.annotation.textNote, ink.textNote);
  const submitted = (
    await f.request(`/api/attempts/${session.attempt.id}/submit`, 'POST', { answers: {} })
  ).data;
  assert.equal(
    (await f.request(session.path, 'PUT', { ...ink, baseRevision: 1, textNote: 'Review note' }))
      .status,
    200,
  );
  assert.deepEqual(
    (await f.request(`/api/attempts/${session.attempt.id}`)).data.attempt.result,
    submitted.attempt.result,
  );
  assert.equal((await f.request('/api/bootstrap')).raw.includes('Review note'), false);
  await f.close();
  const reopened = await fixture(t, { dbPath });
  const restored = (await reopened.request(session.path)).data.annotation;
  assert.equal(restored.revision, 2);
  assert.equal(restored.textNote, 'Review note');
  assert.deepEqual(restored.strokes, ink.strokes);
});

test('annotation validation rejects malformed, over-limit or unsafe ink without overwriting data', async (t) => {
  const f = await fixture(t);
  const s = await f.start();
  for (const body of [
    { ...ink, pageWidth: 800 },
    { ...ink, baseRevision: -1 },
    { ...ink, textNote: 'x'.repeat(10001) },
    { ...ink, strokes: [ink.strokes[0], ink.strokes[0]] },
    { ...ink, strokes: [{ ...ink.strokes[0], color: 'url(https://example.test)' }] },
    { ...ink, strokes: [{ ...ink.strokes[0], points: [[721, 4, 0.5]] }] },
    { ...ink, strokes: [{ ...ink.strokes[0], points: [[4, 4, 2]] }] },
    {
      ...ink,
      strokes: [{ ...ink.strokes[0], points: Array.from({ length: 5001 }, () => [1, 2, 0.5]) }],
    },
  ])
    assert.equal((await f.request(s.path, 'PUT', body)).status, 400);
  assert.equal((await f.request(s.path)).data.annotation.revision, 0);
  assert.equal(
    (await f.request(`/api/attempts/${s.attempt.id}/annotations/no-such-group`)).status,
    404,
  );
  const section = s.paper.sections[2],
    group = section.groups.at(-1);
  const changed = await f.request(`/api/attempts/${s.attempt.id}`, 'PATCH', {
    currentSection: section.id,
    currentGroup: group.id,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.attempt.currentGroup, group.id);
  assert.equal(
    (
      await f.request(`/api/attempts/${s.attempt.id}`, 'PATCH', {
        currentGroup: s.paper.sections[0].groups[0].id,
      })
    ).status,
    400,
  );
});

test('annotation endpoints require login and never expose another user draft', async (t) => {
  const access = {
    password: 'admin-long-password',
    sessionSecret: 'secret-at-least-thirty-two-characters-long',
  };
  const f = await fixture(t, { access });
  const admin = (
    await f.request('/login', 'POST', { username: 'admin', password: access.password })
  ).cookie;
  const user = (
    await f.request('/register', 'POST', {
      username: 'ink_learner',
      displayName: 'Learner',
      password: 'learner-long-password',
      passwordConfirm: 'learner-long-password',
    })
  ).cookie;
  const s = await f.start(admin);
  assert.equal((await f.request(s.path, 'PUT', ink, admin)).status, 200);
  assert.equal((await f.request(s.path)).status, 401);
  assert.equal((await f.request(s.path, 'GET', undefined, user)).status, 404);
  assert.equal((await f.request(s.path, 'PUT', ink, user)).status, 404);
  assert.equal(
    (await f.request(s.path, 'GET', undefined, admin)).data.annotation.textNote,
    ink.textNote,
  );
});
