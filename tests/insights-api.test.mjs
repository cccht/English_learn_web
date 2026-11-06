import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';

const paper = {
  id: 'diagnosis-paper',
  title: 'Learning diagnosis fixture',
  kind: 'practice',
  year: 2026,
  month: 9,
  set: 1,
  available: true,
  durationMinutes: 60,
  source: { label: 'Original fixture', url: '' },
  sections: [
    {
      id: 'reading',
      title: '阅读',
      durationMinutes: 30,
      groups: [
        {
          id: 'reading-cloze',
          title: '选词填空',
          questionType: 'reading_cloze',
          passage: 'Practice can improve resilience.',
          questions: [
            {
              id: 'q1',
              number: 1,
              type: 'choice',
              prompt: 'Which word?',
              weight: 35,
              options: [
                { id: 'A', text: 'resilience' },
                { id: 'B', text: 'delay' },
              ],
              answer: 'A',
              explanation: 'Use resilience.',
            },
            {
              id: 'q2',
              number: 2,
              type: 'choice',
              prompt: 'Another word?',
              weight: 35,
              options: [
                { id: 'A', text: 'practice' },
                { id: 'B', text: 'delay' },
              ],
              answer: 'A',
              explanation: 'Use practice.',
            },
          ],
        },
      ],
    },
    {
      id: 'writing',
      title: '写作',
      durationMinutes: 30,
      groups: [
        {
          id: 'essay',
          title: 'Writing',
          questions: [
            {
              id: 'essay',
              number: 3,
              type: 'text',
              prompt: 'Write about practice.',
              weight: 30,
              referenceAnswer: 'Practice helps us learn.',
              explanation: 'Develop examples.',
            },
          ],
        },
      ],
    },
  ],
};

async function setup(t, options = {}) {
  let now = Date.UTC(2026, 8, 12, 0, 0, 0);
  const service = createApp({
    dbPath: ':memory:',
    initialPapers: [paper],
    now: () => now,
    dictionary: { resilience: { definition: 'n. 韧性', phonetic: '', example: '' } },
    ...options,
  });
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await service.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = 'GET', body) {
    const response = await fetch(base + '/api' + path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    return { status: response.status, data, raw };
  }
  return {
    ...service,
    request,
    advance: (ms) => {
      now += ms;
    },
  };
}

test('saved choice changes and section transitions are captured without heartbeat inflation', async (t) => {
  const service = await setup(t);
  const created = await service.request('/attempts', 'POST', { paperId: paper.id });
  const id = created.data.attempt.id;
  await service.request(`/attempts/${id}`, 'PATCH', { answers: { q1: 'A' } });
  service.advance(10000);
  await service.request(`/attempts/${id}`, 'PATCH', {
    answers: { q1: 'B' },
    currentSection: 'writing',
  });
  await service.request(`/attempts/${id}`, 'PATCH', {
    answers: { q1: 'B', essay: 'Draft one' },
    currentSection: 'writing',
  });
  await service.request(`/attempts/${id}`, 'PATCH', {
    answers: { essay: 'Draft two, with more words' },
  });
  const submitted = await service.request(`/attempts/${id}/submit`, 'POST', {
    answers: { q1: 'B' },
  });
  assert.equal(submitted.status, 200);
  const stored = service.store.getAttempt(id);
  assert.deepEqual(stored.telemetry.firstAnswers, { q1: 'A' });
  assert.equal(stored.telemetry.answerChanges.length, 1);
  assert.equal(stored.telemetry.sectionSwitches.length, 1);
  const { data: report } = await service.request('/insights?days=30');
  assert.equal(report.summary.answered, 1);
  assert.equal(report.summary.wrong, 1);
  assert.equal(report.summary.skipped, 1);
  assert.equal(report.habits.answerChanges, 1);
  assert.equal(report.habits.correctToWrong, 1);
  assert.equal(report.habits.telemetryAttempts, 1);
  assert.equal(report.questionTypes[0].errorRate, 100);
  assert.equal((await service.request('/insights?days=5')).status, 400);
});

test('wrong answer annotations are scoped to submitted attempts and change the diagnosis fingerprint', async (t) => {
  const service = await setup(t);
  const { data: created } = await service.request('/attempts', 'POST', { paperId: paper.id });
  const path = `/attempts/${created.attempt.id}`;
  assert.equal(
    (
      await service.request(path + '/error-reasons', 'PATCH', {
        questionId: 'q1',
        reason: 'vocabulary',
      })
    ).status,
    409,
  );
  await service.request(path + '/submit', 'POST', { answers: { q1: 'B', q2: 'A' } });
  const before = await service.request('/insights?days=all');
  const tagged = await service.request(path + '/error-reasons', 'PATCH', {
    questionId: 'q1',
    reason: 'vocabulary',
  });
  assert.equal(tagged.status, 200);
  assert.equal(tagged.data.attempt.errorReasons.q1, 'vocabulary');
  assert.equal(
    (
      await service.request(path + '/error-reasons', 'PATCH', {
        questionId: 'q2',
        reason: 'careless',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await service.request(path + '/error-reasons', 'PATCH', {
        questionId: 'q1',
        reason: 'made-up',
      })
    ).status,
    400,
  );
  const after = await service.request('/insights?days=all');
  assert.notEqual(before.data.fingerprint, after.data.fingerprint);
});

test('vocabulary encounters preserve contexts, reviews are idempotent, and reasons remain user reports', async (t) => {
  const service = await setup(t);
  const first = await service.request('/words', 'POST', {
    word: 'Resilience',
    context: 'Build resilience.',
  });
  const id = first.data.word.id;
  service.advance(60000);
  const again = await service.request('/words', 'POST', {
    word: 'resilience',
    context: 'Her resilience is impressive.',
  });
  assert.equal(again.data.added, false);
  assert.equal(again.data.word.encounters.length, 2);
  assert.equal(again.data.word.context, 'Build resilience.');
  assert.equal(again.data.word.encounters[1].context, 'Her resilience is impressive.');
  await service.request(`/words/${id}`, 'PATCH', { reason: 'context' });
  const review = { eventId: 'review-1', rating: 'forgotten' };
  await service.request(`/words/${id}/review`, 'POST', review);
  await service.request(`/words/${id}/review`, 'POST', review);
  assert.equal(service.store.getWord(id).reviewHistory.length, 1);
  assert.equal(service.store.getWord(id).mastered, false);
  await service.request(`/words/${id}/review`, 'POST', {
    eventId: 'review-2',
    rating: 'remembered',
  });
  const { data: report } = await service.request('/insights?days=30');
  const word = report.vocabulary.words.find((w) => w.id === id);
  assert.equal(word.reviewCount, 2);
  assert.equal(word.forgotCount, 1);
  assert.equal(word.encounterCount, 2);
  assert.equal(word.reason, 'context');
  assert.equal(service.store.getWord(id).mastered, true);
  const exported = await service.request('/words/export?format=csv');
  assert.match(exported.raw, /forgotCount/);
  assert.match(exported.raw, /context/);
});

test('AI settings redact secrets and unconfigured analysis fails without affecting statistics', async (t) => {
  const service = await setup(t);
  const config = await service.request('/ai/config');
  assert.equal(config.status, 200);
  assert.equal(config.data.provider, 'openai-compatible');
  assert.equal(Object.hasOwn(config.data, 'apiKey'), false);
  const saved = await service.request('/ai/config', 'PUT', {
    baseUrl: 'https://model.example/v1',
    model: 'study-model',
    apiKey: 'fixture-private-key',
  });
  assert.equal(saved.data.hasApiKey, true);
  assert.equal(saved.raw.includes('fixture-private-key'), false);
  assert.equal((await service.request('/ai/config')).raw.includes('fixture-private-key'), false);
  const empty = await service.request('/insights/ai', 'POST', { days: 30 });
  assert.equal(empty.status, 400);
  const report = await service.request('/insights?days=30');
  assert.equal(report.status, 200);
  assert.equal(report.data.summary.answered, 0);
  assert.equal((await service.request('/insights/ai/latest?days=30')).data.job, null);
});

test('AI HTTP jobs use real analytics evidence and retain the report snapshot after records change', async (t) => {
  let sent;
  const service = await setup(t, {
    aiDefaultConfig: {
      provider: 'openai-compatible',
      baseUrl: 'https://model.example/v1',
      model: 'fixture-model',
      apiKey: 'fixture-private-key',
    },
    aiFetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      const payload = JSON.parse(sent.messages[1].content);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  overview: `已答 ${payload.summary.answered} 题，先核对错题证据。`,
                  findings: [
                    {
                      title: '检查选词证据',
                      analysis: '词义辨别可能需要加强，仍需新题验证。',
                      evidenceIds: ['type:reading_cloze'],
                      actions: ['重做 1 道错题并解释选项差别。'],
                    },
                  ],
                  vocabulary: [],
                  plan: [
                    {
                      day: 1,
                      title: '定位证据',
                      minutes: 15,
                      tasks: ['复盘 1 道错题并标记原文证据。'],
                    },
                  ],
                  limitations: ['这是有限样本的练习建议。'],
                }),
              },
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    },
  });
  const { data: created } = await service.request('/attempts', 'POST', { paperId: paper.id });
  await service.request(`/attempts/${created.attempt.id}/submit`, 'POST', {
    answers: { q1: 'B', q2: 'A' },
  });
  const started = await service.request('/insights/ai', 'POST', { days: 30 });
  assert.equal(started.status, 202);
  const jobId = started.data.job.id;
  let job;
  for (let retry = 0; retry < 20; retry++) {
    job = (await service.request(`/insights/ai/${jobId}`)).data.job;
    if (job.status === 'completed' || job.status === 'failed') break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(job.status, 'completed', job.error);
  assert.match(job.result.overview, /已答 2 题/);
  assert.equal(
    job.evidence.some((item) => item.id === 'type:reading_cloze'),
    true,
  );
  assert.equal(JSON.stringify(job).includes('fixture-private-key'), false);
  assert.equal(JSON.stringify(sent.messages).includes('fixture-private-key'), false);
  const reused = await service.request('/insights/ai', 'POST', { days: 30 });
  assert.equal(reused.data.job.id, jobId);
  await service.request(`/attempts/${created.attempt.id}/error-reasons`, 'PATCH', {
    questionId: 'q1',
    reason: 'vocabulary',
  });
  const report = (await service.request('/insights?days=30')).data;
  assert.notEqual(report.fingerprint, job.fingerprint);
  assert.equal((await service.request('/insights/ai/latest?days=30')).data.job.id, jobId);
  const history = await service.request('/insights/ai/history?days=30');
  assert.equal(history.data.jobs[0].id, jobId);
  assert.equal(history.raw.includes('fixture-private-key'), false);
  assert.equal(Object.hasOwn(history.data.jobs[0], 'result'), false);
  assert.equal((await service.request('/insights/ai/nonexistent')).status, 404);
});
