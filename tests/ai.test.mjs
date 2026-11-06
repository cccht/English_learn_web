import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createAiService } from '../server/ai.mjs';

function memoryStore() {
  const jobs = new Map();
  const settings = new Map();
  return {
    getSetting: (key) => structuredClone(settings.get(key)),
    setSetting: (key, value) => settings.set(key, structuredClone(value)),
    getAiJob: (id) => structuredClone(jobs.get(id)),
    saveAiJob: (job) => jobs.set(job.id, structuredClone(job)),
    listAiJobs: () => [...jobs.values()].reverse().map((job) => structuredClone(job)),
  };
}

function report() {
  return {
    rangeDays: 30,
    fingerprint: 'report-v1',
    summary: {
      attemptCount: 2,
      paperCount: 1,
      answered: 4,
      correct: 2,
      wrong: 2,
      skipped: 2,
      accuracy: 50,
      vocabularyCount: 1,
      repeatedMistakeCount: 1,
      telemetryAttempts: 2,
      level: 'limited',
    },
    questionTypes: [
      {
        id: 'reading_cloze',
        label: '选词填空',
        answered: 4,
        correct: 2,
        wrong: 2,
        skipped: 2,
        accuracy: 50,
        attempts: 2,
        uniqueQuestions: 2,
        confidence: 'low',
      },
    ],
    sections: [
      {
        sectionId: 'reading',
        title: '阅读',
        totalSeconds: 900,
        averageSeconds: 450,
        recommendedSeconds: 600,
        overBudgetCount: 0,
        attemptCount: 2,
      },
    ],
    habits: {
      telemetryAttempts: 2,
      answerChanges: 2,
      correctToWrong: 1,
      wrongToCorrect: 1,
      sectionSwitches: 2,
      lateChanges: 0,
      autoSubmitted: 0,
    },
    repeatedMistakes: [
      {
        paperId: 'paper',
        questionId: 'q1',
        typeLabel: '选词填空',
        prompt: 'Which word fits?',
        wrongCount: 2,
        seenCount: 2,
        lastOutcome: 'wrong',
        reason: 'vocabulary',
        explanation: 'Evaluate the context.',
      },
    ],
    vocabulary: {
      reasonCounts: [{ id: 'unknown', label: '尚不确定', count: 1 }],
      words: [
        {
          id: 'w1',
          word: 'expand',
          definition: 'v. 扩大',
          context: 'Reading expands knowledge.',
          reason: 'unknown',
          reasonLabel: '尚不确定',
          encounterCount: 2,
          reviewCount: 1,
          forgotCount: 1,
          linkedMistakes: 1,
          signals: ['一次复习未记住'],
        },
      ],
    },
    limitations: ['只包含最近 30 天的已提交试卷。'],
    evidence: [
      { id: 'summary', text: '已作答 4 题，答错 2 题。' },
      { id: 'type:reading_cloze', text: '选词填空已作答 4 题，正确率 50%。' },
      { id: 'habit:changes', text: '改答案 2 次，其中 1 次由对改错，1 次由错改对。' },
      { id: 'word:w1', text: 'expand 遇到 2 次，复习 1 次，未记住 1 次。' },
      { id: 'repeated:paper/q1', text: '同一题作答 2 次，均答错。' },
    ],
    rawAnswers: { essay: 'Do not send raw essays to the provider.' },
  };
}

function result() {
  return {
    overview: '选词填空有重复错题，现有样本较少。',
    findings: [
      {
        title: '核实语境辨词',
        analysis: '可能与语境辨词有关，需要通过新题验证。',
        evidenceIds: ['type:reading_cloze', 'repeated:paper/q1'],
        actions: ['练习 3 道新题并记录排除依据。'],
      },
    ],
    vocabulary: [
      {
        word: 'expand',
        possibleReason: '可能还没有形成稳定的语境记忆，需验证。',
        evidenceIds: ['word:w1'],
        exercise: '遮住释义回忆，并写出 2 个例句。',
      },
    ],
    plan: [{ day: 1, title: '语境辨词', minutes: 15, tasks: ['复习 5 个词并完成 3 道选词填空。'] }],
    limitations: ['收藏和少量复习不能证明遗忘原因。'],
  };
}

function jsonResponse(content = result(), provider = 'ollama') {
  return Response.json(
    provider === 'ollama'
      ? {
          message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
          done: true,
        }
      : {
          choices: [
            {
              message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
            },
          ],
        },
  );
}

function service(t, options = {}) {
  const store = options.store || memoryStore();
  const ai = createAiService({
    store,
    defaultConfig: {
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'test-model',
      apiKey: '',
    },
    fetchImpl: async () => jsonResponse(),
    ...options,
  });
  t.after(() => ai.close());
  return { ai, store };
}

async function finish(ai, id) {
  for (let i = 0; i < 100; i++) {
    const job = ai.getJob(id);
    if (job.status === 'completed' || job.status === 'failed') return job;
    await setImmediate();
  }
  assert.fail('AI job did not finish');
}

test('Ollama wire format uses bounded evidence, schema and only aggregate learning data', async (t) => {
  let wire;
  const { ai, store } = service(t, {
    fetchImpl: async (url, options) => {
      wire = { url, ...options };
      return jsonResponse();
    },
  });
  const input = report();
  const queued = ai.start(input);
  assert.equal(queued.status, 'queued');
  const completed = await finish(ai, queued.id);
  assert.equal(completed.status, 'completed');
  assert.equal(wire.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(wire.redirect, 'error');
  assert.ok(wire.signal instanceof AbortSignal);
  const body = JSON.parse(wire.body);
  assert.equal(body.stream, false);
  assert.equal(body.think, false);
  assert.equal(body.keep_alive, 0);
  assert.deepEqual(body.options, { num_ctx: 8192, num_predict: 1600, temperature: 0.2 });
  assert.equal(body.format.additionalProperties, false);
  assert.match(body.messages[0].content, /不可信/);
  assert.match(body.messages[0].content, /skipped/);
  assert.match(body.messages[0].content, /后台/);
  const payload = JSON.parse(body.messages[1].content);
  assert.equal(payload.rawAnswers, undefined);
  assert.equal(wire.body.includes('Do not send raw essays'), false);
  assert.deepEqual(completed.evidence, payload.evidence);
  assert.ok(completed.result.limitations.some((item) => item.includes('样本有限')));
  assert.equal(completed.configFingerprint, undefined);
  assert.equal(typeof store.getAiJob(completed.id).configFingerprint, 'string');
  input.evidence[0].text = 'Changed after report generation';
  assert.notEqual(ai.getJob(completed.id).evidence[0].text, input.evidence[0].text);
});

test('compatible API calls use saved endpoint, model and secret without disclosing secret in jobs', async (t) => {
  let wire;
  const { ai, store } = service(t, {
    fetchImpl: async (url, options) => {
      wire = { url, ...options };
      return jsonResponse(result(), 'compatible');
    },
  });
  const config = ai.updateConfig({
    provider: 'openai-compatible',
    baseUrl: 'https://provider.example/v1/',
    model: 'coach',
    apiKey: 'private-test-key',
  });
  assert.equal(config.baseUrl, 'https://provider.example/v1');
  assert.equal(config.hasApiKey, true);
  assert.equal(config.apiKey, undefined);
  ai.updateConfig({ apiKey: '' });
  assert.equal(store.getSetting('ai-config').apiKey, 'private-test-key');
  const job = await finish(ai, ai.start(report()).id);
  assert.equal(job.status, 'completed');
  assert.equal(wire.url, 'https://provider.example/v1/chat/completions');
  assert.equal(wire.headers.authorization, 'Bearer private-test-key');
  const body = JSON.parse(wire.body);
  assert.equal(body.model, 'coach');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.messages.length, 2);
  assert.equal(JSON.stringify(job).includes('private-test-key'), false);
  assert.equal(ai.updateConfig({ clearApiKey: true }).hasApiKey, false);
});

test('changing service clears the previous key unless a replacement is explicitly supplied', async (t) => {
  let wire;
  const { ai, store } = service(t, {
    fetchImpl: async (url, options) => {
      wire = { url, ...options };
      return jsonResponse(result(), JSON.parse(options.body).format ? 'ollama' : 'compatible');
    },
  });
  ai.updateConfig({
    provider: 'openai-compatible',
    baseUrl: 'https://first.example/v1',
    model: 'coach',
    apiKey: 'first-key',
  });
  assert.equal(ai.updateConfig({ model: 'next-coach', apiKey: '' }).hasApiKey, true);
  assert.equal(ai.updateConfig({ baseUrl: 'https://first.example/custom/v1' }).hasApiKey, true);
  await finish(ai, ai.start(report()).id);
  assert.equal(wire.headers.authorization, 'Bearer first-key');

  assert.equal(
    ai.updateConfig({ baseUrl: 'https://second.example/v1', apiKey: '' }).hasApiKey,
    false,
  );
  assert.equal(store.getSetting('ai-config').apiKey, '');
  await finish(ai, ai.start(report()).id);
  assert.equal(wire.url, 'https://second.example/v1/chat/completions');
  assert.equal(wire.headers.authorization, undefined);

  assert.equal(
    ai.updateConfig({ baseUrl: 'https://third.example/v1', apiKey: 'third-key' }).hasApiKey,
    true,
  );
  await finish(ai, ai.start(report()).id);
  assert.equal(wire.headers.authorization, 'Bearer third-key');

  assert.equal(ai.updateConfig({ provider: 'ollama', apiKey: '' }).hasApiKey, false);
  await finish(ai, ai.start(report()).id);
  assert.equal(wire.headers.authorization, undefined);
  assert.equal(store.getSetting('ai-config').apiKey, '');
});

test('empty model and missing default-provider key block calls; invalid config never replaces saved values', async (t) => {
  const { ai } = service(t);
  ai.updateConfig({ provider: 'openai-compatible', baseUrl: 'https://api.openai.com', model: '' });
  assert.equal(ai.getConfig().baseUrl, 'https://api.openai.com/v1');
  assert.throws(() => ai.start(report()), /模型名称/);
  ai.updateConfig({ model: 'example-model' });
  assert.throws(() => ai.start(report()), /API Key/);
  for (const baseUrl of [
    'file:///etc/passwd',
    'https://user:password@example.com',
    'https://example.com?k=secret',
    'https://example.com/#key',
    'http://remote.example/v1',
  ]) {
    assert.throws(() => ai.updateConfig({ baseUrl }), { status: 400 });
  }
  for (const input of [
    { timeoutSeconds: 9 },
    { timeoutSeconds: 181 },
    { unknown: true },
    { apiKey: null },
  ]) {
    assert.throws(() => ai.updateConfig(input), { status: 400 });
  }
  assert.equal(ai.getConfig().baseUrl, 'https://api.openai.com/v1');
});

test('same report deduplicates active and completed work; force and config changes create correct snapshots', async (t) => {
  const pending = [];
  const calls = [];
  const { ai } = service(t, {
    fetchImpl: async (url, options) => {
      calls.push(JSON.parse(options.body));
      return new Promise((resolve) => pending.push(() => resolve(jsonResponse())));
    },
  });
  const first = ai.start(report());
  assert.equal(ai.start(report(), { force: true }).id, first.id);
  ai.updateConfig({ model: 'new-model' });
  await setImmediate();
  assert.equal(calls[0].model, 'test-model');
  pending.shift()();
  await finish(ai, first.id);
  ai.updateConfig({ model: 'test-model' });
  assert.equal(ai.start(report()).id, first.id);
  const forced = ai.start(report(), { force: true });
  assert.notEqual(forced.id, first.id);
  await setImmediate();
  pending.shift()();
  await finish(ai, forced.id);
  ai.updateConfig({ model: 'new-model' });
  const changed = ai.start(report());
  assert.notEqual(changed.id, forced.id);
  await setImmediate();
  pending.shift()();
  await finish(ai, changed.id);
  assert.equal(calls.length, 3);
});

test('empty records do not generate a diagnosis; vocabulary alone gets an explicit limitation', async (t) => {
  const wordsOnly = report();
  wordsOnly.summary = {
    ...wordsOnly.summary,
    answered: 0,
    correct: 0,
    wrong: 0,
    accuracy: null,
    level: 'empty',
  };
  wordsOnly.questionTypes = [];
  wordsOnly.repeatedMistakes = [];
  const { ai } = service(t, {
    fetchImpl: async () => jsonResponse({ ...result(), findings: [] }),
  });
  const completed = await finish(ai, ai.start(wordsOnly).id);
  assert.equal(completed.status, 'completed');
  assert.ok(completed.result.limitations.some((item) => item.includes('没有客观题')));
  wordsOnly.vocabulary.words = [];
  assert.throws(() => ai.start(wordsOnly), /先完成客观题作答或收藏单词/);
});

test('made-up references, words, markup, certain causes, malformed JSON and invalid plans never become reports', async (t) => {
  const invalid = [
    (r) => {
      r.findings[0].evidenceIds = ['fabricated'];
    },
    (r) => {
      r.findings[0].evidenceIds = [];
    },
    (r) => {
      r.vocabulary[0].word = 'invented';
    },
    (r) => {
      r.vocabulary[0].evidenceIds = ['summary'];
    },
    (r) => {
      r.vocabulary[0].possibleReason = '你有记忆障碍。';
    },
    (r) => {
      r.overview = '<script>alert(1)</script>';
    },
    (r) => {
      r.plan.push({ ...r.plan[0] });
    },
    (r) => {
      r.plan[0].day = 8;
    },
    (r) => {
      r.plan[0].tasks = ['努力练习阅读'];
    },
    (r) => {
      r.totalScore = 550;
    },
  ];
  for (const change of invalid) {
    const data = result();
    change(data);
    const { ai } = service(t, { fetchImpl: async () => jsonResponse(data) });
    const failed = await finish(ai, ai.start(report()).id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.result, undefined);
    assert.match(failed.error, /不符合报告或证据要求/);
  }
  const { ai } = service(t, { fetchImpl: async () => jsonResponse('```json\n{}\n```') });
  assert.equal((await finish(ai, ai.start(report()).id)).status, 'failed');
});

test('HTTP errors and rejected fetch calls never expose response bodies or provider errors', async (t) => {
  for (const fetchImpl of [
    async () => new Response('private-api-key provider response', { status: 401 }),
    async () => {
      throw new Error('private-api-key provider exception');
    },
  ]) {
    const { ai } = service(t, { fetchImpl });
    const failed = await finish(ai, ai.start(report()).id);
    assert.equal(failed.status, 'failed');
    assert.equal(JSON.stringify(failed).includes('private-api-key'), false);
  }
});

test('timeout aborts the actual fetch signal and records a readable failure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const { ai } = service(t, {
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        }),
      );
    },
  });
  ai.updateConfig({ timeoutSeconds: 10 });
  const job = ai.start(report());
  await setImmediate();
  t.mock.timers.tick(10_000);
  const failed = await finish(ai, job.id);
  assert.equal(signal.aborted, true);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /超过 10 秒/);
});

test('startup recovers interrupted jobs while preserving completed history and evidence', async (t) => {
  const store = memoryStore();
  for (const status of ['queued', 'running', 'completed']) {
    store.saveAiJob({
      id: status,
      status,
      createdAt: '2026-09-01T00:00:00.000Z',
      rangeDays: 30,
      fingerprint: status,
      model: 'old-model',
      evidence: report().evidence,
      ...(status === 'completed' ? { result: result() } : {}),
    });
  }
  const { ai } = service(t, { store });
  assert.equal(ai.getJob('queued').status, 'failed');
  assert.equal(ai.getJob('running').status, 'failed');
  assert.match(ai.getJob('running').error, /重启/);
  assert.equal(ai.getJob('completed').status, 'completed');
  assert.deepEqual(ai.getJob('completed').result, result());
  assert.equal(ai.getJob('missing'), undefined);
  assert.equal(ai.latest(7), undefined);
  assert.ok(ai.latest(30));
});

test('close aborts inflight work and settles persistence before the caller closes the store', async (t) => {
  let signal;
  const { ai } = service(t, {
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('stop')), { once: true }),
      );
    },
  });
  const job = ai.start(report());
  await setImmediate();
  await ai.close();
  assert.equal(signal.aborted, true);
  assert.equal(ai.getJob(job.id).status, 'failed');
  assert.match(ai.getJob(job.id).error, /关闭/);
  assert.throws(() => ai.start(report()), /已关闭/);
});

test('model discovery uses the configured provider and accepts only bounded model identifiers', async (t) => {
  let url;
  const { ai } = service(t, {
    fetchImpl: async (address) => {
      url = address;
      return Response.json({
        models: [{ name: 'local-model' }, { name: 'local-model' }, { name: '' }, { name: null }],
      });
    },
  });
  assert.deepEqual(await ai.getModels(), { models: ['local-model'] });
  assert.equal(url, 'http://127.0.0.1:11434/api/tags');
});

test('large vocabulary and encoded repeated-question IDs retain only relevant bounded evidence', async (t) => {
  const input = report();
  input.repeatedMistakes[0].paperId = 'paper/one';
  input.repeatedMistakes[0].questionId = 'question/two';
  input.evidence = input.evidence.filter(
    (item) => !item.id.startsWith('repeated:') && !item.id.startsWith('word:'),
  );
  input.evidence.push({
    id: 'repeated:paper%2Fone/question%2Ftwo',
    text: 'The same question was incorrect twice.',
  });
  const template = input.vocabulary.words[0];
  input.vocabulary.words = Array.from({ length: 80 }, (_, index) => ({
    ...template,
    id: `w${index + 1}`,
    word: index ? `word${index}` : 'expand',
    context: 'Long context '.repeat(80),
  }));
  input.summary.vocabularyCount = 80;
  for (const word of input.vocabulary.words) {
    input.evidence.push({
      id: `word:${word.id}`,
      text: `${word.word}: ${'原句语境用于复习。'.repeat(80)}`,
    });
  }
  let payload;
  const response = result();
  response.findings[0].evidenceIds = ['repeated:paper%2Fone/question%2Ftwo'];
  const { ai } = service(t, {
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(JSON.parse(options.body).messages[1].content);
      return jsonResponse(response);
    },
  });
  const completed = await finish(ai, ai.start(input).id);
  assert.equal(completed.status, 'completed');
  assert.ok(payload.vocabulary.words.length <= 20);
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= 24000);
  assert.equal(payload.summary.vocabularyCount, 80);
  assert.ok(payload.evidence.some((item) => item.id === 'repeated:paper%2Fone/question%2Ftwo'));
  assert.ok(payload.limitations.some((item) => item.includes('部分重点')));
  const wordIds = new Set(payload.vocabulary.words.map((item) => `word:${item.id}`));
  for (const item of payload.evidence.filter((item) => item.id.startsWith('word:')))
    assert.ok(wordIds.has(item.id));
});
