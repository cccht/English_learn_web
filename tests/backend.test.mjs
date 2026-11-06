import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { gradeAttempt } from '../server/scoring.mjs';

const fixture = {
  id: 'test-paper',
  title: 'Test paper',
  subtitle: '',
  kind: 'practice',
  year: 2026,
  month: 6,
  set: 1,
  available: true,
  durationMinutes: 130,
  source: { label: 'Original test fixture', url: '' },
  sections: [
    {
      id: 'reading',
      title: 'Reading',
      durationMinutes: 100,
      groups: [
        {
          id: 'reading-a',
          title: 'Reading A',
          instructions: 'Choose an answer.',
          passage: 'Reading expands knowledge.',
          questions: [
            {
              id: 'q1',
              number: 1,
              type: 'choice',
              prompt: 'First?',
              options: [
                { id: 'A', text: 'First' },
                { id: 'B', text: 'Second' },
              ],
              answer: 'A',
              explanation: 'The correct answer is A.',
              weight: 25,
            },
            {
              id: 'q2',
              number: 2,
              type: 'choice',
              prompt: 'Second?',
              options: [
                { id: 'A', text: 'First' },
                { id: 'B', text: 'Second' },
              ],
              answer: 'B',
              explanation: 'The correct answer is B.',
              weight: 45,
            },
          ],
        },
      ],
    },
    {
      id: 'writing',
      title: 'Writing',
      durationMinutes: 30,
      groups: [
        {
          id: 'writing-a',
          title: 'Writing A',
          instructions: 'Write.',
          passage: '',
          questions: [
            {
              id: 'q3',
              number: 3,
              type: 'text',
              prompt: 'Write about reading.',
              referenceAnswer: 'Reading helps us discover new ideas.',
              explanation: 'Organize ideas into paragraphs.',
              weight: 30,
              keywords: ['reading'],
            },
          ],
        },
      ],
    },
  ],
};

async function serve(t, options = {}) {
  const service = createApp({
    dbPath: ':memory:',
    initialPapers: [fixture],
    dictionary: {
      expand: {
        phonetic: '/ɪkˈspænd/',
        definition: 'v. 扩大',
        example: 'Reading expands knowledge.',
      },
    },
    ...options,
  });
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
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, data, text, response };
  };
  return { ...service, request, close };
}

test('objective scores are exact; subjective results stay pending until explicitly graded', () => {
  const result = gradeAttempt(fixture, { q1: 'A', q2: 'A', q3: 'Reading is useful.' });
  assert.equal(result.objectiveScore, 25);
  assert.equal(result.objectiveMax, 70);
  assert.equal(result.correctCount, 1);
  assert.equal(result.questionCount, 2);
  assert.equal(result.subjectiveScore, null);
  assert.equal(result.totalScore, null);
  assert.equal(result.estimated710, null);
  assert.equal(result.items[2].wordCount, 3);
  const completed = gradeAttempt(fixture, { q1: 'A', q2: 'B' }, { q3: 20 });
  assert.equal(completed.totalScore, 90);
  assert.equal(completed.estimated710, 639);
  const customIds = structuredClone(fixture);
  customIds.sections[1].groups[0].questions[0].id = 'toString';
  const blank = gradeAttempt(customIds, {});
  assert.equal(blank.items[2].answer, '');
  assert.equal(blank.items[2].wordCount, 0);
});

test('answer key is hidden before submission, autosave and resume preserve answers, grading is server-owned', async (t) => {
  const { request } = await serve(t);
  const started = await request('/api/attempts', 'POST', { paperId: fixture.id });
  assert.equal(started.status, 201);
  const id = started.data.attempt.id;
  const hidden = started.data.paper.sections.flatMap((section) =>
    section.groups.flatMap((group) => group.questions),
  );
  for (const question of hidden) {
    for (const key of ['answer', 'referenceAnswer', 'explanation', 'keywords'])
      assert.equal(Object.hasOwn(question, key), false);
  }
  const direct = await request(`/api/papers/${fixture.id}`);
  assert.equal(Object.hasOwn(direct.data.sections[0].groups[0].questions[0], 'answer'), false);
  const saved = await request(`/api/attempts/${id}`, 'PATCH', {
    answers: { q1: 'A', q3: 'A short essay.' },
    currentSection: 'writing',
  });
  assert.equal(saved.data.attempt.answers.q3, 'A short essay.');
  const resumed = await request('/api/attempts', 'POST', { paperId: fixture.id });
  assert.equal(resumed.data.attempt.id, id);
  assert.equal(
    (await request(`/api/attempts/${id}`, 'PATCH', { answers: { q1: 'C' } })).status,
    400,
  );
  assert.equal(
    (await request(`/api/attempts/${id}`, 'PATCH', { answers: { unknown: 'A' } })).status,
    400,
  );
  assert.equal(
    (await request(`/api/attempts/${id}`, 'PATCH', { sectionSpent: { reading: 0 } })).status,
    400,
  );
  const submitted = await request(`/api/attempts/${id}/submit`, 'POST', { answers: { q2: 'B' } });
  assert.equal(submitted.data.attempt.result.objectiveScore, 70);
  assert.equal(submitted.data.paper.sections[0].groups[0].questions[0].answer, 'A');
  assert.equal(submitted.data.attempt.result.totalScore, null);
  assert.equal(
    (await request(`/api/attempts/${id}/self-grade`, 'POST', { scores: { q1: 1 } })).status,
    400,
  );
  assert.equal(
    (await request(`/api/attempts/${id}/self-grade`, 'POST', { scores: { q3: 31 } })).status,
    400,
  );
  const graded = await request(`/api/attempts/${id}/self-grade`, 'POST', { scores: { q3: 24 } });
  assert.equal(graded.data.attempt.result.totalScore, 94);
  const immutable = await request(`/api/attempts/${id}`, 'PATCH', { answers: { q1: 'B' } });
  assert.equal(immutable.data.attempt.answers.q1, 'A');
});

test('section clocks account elapsed wall time and deadline rejects late answers', async (t) => {
  let time = Date.parse('2026-09-12T00:00:00.000Z');
  const { request } = await serve(t, { now: () => time });
  const started = await request('/api/attempts', 'POST', { paperId: fixture.id });
  const id = started.data.attempt.id;
  time += 12000;
  const switched = await request(`/api/attempts/${id}`, 'PATCH', {
    answers: { q1: 'A' },
    currentSection: 'writing',
  });
  assert.equal(switched.data.attempt.sectionSpent.reading, 12);
  time += 23000;
  const viewed = await request(`/api/attempts/${id}`);
  assert.equal(viewed.data.attempt.sectionSpent.writing, 23);
  time = Date.parse(started.data.attempt.deadlineAt) + 60000;
  const expired = await request(`/api/attempts/${id}/submit`, 'POST', { answers: { q2: 'B' } });
  assert.equal(expired.data.attempt.status, 'submitted');
  assert.equal(expired.data.attempt.autoSubmitted, true);
  assert.equal(expired.data.attempt.submittedAt, started.data.attempt.deadlineAt);
  assert.equal(expired.data.attempt.answers.q2, undefined);
  assert.equal(expired.data.attempt.result.objectiveScore, 25);
  assert.equal(
    Object.values(expired.data.attempt.sectionSpent).reduce((sum, value) => sum + value, 0),
    130 * 60,
  );
});

test('only one paper can be timed at once, while the current paper can resume', async (t) => {
  const { request } = await serve(t);
  const other = { ...fixture, id: 'another-paper', title: 'Another paper' };
  await request('/api/papers', 'POST', other);
  const started = await request('/api/attempts', 'POST', { paperId: fixture.id });
  const id = started.data.attempt.id;
  const blocked = await request('/api/attempts', 'POST', { paperId: other.id });
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /已有进行中的试卷/);
  assert.equal(
    (await request('/api/attempts', 'POST', { paperId: fixture.id })).data.attempt.id,
    id,
  );
  assert.equal((await request('/api/bootstrap')).data.attempts.length, 1);
  await request(`/api/attempts/${id}/submit`, 'POST', {});
  assert.equal((await request('/api/attempts', 'POST', { paperId: other.id })).status, 201);
});

test('paper imports validate answer keys, duplicate IDs, weights and sources', async (t) => {
  const { request } = await serve(t);
  assert.equal((await request('/api/papers', 'POST', fixture)).status, 409);
  const badAnswer = structuredClone(fixture);
  badAnswer.id = 'bad-answer';
  badAnswer.sections[0].groups[0].questions[0].answer = 'Z';
  assert.equal((await request('/api/papers', 'POST', badAnswer)).status, 400);
  const badWeight = structuredClone(fixture);
  badWeight.id = 'bad-weight';
  badWeight.sections[0].groups[0].questions[0].weight = 100;
  assert.equal((await request('/api/papers', 'POST', badWeight)).status, 400);
  const badSource = {
    ...fixture,
    id: 'bad-source',
    source: { label: 'bad', url: 'javascript:alert(1)' },
  };
  assert.equal((await request('/api/papers', 'POST', badSource)).status, 400);
  const reservedId = structuredClone(fixture);
  reservedId.id = 'reserved-id';
  reservedId.sections[0].groups[0].questions[0].id = '__proto__';
  assert.equal((await request('/api/papers', 'POST', reservedId)).status, 400);
  const valid = { ...fixture, id: 'imported-paper' };
  assert.equal((await request('/api/papers', 'POST', valid)).status, 201);
  const template = await request('/api/template');
  assert.equal((await request('/api/papers', 'POST', template.data)).status, 201);
});

test('imported audio links remain available for playback and malformed URLs are rejected', async (t) => {
  const { request } = await serve(t);
  const audioPaper = structuredClone(fixture);
  audioPaper.id = 'audio-paper';
  audioPaper.sections[0].groups[0].audioUrl = 'https://example.com/listening.mp3';
  assert.equal((await request('/api/papers', 'POST', audioPaper)).status, 201);
  const started = await request('/api/attempts', 'POST', { paperId: audioPaper.id });
  assert.equal(
    started.data.paper.sections[0].groups[0].audioUrl,
    'https://example.com/listening.mp3',
  );
  for (const [index, url] of [
    'http://',
    'https:example.com',
    '//example.com/clip.mp3',
    '/\\example.com/clip.mp3',
    'javascript:alert(1)',
    'https://user:password@example.com/clip.mp3',
  ].entries()) {
    audioPaper.id = `bad-audio-${index}`;
    audioPaper.sections[0].groups[0].audioUrl = url;
    assert.equal((await request('/api/papers', 'POST', audioPaper)).status, 400, url);
  }
  audioPaper.id = 'local-audio';
  audioPaper.sections[0].groups[0].audioUrl = '/audio/listening.mp3';
  assert.equal((await request('/api/papers', 'POST', audioPaper)).status, 201);
});

test('words deduplicate, survive failed lookup, edit, export safely and delete', async (t) => {
  const { request } = await serve(t, {
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  const added = await request('/api/words', 'POST', {
    word: 'Expand',
    context: '=1+1',
    paperTitle: 'Test',
  });
  assert.equal(added.status, 201);
  assert.equal(added.data.word.definition, 'v. 扩大');
  const id = added.data.word.id;
  const duplicate = await request('/api/words', 'POST', { word: 'expand' });
  assert.equal(duplicate.data.word.id, id);
  assert.equal(duplicate.data.added, false);
  const fallback = await request('/api/words', 'POST', { word: 'unknownword' });
  assert.equal(fallback.status, 201);
  assert.match(fallback.data.word.definition, /暂未查到/);
  assert.equal((await request('/api/words', 'POST', { word: 'two words' })).status, 400);
  const edited = await request(`/api/words/${id}`, 'PATCH', {
    mastered: true,
    definition: 'v. 扩展',
  });
  assert.equal(edited.data.word.mastered, true);
  const exported = await request('/api/words/export?format=csv');
  assert.match(exported.text, /"'=1\+1"/);
  assert.match(exported.response.headers.get('content-type'), /text\/csv/);
  const json = await request('/api/words/export?format=json');
  assert.equal(json.data.length, 2);
  assert.equal((await request(`/api/words/${id}`, 'DELETE')).status, 204);
  assert.equal((await request('/api/bootstrap')).data.words.length, 1);
});

test('a selected word can retain context from a long imported reading passage', async (t) => {
  const { request } = await serve(t);
  const context = `Reading can expand knowledge. ${'A longer passage supplies context. '.repeat(2000)}`;
  const added = await request('/api/words', 'POST', { word: 'expand', context });
  assert.equal(added.status, 201);
  assert.equal(added.data.word.context, context);
  assert.equal((await request('/api/words/export?format=json')).data[0].context, context);
});

test('attempt and vocabulary records persist across database reopening', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cet6-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'learning.sqlite');
  const first = await serve(t, { dbPath });
  const started = await first.request('/api/attempts', 'POST', { paperId: fixture.id });
  const id = started.data.attempt.id;
  await first.request(`/api/attempts/${id}`, 'PATCH', {
    answers: { q1: 'A', q3: 'Saved writing.' },
  });
  await first.request('/api/words', 'POST', { word: 'expand' });
  await first.close();
  const second = await serve(t, { dbPath });
  const restored = await second.request(`/api/attempts/${id}`);
  assert.equal(restored.data.attempt.answers.q3, 'Saved writing.');
  assert.equal((await second.request('/api/bootstrap')).data.words[0].word, 'expand');
});
