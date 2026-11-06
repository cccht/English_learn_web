import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createStore } from '../server/store.mjs';
import {
  extractPdf,
  renderPdfPage,
  pdfEngineAvailable,
  pdfSandboxArguments,
  readPdfPreview,
} from '../server/pdf-engine.mjs';
import { parsePdfQuestions } from '../server/pdf-parser.mjs';
import { gradeAttempt } from '../server/scoring.mjs';

const file = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url));
const textPdf = file('text-paper.pdf');

test('sandbox preview outputs cannot follow symlinks to host files', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'shici-preview-output-'));
  try {
    writeFileSync(join(directory, 'private.txt'), 'not an image');
    symlinkSync(join(directory, 'private.txt'), join(directory, 'preview.png'));
    await assert.rejects(
      readPdfPreview(join(directory, 'preview.png')),
      (error) => error.code === 'ELOOP',
    );
    await assert.rejects(readPdfPreview(join(directory, 'private.txt')), /预览输出格式/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
const access = {
  password: 'library-test-password-long',
  sessionSecret: 'library-test-session-secret-is-long-enough',
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function serve(t, options = {}) {
  const service = createApp({ dbPath: ':memory:', initialPapers: [], access, ...options });
  await service.ready;
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await service.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (cookie, path, method = 'GET', body, headers = {}) => {
    const response = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined
          ? {}
          : { 'content-type': Buffer.isBuffer(body) ? 'application/pdf' : 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const data = response.headers.get('content-type')?.includes('json')
      ? JSON.parse(bytes.toString())
      : null;
    return { status: response.status, data, bytes, headers: response.headers };
  };
  const login = await request(
    null,
    '/login',
    'POST',
    { username: 'admin', password: access.password },
    { accept: 'application/json' },
  );
  const admin = login.headers.get('set-cookie').split(';')[0];
  const register = async (name) => {
    const value = await request(
      null,
      '/register',
      'POST',
      {
        username: name,
        displayName: name,
        password: 'member-test-password',
        passwordConfirm: 'member-test-password',
      },
      { accept: 'application/json' },
    );
    assert.equal(value.status, 200);
    return value.headers.get('set-cookie').split(';')[0];
  };
  const waitJob = async (cookie, id) => {
    for (let i = 0; i < 200; i++) {
      const value = await request(cookie, '/api/pdf-imports/' + id);
      if (!['queued', 'extracting', 'ocr'].includes(value.data.job.status)) return value.data.job;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error('PDF job did not finish');
  };
  const importPdf = async (cookie, bytes = textPdf, filename = 'Text paper.pdf') => {
    const started = await request(cookie, '/api/pdf-imports', 'POST', bytes, {
      'x-filename': encodeURIComponent(filename),
    });
    assert.ok([200, 202].includes(started.status), JSON.stringify(started.data));
    const job = await waitJob(cookie, started.data.job.id);
    assert.equal(job.status, 'ready', job.error);
    const result = await request(cookie, `/api/pdf-imports/${job.id}/commit`, 'POST', {
      draft: job.draft,
      revision: job.revision,
      reviewed: true,
    });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return { job, paper: result.data.paper };
  };
  return { ...service, request, register, waitJob, importPdf, admin, base };
}

test(
  'PDF engine extracts real text and raster previews inside a restricted process',
  { skip: !pdfEngineAvailable() },
  async () => {
    const value = await extractPdf(textPdf);
    assert.equal(value.pageCount, 2);
    assert.equal(value.ocrPages, 0);
    assert.match(value.pages[0].text, /library opens at nine/);
    const image = await renderPdfPage(textPdf, 1);
    assert.equal(image.toString('ascii', 1, 4), 'PNG');
    const args = pdfSandboxArguments('/tmp/example', 'pdfinfo', ['input.pdf']);
    assert.ok(args.includes('--unshare-all'));
    assert.ok(args.includes('--clearenv'));
    assert.ok(args.includes('--cap-drop'));
    assert.ok(!args.includes('/root'));
  },
);

test(
  'image-only PDFs use real OCR and preserve page provenance',
  { skip: !pdfEngineAvailable() },
  async () => {
    const value = await extractPdf(file('scanned-paper.pdf'));
    assert.equal(value.ocrPages, 1);
    assert.equal(value.pages[0].method, 'ocr');
    assert.match(value.pages[0].text, /library opens at nine/i);
    const parsed = parsePdfQuestions(value.pages, { id: 'scan', filename: 'scan.pdf' });
    assert.equal(parsed.stats.questionCount, 3);
    assert.equal(parsed.stats.manualGraded, 3);
  },
);

test(
  'invalid, encrypted and excessive-page PDFs are rejected without creating questions',
  { skip: !pdfEngineAvailable() },
  async () => {
    await assert.rejects(extractPdf(Buffer.from('not a PDF at all')), /有效的 PDF/);
    await assert.rejects(extractPdf(file('encrypted-paper.pdf')), /无法解析|加密/);
    await assert.rejects(extractPdf(file('too-many-pages.pdf')), /1 至 80 页/);
  },
);

test('parser separates passages, inline options, answer keys and unanswered manual questions', async () => {
  const parsed = parsePdfQuestions(
    [
      {
        number: 1,
        text: 'Part III Reading Comprehension\nPassage One\nA quiet library opens at nine.\n1. When does it open? A) Eight. B) Nine.\n2. Why visit?\nA) To read.\nB) To cook.\nAnswer Key\n1. B',
      },
    ],
    { id: 'rules', filename: 'rules.pdf' },
  );
  const group = parsed.draft.sections[0].groups[0],
    [first, second] = group.questions;
  assert.equal(first.answer, 'B');
  assert.equal(first.grading, 'auto');
  assert.equal(second.answer, undefined);
  assert.equal(second.grading, 'manual');
  assert.deepEqual(
    first.options.map((option) => option.id),
    ['A', 'B'],
  );
  assert.equal(group.passage, 'A quiet library opens at nine.');
  assert.equal(first.weight + second.weight, 100);
  assert.equal(first.sourcePage, 1);
  assert.ok(!JSON.stringify(group.passage).includes('Answer Key'));
});

test('blank filling and unnumbered writing retain source text without inventing an answer', () => {
  const value = parsePdfQuestions(
    [
      {
        number: 1,
        text: 'Part III Reading Comprehension\nSection A\nA) accessible B) flexible C) barrier D) evidence\nThe library is (26) ____ and offers a (27) ____ schedule.\nPart I Writing\nDirections: Write a paragraph about libraries.',
      },
    ],
    { id: 'cloze', filename: 'cloze.pdf' },
  );
  assert.equal(value.stats.questionCount, 3);
  assert.equal(value.stats.autoGraded, 0);
  assert.equal(value.draft.sections[0].groups[0].questions[0].options.length, 4);
  assert.match(value.draft.sections[0].groups[0].passage, /\(26\)/);
  assert.match(value.draft.sections[1].groups[0].questions[0].prompt, /Write a paragraph/);
});

test('PDF upload, review, edit conflicts, commit and original download work end to end', async (t) => {
  const app = await serve(t);
  const upload = await app.request(app.admin, '/api/pdf-imports', 'POST', textPdf, {
    'x-filename': encodeURIComponent('测试卷.pdf'),
  });
  assert.equal(upload.status, 202);
  let job = await app.waitJob(app.admin, upload.data.job.id);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.stats.questionCount, 4);
  const unreviewed = await app.request(app.admin, `/api/pdf-imports/${job.id}/commit`, 'POST', {
    draft: job.draft,
    revision: job.revision,
    reviewed: false,
  });
  assert.equal(unreviewed.status, 400);
  const initialRevision = job.revision;
  job.draft.title = 'Reviewed PDF';
  const saved = await app.request(app.admin, `/api/pdf-imports/${job.id}/draft`, 'PUT', {
    draft: job.draft,
    revision: job.revision,
  });
  assert.equal(saved.status, 200);
  job = saved.data.job;
  const stale = await app.request(app.admin, `/api/pdf-imports/${job.id}/commit`, 'POST', {
    draft: job.draft,
    revision: initialRevision,
    reviewed: true,
  });
  assert.equal(stale.status, 409);
  const result = await app.request(app.admin, `/api/pdf-imports/${job.id}/commit`, 'POST', {
    draft: job.draft,
    revision: job.revision,
    reviewed: true,
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.paper.title, 'Reviewed PDF');
  const repeat = await app.request(app.admin, `/api/pdf-imports/${job.id}/commit`, 'POST', {});
  assert.equal(repeat.status, 200);
  assert.equal(repeat.data.paper.id, result.data.paper.id);
  const pdf = await app.request(app.admin, `/api/pdf-documents/${job.documentId}`);
  assert.equal(hash(pdf.bytes), hash(textPdf));
  assert.match(pdf.headers.get('content-disposition'), /attachment/);
  const preview = await app.request(app.admin, `/api/pdf-documents/${job.documentId}/pages/1`);
  assert.equal(preview.status, 200);
  assert.equal(preview.bytes.toString('ascii', 1, 4), 'PNG');
  assert.equal(
    (await app.request(app.admin, `/api/pdf-documents/${job.documentId}/pages/3`)).status,
    400,
  );
  const jobs = await app.request(app.admin, '/api/pdf-imports');
  assert.equal(jobs.data.jobs[0].draft, undefined);
  assert.equal(jobs.data.jobs[0].pages, undefined);
  const again = await app.request(app.admin, '/api/pdf-imports', 'POST', textPdf);
  assert.equal(again.status, 200);
  assert.equal(again.data.job.status, 'imported');
  assert.equal(app.store.pdfDocumentCount(), 1);
});

test('manual questions are answerable and self-graded but never counted as automatically wrong', async (t) => {
  const app = await serve(t);
  const { paper } = await app.importPdf(app.admin);
  const started = await app.request(app.admin, '/api/attempts', 'POST', { paperId: paper.id });
  assert.equal(started.status, 201);
  const id = started.data.attempt.id;
  const raw = app.store.getOwnedPaper(paper.id);
  const questions = raw.sections.flatMap((section) =>
    section.groups.flatMap((group) => group.questions),
  );
  assert.equal(started.data.paper.sections[0].groups[0].questions[0].answer, undefined);
  const answers = Object.fromEntries(
    questions.map((question) => [
      question.id,
      question.type === 'choice' ? 'B' : 'Reading helps me learn.',
    ]),
  );
  await app.request(app.admin, `/api/attempts/${id}`, 'PATCH', { answers });
  const submitted = await app.request(app.admin, `/api/attempts/${id}/submit`, 'POST', {});
  assert.equal(submitted.status, 200);
  const pending = submitted.data.attempt.result.items.filter((item) => item.correct === null);
  assert.equal(pending.length, 2);
  assert.equal(submitted.data.attempt.result.totalScore, null);
  const graded = await app.request(app.admin, `/api/attempts/${id}/self-grade`, 'POST', {
    scores: Object.fromEntries(pending.map((item) => [item.questionId, item.maxScore])),
  });
  assert.equal(graded.status, 200);
  assert.equal(graded.data.attempt.result.totalScore, 75);
  const report = await app.request(app.admin, '/api/insights');
  assert.equal(report.data.summary.answered, 2);
  assert.equal(
    gradeAttempt(raw, answers).items.find((item) => item.questionId === questions[2].id).correct,
    null,
  );
});

test('documents, jobs and drafts remain account-private, including guessed IDs and CSRF', async (t) => {
  const app = await serve(t);
  const bob = await app.register('private_bob');
  const { job } = await app.importPdf(app.admin);
  assert.equal((await app.request(null, '/api/pdf-imports')).status, 401);
  for (const path of [
    `/api/pdf-imports/${job.id}`,
    `/api/pdf-documents/${job.documentId}`,
    `/api/pdf-documents/${job.documentId}/pages/1`,
  ])
    assert.equal((await app.request(bob, path)).status, 404);
  assert.equal(
    (await app.request(bob, `/api/pdf-imports/${job.id}/commit`, 'POST', {})).status,
    404,
  );
  assert.equal(
    (
      await app.request(app.admin, '/api/pdf-imports', 'POST', textPdf, {
        origin: 'https://evil.example',
      })
    ).status,
    403,
  );
  assert.equal(
    (await app.request(app.admin, '/api/pdf-imports', 'POST', Buffer.from('not a PDF'))).status,
    400,
  );
  const oversized = Buffer.alloc(21 * 1024 * 1024);
  oversized.write('%PDF-1.7');
  assert.equal((await app.request(app.admin, '/api/pdf-imports', 'POST', oversized)).status, 413);
});

test('multi-paper sharing imports independent copies once and never includes personal learning records', async (t) => {
  const app = await serve(t);
  const bob = await app.register('share_bob');
  const first = await app.importPdf(app.admin),
    second = await app.importPdf(app.admin, file('scanned-paper.pdf'), 'Scan.pdf');
  const created = await app.request(app.admin, '/api/shares', 'POST', {
    title: 'Two papers',
    paperIds: [first.paper.id, second.paper.id],
    expiresDays: 30,
    rightsConfirmed: true,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.share.token.length, 32);
  const share = created.data.share;
  const preview = await app.request(bob, '/api/shares/resolve', 'POST', { token: share.token });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.share.papers.length, 2);
  assert.equal(preview.data.share.papers[0].paper, undefined);
  const body = { token: share.token, paperIds: preview.data.share.papers.map((paper) => paper.id) };
  const imported = await app.request(bob, '/api/shares/import', 'POST', body);
  assert.equal(imported.status, 201);
  assert.equal(imported.data.papers.length, 2);
  assert.notEqual(imported.data.papers[0].id, first.paper.id);
  assert.notEqual(imported.data.papers[0].document.id, first.paper.document.id);
  const pdf = await app.request(bob, '/api/pdf-documents/' + imported.data.papers[0].document.id);
  assert.equal(hash(pdf.bytes), hash(textPdf));
  const repeated = await app.request(bob, '/api/shares/import', 'POST', body);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.papers.length, 0);
  assert.equal(repeated.data.existing.length, 2);
  const workspace = await app.request(bob, '/api/bootstrap');
  assert.equal(workspace.data.attempts.length, 0);
  assert.equal(workspace.data.words.length, 0);
  assert.equal(workspace.data.papers.length, 2);
  const shareStored = app.store.getShare(share.id);
  assert.equal(shareStored.attempts, undefined);
  assert.equal(shareStored.papers[0].paper.document, undefined);
  const revokedByOther = await app.request(bob, '/api/shares/' + share.id, 'DELETE');
  assert.equal(revokedByOther.status, 404);
  await app.request(app.admin, '/api/shares/' + share.id, 'DELETE');
  assert.equal(
    (await app.request(bob, '/api/shares/resolve', 'POST', { token: share.token })).status,
    410,
  );
  assert.equal((await app.request(bob, '/api/shares/import', 'POST', body)).status, 410);
  assert.equal(
    (await app.request(bob, '/api/pdf-documents/' + imported.data.papers[0].document.id)).status,
    200,
  );
});

test('share validation, expiry and atomic rollback protect both accounts', async (t) => {
  let now = Date.now();
  const app = await serve(t, { now: () => now });
  const bob = await app.register('atomic_bob');
  const { paper } = await app.importPdf(app.admin);
  const request = (body) => app.request(app.admin, '/api/shares', 'POST', body);
  assert.equal(
    (await request({ title: 'No consent', paperIds: [paper.id], rightsConfirmed: false })).status,
    400,
  );
  assert.equal(
    (await request({ title: 'Duplicate', paperIds: [paper.id, paper.id], rightsConfirmed: true }))
      .status,
    400,
  );
  assert.equal(
    (
      await app.request(bob, '/api/shares', 'POST', {
        title: 'Other owner',
        paperIds: [paper.id],
        rightsConfirmed: true,
      })
    ).status,
    400,
  );
  const created = await request({
    title: 'Expires',
    paperIds: [paper.id],
    expiresDays: 7,
    rightsConfirmed: true,
  });
  const token = created.data.share.token;
  const preview = await app.request(bob, '/api/shares/resolve', 'POST', { token });
  const bad = await app.request(bob, '/api/shares/import', 'POST', {
    token,
    paperIds: [preview.data.share.papers[0].id, 'not-in-this-share'],
  });
  assert.equal(bad.status, 400);
  assert.equal((await app.request(bob, '/api/bootstrap')).data.papers.length, 0);
  now += 8 * 86400000;
  const refreshedBob = await app.request(
    null,
    '/login',
    'POST',
    { username: 'atomic_bob', password: 'member-test-password' },
    { accept: 'application/json' },
  );
  const cookie = refreshedBob.headers.get('set-cookie').split(';')[0];
  assert.equal((await app.request(cookie, '/api/shares/resolve', 'POST', { token })).status, 410);
});

test('cancellation retains the original file and a retryable job', async (t) => {
  const app = await serve(t, {
    pdfExtract: async (_bytes, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
      }),
  });
  const response = await app.request(app.admin, '/api/pdf-imports', 'POST', textPdf);
  assert.equal(response.status, 202);
  assert.equal((await app.request(app.admin, '/api/pdf-imports', 'POST', textPdf)).status, 409);
  const result = await app.request(
    app.admin,
    `/api/pdf-imports/${response.data.job.id}/cancel`,
    'POST',
    {},
  );
  assert.equal(result.data.job.status, 'cancelled');
  const original = await app.request(
    app.admin,
    '/api/pdf-documents/' + response.data.job.documentId,
  );
  assert.equal(hash(original.bytes), hash(textPdf));
});

test('schema migration preserves existing rows and keeps PDF bytes on reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shici-library-db-'));
  try {
    const path = join(dir, 'data.sqlite');
    let store = createStore(path);
    store.addPdfDocument({
      id: 'doc',
      filename: 'fixture.pdf',
      sha256: hash(textPdf),
      bytes: textPdf,
      pages: 2,
      createdAt: new Date().toISOString(),
    });
    store.saveAttempt({ id: 'old-attempt', answers: { q: 'A' } });
    store.close();
    store = createStore(path);
    assert.deepEqual(store.getAttempt('old-attempt').answers, { q: 'A' });
    assert.equal(hash(store.getPdfDocument('doc').bytes), hash(textPdf));
    assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PDF dates and short-answer references are retained without fabricating questions', () => {
  const parsed = parsePdfQuestions(
    [{ number: 1, text: '1. What is two plus two?\nAnswer: 4\nExplanation: Add the two numbers.' }],
    { id: 'short', filename: '2025年6月练习.pdf' },
  );
  const question = parsed.draft.sections[0].groups[0].questions[0];
  assert.equal(parsed.draft.year, 2025);
  assert.equal(parsed.draft.month, 6);
  assert.equal(question.type, 'text');
  assert.equal(question.grading, 'manual');
  assert.equal(question.referenceAnswer, '4');
  assert.ok(!question.prompt.includes('Answer:'));
  const unrelated = parsePdfQuestions(
    [
      {
        number: 1,
        text: 'This is an ordinary article without numbered questions or an answer key.',
      },
    ],
    { id: 'article', filename: 'article.pdf' },
  );
  assert.equal(unrelated.stats.questionCount, 0);
});

test('a failure partway through a shared collection rolls back all new copies', async (t) => {
  const app = await serve(t);
  const reader = await app.register('rollback_reader');
  const first = await app.importPdf(app.admin);
  const second = await app.importPdf(
    app.admin,
    Buffer.concat([textPdf, Buffer.from('\n% second fixture\n')]),
    'second.pdf',
  );
  const result = await app.request(app.admin, '/api/shares', 'POST', {
    title: 'Atomic collection',
    paperIds: [first.paper.id, second.paper.id],
    rightsConfirmed: true,
  });
  const token = result.data.share.token;
  const preview = await app.request(reader, '/api/shares/resolve', 'POST', { token });
  app.store.db.prepare('DELETE FROM pdf_documents WHERE id = ?').run(second.paper.document.id);
  const imported = await app.request(reader, '/api/shares/import', 'POST', {
    token,
    paperIds: preview.data.share.papers.map((item) => item.id),
  });
  assert.equal(imported.status, 410);
  const state = await app.request(reader, '/api/bootstrap');
  assert.equal(state.data.papers.length, 0);
  const owner = state.data.user.id;
  assert.equal(app.store.forUser(owner).pdfDocumentCount(), 0);
  assert.equal(
    app.store.db
      .prepare('SELECT COUNT(*) AS count FROM share_imports WHERE owner_id = ?')
      .get(owner).count,
    0,
  );
});

test('shares from a disabled account are unavailable to other users', async (t) => {
  const app = await serve(t);
  const author = await app.register('disabled_author'),
    reader = await app.register('disabled_reader');
  const { paper } = await app.importPdf(author);
  const created = await app.request(author, '/api/shares', 'POST', {
    title: 'Author share',
    paperIds: [paper.id],
    rightsConfirmed: true,
  });
  const token = created.data.share.token;
  assert.equal((await app.request(reader, '/api/shares/resolve', 'POST', { token })).status, 200);
  app.store.db.prepare('UPDATE users SET active = 0 WHERE username = ?').run('disabled_author');
  assert.equal((await app.request(reader, '/api/shares/resolve', 'POST', { token })).status, 410);
});
