import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { parseSetCookie, stringifyCookie } from 'cookie';
import { createAccessGate } from '../server/access.mjs';
import { createApp } from '../server/app.mjs';
import { createStore } from '../server/store.mjs';
import { createAccounts } from '../server/accounts.mjs';

const credentials = {
  password: 'test-password-long-enough',
  sessionSecret: 'test-session-secret-32-characters-long',
};
async function fixture(t, options = {}, useApp = false) {
  const service = useApp
    ? createApp({ dbPath: ':memory:', initialPapers: [], access: { ...credentials, ...options } })
    : null;
  const app = service?.app || express();
  const accountStore = service ? null : createStore(':memory:');
  const accounts = accountStore
    ? createAccounts({
        db: accountStore.db,
        bootstrapPassword: credentials.password,
        now: options.now,
      })
    : null;
  if (!service) {
    app.set('trust proxy', 'loopback');
    app.use(createAccessGate({ ...credentials, ...options, accounts }));
    app.get('/api/private', (_req, res) => res.json({ private: true }));
    app.post('/api/private', (_req, res) => res.json({ saved: true }));
    app.get('/assets/test.js', (_req, res) => res.type('text/javascript').send('void 0;'));
    app.get('/', (_req, res) => res.send('private app'));
  }
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (service) await service.close();
    if (accounts) await accounts.ready;
    accountStore?.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options });
  const login = async (password = credentials.password, headers = {}) =>
    request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams({ username: 'admin', password }),
    });
  const cookie = (response) => {
    const value = parseSetCookie(response.headers.get('set-cookie'));
    return stringifyCookie({ [value.name]: value.value });
  };
  return { request, login, cookie, base };
}

test('unauthenticated users cannot read APIs or the private app; login and static assets remain available', async (t) => {
  const { request } = await fixture(t);
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /data-initial-auth="home"/);
  const response = await request('/api/private');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
  const page = await request('/login');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal((await request('/assets/test.js')).status, 200);
});

test('login issues an HTTP-only signed session and wrong passwords are never reflected', async (t) => {
  const { request, login, cookie } = await fixture(t);
  const bad = await login('wrong-password-secret');
  assert.equal(bad.status, 401);
  assert.equal((await bad.text()).includes('wrong-password-secret'), false);
  const signed = await login();
  assert.equal(signed.status, 303);
  assert.match(signed.headers.get('set-cookie'), /HttpOnly/);
  assert.match(signed.headers.get('set-cookie'), /SameSite=Strict/);
  const authenticated = await request('/api/private', { headers: { cookie: cookie(signed) } });
  assert.equal(authenticated.status, 200);
  assert.deepEqual(await authenticated.json(), { private: true });
  assert.equal(authenticated.headers.get('cache-control'), 'no-store');
});

test('public homepage exposes only product content; modal login negotiates JSON without weakening sessions', async (t) => {
  const { request, login, cookie } = await fixture(t);
  const home = await request('/');
  const html = await home.text();
  assert.match(html, /为每一次认真学习/);
  assert.match(html, /data-auth-dialog/);
  assert.match(html, /reading-room-image/);
  assert.match(html, /reading-room-poster\.webp/);
  assert.match(html, /home-static\.css/);
  assert.equal(html.includes('assets/home-scene.js'), false);
  assert.equal(html.includes('data-home-scene'), false);
  assert.equal(html.includes('<canvas'), false);
  assert.equal(html.includes('data-scene-tools'), false);
  assert.equal(html.includes('private app'), false);
  assert.equal(html.includes(credentials.password), false);
  const bad = await login('do-not-reflect-this-secret', { accept: 'application/json' });
  assert.equal(bad.status, 401);
  assert.match(bad.headers.get('content-type'), /application\/json/);
  const error = await bad.json();
  assert.match(error.error, /账号或密码/);
  assert.equal(JSON.stringify(error).includes('do-not-reflect-this-secret'), false);
  const signed = await login(credentials.password, { accept: 'application/json' });
  assert.equal(signed.status, 200);
  assert.deepEqual(await signed.json(), { ok: true, redirect: '/' });
  assert.match(signed.headers.get('set-cookie'), /HttpOnly/);
  const app = await request('/', { headers: { cookie: cookie(signed) } });
  assert.equal(await app.text(), 'private app');
});

test('homepage features are all rendered in reading order with native section anchors', async (t) => {
  const { request } = await fixture(t);
  const html = await (await request('/')).text();
  let previous = -1;
  for (const id of ['practice', 'notes', 'review']) {
    const section = `<section class="feature-section" id="${id}" aria-labelledby="feature-title-${id}">`;
    const position = html.indexOf(section);
    assert.ok(position > previous, `${id} is rendered in order and is not hidden`);
    assert.ok(html.includes(`href="#${id}" data-feature-link="${id}"`));
    assert.ok(html.includes(`<h3 id="feature-title-${id}">`));
    previous = position;
  }
  assert.equal(html.includes('role="tablist"'), false);
  assert.equal(html.includes('role="tabpanel"'), false);
  assert.equal(html.includes('data-feature-tab='), false);
  assert.equal(html.split('buddy-size-feature').length - 1, 9);
  assert.equal(html.split('data-feature-scene=').length - 1, 3);
  assert.equal(html.includes('class="feature-icon"'), false);
});

test('JSON registration follows administrator toggle and keeps native form fallback', async (t) => {
  const { request, login, cookie } = await fixture(t, {}, true);
  const admin = cookie(await login());
  const signup = (username, json = true) =>
    request('/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(json ? { accept: 'application/json' } : {}),
      },
      body: JSON.stringify({
        username,
        displayName: 'Learner',
        password: 'a-long-learner-password',
        passwordConfirm: 'a-long-learner-password',
      }),
    });
  const signed = await signup('modal_learner');
  assert.equal(signed.status, 200);
  assert.deepEqual(await signed.json(), { ok: true, redirect: '/' });
  assert.ok(cookie(signed));
  await request('/api/admin/registration', {
    method: 'PATCH',
    headers: { cookie: admin, 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  });
  const closed = await signup('blocked_learner');
  assert.equal(closed.status, 403);
  assert.deepEqual(await closed.json(), {
    error: '管理员已关闭注册，已有账号仍可登录。',
    registrationEnabled: false,
  });
  const native = await signup('native_blocked', false);
  assert.equal(native.status, 403);
  assert.match(await native.text(), /注册暂未开放/);
});

test('tampered sessions, expired sessions and sessions from a different secret are rejected', async (t) => {
  let now = Date.now();
  const first = await fixture(t, { now: () => now });
  const signed = first.cookie(await first.login());
  assert.equal(
    (await first.request('/api/private', { headers: { cookie: signed + 'x' } })).status,
    401,
  );
  now += 7 * 86400000 + 1000;
  assert.equal((await first.request('/api/private', { headers: { cookie: signed } })).status, 401);
  const second = await fixture(t, { sessionSecret: 'another-test-secret-with-over-32-characters' });
  assert.equal((await second.request('/api/private', { headers: { cookie: signed } })).status, 401);
});

test('cross-origin login and writes are blocked, and logout clears the session', async (t) => {
  const { request, login, cookie, base } = await fixture(t);
  assert.equal(
    (await login(credentials.password, { origin: 'https://unrelated.example' })).status,
    403,
  );
  const value = cookie(await login());
  assert.equal(
    (
      await request('/api/private', {
        method: 'POST',
        headers: { cookie: value, origin: 'https://unrelated.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('/api/private', { method: 'POST', headers: { cookie: value, origin: base } }))
      .status,
    200,
  );
  const out = await request('/logout', {
    method: 'POST',
    headers: { cookie: value, origin: base },
  });
  assert.equal(out.status, 303);
  assert.equal(out.headers.get('location'), '/login');
  assert.match(out.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
});

test('public HTTPS sessions are secure and weak startup credentials fail closed', async (t) => {
  assert.throws(() => createAccessGate({ password: 'short', sessionSecret: 'short' }));
  const { login } = await fixture(t, { publicOrigin: 'https://study.example' });
  const response = await login(credentials.password, {
    host: 'study.example',
    origin: 'https://study.example',
    'x-forwarded-proto': 'https',
  });
  assert.equal(response.status, 303);
  assert.match(response.headers.get('set-cookie'), /Secure/);
});

test('a new Quick Tunnel accepts its own browser origin', async (t) => {
  const { login } = await fixture(t, { publicOrigin: 'https://old.example' });
  const response = await login(credentials.password, {
    'x-forwarded-host': 'fresh.trycloudflare.com',
    'x-forwarded-proto': 'https',
    origin: 'https://fresh.trycloudflare.com',
  });
  assert.equal(response.status, 303);
});

test('real learning endpoints and saved AI settings are behind the same access gate', async (t) => {
  const { request, login, cookie } = await fixture(t, {}, true);
  for (const path of ['/api/bootstrap', '/api/ai/config', '/api/words/export', '/api/insights'])
    assert.equal((await request(path)).status, 401);
  const response = await request('/api/bootstrap', { headers: { cookie: cookie(await login()) } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).accessRequired, true);
});
