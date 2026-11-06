import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSetCookie, stringifyCookie } from 'cookie';
import { createApp } from '../server/app.mjs';
import { createStore } from '../server/store.mjs';

const access = {
  password: 'original-owner-password-long',
  sessionSecret: 'owner-session-secret-at-least-thirty-two-characters',
};
const password = 'A-user-password-2026';
async function fixture(t, overrides = {}) {
  const service = createApp({ dbPath: ':memory:', access, ...overrides });
  await service.ready;
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await service.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
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
    const header = response.headers.get('set-cookie');
    const parsed = header ? parseSetCookie(header) : null;
    return {
      status: response.status,
      data,
      raw,
      cookie: parsed ? stringifyCookie({ [parsed.name]: parsed.value }) : undefined,
    };
  }
  const login = (username = 'admin', value = access.password) =>
    request('/login', { method: 'POST', body: { username, password: value } });
  const register = (username, extra = {}) =>
    request('/register', {
      method: 'POST',
      body: { username, displayName: username, password, passwordConfirm: password, ...extra },
    });
  return { ...service, request, login, register };
}

test('administrator bootstraps once and passwords are salted hashes, not plaintext', async (t) => {
  const f = await fixture(t);
  const admin = f.accounts.findUser('admin');
  assert.equal(admin.id, 'admin');
  assert.equal(admin.role, 'admin');
  assert.match(admin.password_hash, /^scrypt:32768:8:3:/);
  assert.equal(admin.password_hash.includes(access.password), false);
  const a = await f.register('learner_one');
  const b = await f.register('learner_two');
  assert.equal(a.status, 303);
  assert.equal(b.status, 303);
  assert.notEqual(
    f.accounts.findUser('learner_one').password_hash,
    f.accounts.findUser('learner_two').password_hash,
  );
  const listed = await f.request('/api/admin/settings', { cookie: (await f.login()).cookie });
  assert.equal(listed.data.users.length, 3);
  assert.equal(listed.raw.includes('password_hash'), false);
  assert.equal(listed.raw.includes(password), false);
});

test('registration never accepts an admin role, duplicate case variants, weak or mismatched passwords', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.register('learner_one', { role: 'admin' })).status, 400);
  assert.equal(
    (await f.register('learner_one', { password: 'short', passwordConfirm: 'short' })).status,
    400,
  );
  assert.equal(
    (await f.register('learner_one', { passwordConfirm: 'different-password' })).status,
    400,
  );
  assert.equal((await f.register('learner_one')).status, 303);
  assert.equal((await f.register('LEARNER_ONE')).status, 409);
  assert.equal(f.accounts.findUser('learner_one').role, 'user');
  assert.equal((await f.login('LEARNER_ONE', password)).status, 303);
});

test('only administrator controls registration; closing it blocks posts but keeps existing login', async (t) => {
  const f = await fixture(t);
  const admin = (await f.login()).cookie;
  const learner = (await f.register('learner_one')).cookie;
  assert.equal((await f.request('/api/admin/settings', { cookie: learner })).status, 403);
  assert.equal(
    (
      await f.request('/api/admin/registration', {
        method: 'PATCH',
        cookie: learner,
        body: { enabled: false },
      })
    ).status,
    403,
  );
  const changed = await f.request('/api/admin/registration', {
    method: 'PATCH',
    cookie: admin,
    body: { enabled: false },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.registrationEnabled, false);
  const page = await f.request('/register');
  assert.match(page.raw, /注册暂未开放/);
  assert.equal(page.raw.includes('data-auth-form="register"'), false);
  assert.equal((await f.register('another_user')).status, 403);
  assert.equal((await f.login('learner_one', password)).status, 303);
  await f.request('/api/admin/registration', {
    method: 'PATCH',
    cookie: admin,
    body: { enabled: true },
  });
  assert.equal((await f.register('another_user')).status, 303);
});

test('closing registration while password hashing is pending prevents account creation', async (t) => {
  const f = await fixture(t);
  const pending = f.accounts.register({
    username: 'pending_user',
    displayName: 'Pending',
    password,
  });
  await new Promise((resolve) => setImmediate(resolve));
  f.accounts.setRegistration(false);
  await assert.rejects(pending, (error) => error.status === 403);
  assert.equal(f.accounts.findUser('pending_user'), undefined);
});

test('accounts cannot read or mutate each others attempts, vocabulary, private papers or AI configuration', async (t) => {
  const f = await fixture(t, {
    aiDefaultConfig: { model: 'admin-model', apiKey: 'admin-fixture-secret' },
  });
  const admin = (await f.login()).cookie;
  const alice = (await f.register('alice_user')).cookie;
  const bob = (await f.register('bob_user')).cookie;
  const aWord = await f.request('/api/words', {
    method: 'POST',
    cookie: alice,
    body: { word: 'serendipity', context: 'Alice private context.' },
  });
  const bWord = await f.request('/api/words', {
    method: 'POST',
    cookie: bob,
    body: { word: 'serendipity', context: 'Bob private context.' },
  });
  assert.equal(aWord.status, 201);
  assert.equal(bWord.status, 201);
  const wordId = aWord.data.word.id;
  assert.equal(
    (
      await f.request('/api/words/' + wordId, {
        method: 'PATCH',
        cookie: bob,
        body: { definition: 'Intrusion' },
      })
    ).status,
    404,
  );
  assert.equal(
    (await f.request('/api/words/' + wordId, { method: 'DELETE', cookie: bob })).status,
    404,
  );
  const aAttempt = await f.request('/api/attempts', {
    method: 'POST',
    cookie: alice,
    body: { paperId: 'practice-001' },
  });
  assert.equal(aAttempt.status, 201);
  const attemptId = aAttempt.data.attempt.id;
  const writingId = aAttempt.data.paper.sections.find((section) => section.id === 'writing')
    .groups[0].questions[0].id;
  const longAnswer = 'Writing practice. '.repeat(700);
  assert.equal(
    (
      await f.request('/api/attempts/' + attemptId, {
        method: 'PATCH',
        cookie: alice,
        body: { answers: { [writingId]: longAnswer } },
      })
    ).status,
    200,
  );
  assert.equal((await f.request('/api/attempts/' + attemptId, { cookie: bob })).status, 404);
  assert.equal(
    (
      await f.request('/api/attempts/' + attemptId + '/submit', {
        method: 'POST',
        cookie: bob,
        body: {},
      })
    ).status,
    404,
  );
  const bobData = (await f.request('/api/bootstrap', { cookie: bob })).data;
  assert.equal(bobData.words.length, 1);
  assert.equal(bobData.words[0].context, 'Bob private context.');
  assert.equal(bobData.attempts.length, 0);
  assert.equal(bobData.user.username, 'bob_user');
  assert.equal((await f.request('/api/bootstrap', { cookie: admin })).data.words.length, 0);
  const template = (await f.request('/api/template', { cookie: alice })).data;
  template.sections[0].groups[0].passage = 'A complete reading passage. '.repeat(600);
  template.id = 'same-private-paper';
  assert.equal(
    (await f.request('/api/papers', { method: 'POST', cookie: alice, body: template })).status,
    201,
  );
  assert.equal((await f.request('/api/papers/' + template.id, { cookie: bob })).status, 404);
  assert.equal(
    (await f.request('/api/papers', { method: 'POST', cookie: bob, body: template })).status,
    201,
  );
  assert.equal(
    (
      await f.request('/api/admin/ai-provider', {
        method: 'PATCH',
        cookie: alice,
        body: { baseUrl: 'http://127.0.0.1:11434' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/ai/config', {
        method: 'PUT',
        cookie: alice,
        body: { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'private-model' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/ai/config', {
        method: 'PUT',
        cookie: alice,
        body: { baseUrl: 'https://arbitrary.example/v1' },
      })
    ).status,
    403,
  );
  await f.request('/api/admin/ai-provider', {
    method: 'PATCH',
    cookie: admin,
    body: { baseUrl: 'https://alice.example/v1' },
  });
  const aConfig = await f.request('/api/ai/config', {
    method: 'PUT',
    cookie: alice,
    body: {
      baseUrl: 'https://alice.example/v1',
      model: 'alice-model',
      apiKey: 'alice-private-key',
    },
  });
  assert.equal(aConfig.data.hasApiKey, true);
  assert.equal(aConfig.data.managedEndpoint, true);
  const bConfig = (await f.request('/api/ai/config', { cookie: bob })).data;
  assert.equal(bConfig.hasApiKey, false);
  assert.equal(bConfig.model, '');
  assert.equal((await f.request('/api/ai/config', { cookie: admin })).data.model, 'admin-model');
  await f.request('/api/admin/ai-provider', {
    method: 'PATCH',
    cookie: admin,
    body: { baseUrl: 'https://approved-new.example/v1' },
  });
  assert.equal((await f.request('/api/ai/config', { cookie: alice })).data.hasApiKey, false);
  const aUser = f.accounts.findUser('alice_user');
  f.store.forUser(aUser.id).saveAiJob({
    id: 'private-job',
    status: 'completed',
    createdAt: new Date().toISOString(),
    rangeDays: 30,
    result: { overview: 'Alice only' },
  });
  assert.equal((await f.request('/api/insights/ai/private-job', { cookie: bob })).status, 404);
  assert.equal(
    (await f.request('/api/words/export?format=json', { cookie: bob })).raw.includes(
      'Alice private context',
    ),
    false,
  );
});

test('disabling an account and changing a password revoke old sessions; administrator cannot be disabled', async (t) => {
  const f = await fixture(t);
  const admin = (await f.login()).cookie;
  const learner = (await f.register('learner_one')).cookie;
  const id = f.accounts.findUser('learner_one').id;
  assert.equal(
    (
      await f.request('/api/admin/users/admin/status', {
        method: 'PATCH',
        cookie: admin,
        body: { active: false },
      })
    ).status,
    400,
  );
  await f.request('/api/admin/users/' + id + '/status', {
    method: 'PATCH',
    cookie: admin,
    body: { active: false },
  });
  assert.equal((await f.request('/api/bootstrap', { cookie: learner })).status, 401);
  assert.equal((await f.login('learner_one', password)).status, 401);
  await f.request('/api/admin/users/' + id + '/status', {
    method: 'PATCH',
    cookie: admin,
    body: { active: true },
  });
  assert.equal((await f.request('/api/bootstrap', { cookie: learner })).status, 401);
  const fresh = (await f.login('learner_one', password)).cookie;
  await f.request('/api/account/password', {
    method: 'PATCH',
    cookie: fresh,
    body: { currentPassword: password, newPassword: 'Changed-password-2026' },
  });
  assert.equal((await f.request('/api/bootstrap', { cookie: fresh })).status, 401);
  assert.equal((await f.login('learner_one', password)).status, 401);
  assert.equal((await f.login('learner_one', 'Changed-password-2026')).status, 303);
});

test('legacy records remain assigned to administrator after migration and other accounts see none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shici-migration-'));
  const path = join(dir, 'legacy.sqlite');
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(
      'CREATE TABLE words (id TEXT PRIMARY KEY, word TEXT NOT NULL UNIQUE, data TEXT NOT NULL)',
    );
    const value = { id: 'legacy-word', word: 'persist', definition: 'Preserved private data' };
    legacy
      .prepare('INSERT INTO words VALUES (?, ?, ?)')
      .run(value.id, value.word, JSON.stringify(value));
    legacy.close();
    const store = createStore(path);
    assert.deepEqual(store.getWord(value.id), value);
    assert.deepEqual(store.forUser('another-user').listWords(), []);
    assert.equal(store.forUser('another-user').getWord(value.id), undefined);
    assert.deepEqual(
      JSON.parse(store.db.prepare('SELECT data FROM words WHERE id = ?').get(value.id).data),
      value,
    );
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('registration setting and changed administrator password survive service recreation', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'shici-auth-persistence-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'accounts.sqlite');
  const first = createApp({ dbPath: path, access });
  await first.ready;
  first.accounts.setRegistration(false);
  await first.accounts.changePassword('admin', access.password, 'New-administrator-password');
  await first.close();
  const second = createApp({ dbPath: path, access });
  await second.ready;
  assert.equal(second.accounts.registrationEnabled(), false);
  assert.equal(await second.accounts.authenticate('admin', access.password), null);
  assert.equal(
    (await second.accounts.authenticate('admin', 'New-administrator-password')).role,
    'admin',
  );
  await second.close();
});
