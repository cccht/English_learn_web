import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights, questionType } from '../server/analytics.mjs';
import { seedPapers } from '../server/seed.mjs';

const NOW = Date.parse('2026-09-12T12:00:00Z');
const DAY = 86400000;
const iso = (time) => new Date(time).toISOString();
const makePaper = (id = 'p1') => ({
  id,
  title: `试卷 ${id}`,
  kind: 'past',
  durationMinutes: 60,
  sections: [
    {
      id: 'reading',
      title: '阅读',
      durationMinutes: 40,
      groups: [
        {
          id: 'cloze',
          title: '选词填空',
          passage: 'Reliable evidence supports the claim.',
          questions: [
            {
              id: 'q1',
              number: 1,
              type: 'choice',
              prompt: 'Which claim is supported?',
              answer: 'A',
              options: [
                { id: 'A', text: 'The original claim.' },
                { id: 'B', text: 'The opposite claim.' },
              ],
              weight: 2,
              explanation: '核对 evidence 对应的证据句。',
            },
            {
              id: 'q2',
              number: 2,
              type: 'choice',
              prompt: 'Who said it?',
              answer: 'B',
              options: [
                { id: 'A', text: 'The student.' },
                { id: 'B', text: 'The teacher.' },
              ],
              weight: 1,
            },
          ],
        },
      ],
    },
    {
      id: 'writing',
      title: '写作',
      durationMinutes: 20,
      groups: [
        {
          id: 'essay',
          title: 'Essay',
          questions: [
            { id: 'essay', number: 3, type: 'text', prompt: 'Write an essay.', weight: 15 },
          ],
        },
      ],
    },
  ],
});
const makeAttempt = (id, changes = {}) => ({
  id,
  paperId: 'p1',
  status: 'submitted',
  startedAt: iso(NOW - 3600000),
  deadlineAt: iso(NOW),
  submittedAt: iso(NOW - 1000),
  answers: {},
  sectionSpent: { reading: 1200, writing: 600 },
  ...changes,
});
const analyze = (attempts, changes = {}) =>
  buildInsights({ papers: [makePaper()], attempts, words: [], now: NOW, ...changes });

test('skipped questions never become wrong answers or dilute answered-only accuracy; text is excluded', () => {
  const report = analyze([
    makeAttempt('a', { answers: { q1: 'B', q2: '  ', essay: 'Some text.' } }),
  ]);
  assert.deepEqual(
    {
      answered: report.summary.answered,
      wrong: report.summary.wrong,
      skipped: report.summary.skipped,
      accuracy: report.summary.accuracy,
    },
    { answered: 1, wrong: 1, skipped: 1, accuracy: 0 },
  );
  assert.equal(report.questionTypes.length, 1);
  assert.equal(report.questionTypes[0].errorRate, 100);
  assert.equal(report.questionTypes[0].lostPoints, 3);
  const correct = analyze([makeAttempt('a', { answers: { q1: 'A' } })]);
  assert.equal(correct.summary.accuracy, 100);
  assert.equal(correct.summary.wrong, 0);
  const empty = analyze([makeAttempt('a')]);
  assert.equal(empty.summary.accuracy, null);
  assert.equal(empty.questionTypes[0].errorRate, null);
  assert.equal(empty.summary.level, 'empty');
  assert.match(empty.priorities[0].interpretation, /不能判断/);
});

test('a repeated question is namespaced by paper, and a later skip is not a recovery', () => {
  const report = analyze(
    [
      makeAttempt('a', { submittedAt: iso(NOW - 4000), answers: { q1: 'B' } }),
      makeAttempt('b', { submittedAt: iso(NOW - 3000), answers: { q1: 'B' } }),
      makeAttempt('c', { submittedAt: iso(NOW - 2000), answers: { q1: '' } }),
      makeAttempt('d', { paperId: 'p2', submittedAt: iso(NOW - 1000), answers: { q1: 'A' } }),
    ],
    { papers: [makePaper('p1'), makePaper('p2')] },
  );
  assert.equal(report.repeatedMistakes.length, 1);
  const repeated = report.repeatedMistakes[0];
  assert.equal(repeated.paperId, 'p1');
  assert.equal(repeated.wrongCount, 2);
  assert.equal(repeated.seenCount, 3);
  assert.equal(repeated.lastOutcome, 'skipped');
  assert.equal(repeated.lastAttemptId, 'c');
  assert.equal(report.questionTypes[0].uniqueQuestions, 2);
});

test('repeated errors remain traceable after recovery, including user-reported reasons', () => {
  const report = analyze([
    makeAttempt('first', {
      submittedAt: iso(NOW - 3000),
      answers: { q1: 'B' },
      errorReasons: { q1: 'vocabulary', q2: 'time' },
    }),
    makeAttempt('second', {
      submittedAt: iso(NOW - 2000),
      answers: { q1: 'B' },
      errorReasons: { q1: 'locating' },
    }),
    makeAttempt('last', { submittedAt: iso(NOW - 1000), answers: { q1: 'A' } }),
  ]);
  assert.equal(report.repeatedMistakes[0].lastOutcome, 'correct');
  assert.equal(report.repeatedMistakes[0].wrongCount, 2);
  assert.match(report.repeatedMistakes[0].reason, /自行标记/);
  assert.ok(report.evidence.some((item) => item.id === 'error:vocabulary'));
  assert.ok(!report.evidence.some((item) => item.id === 'error:time'));
  assert.ok(!report.priorities.some((item) => item.title === '重做反复出错的题'));
});

test('repeated-error evidence contrasts the last wrong choice with the answer key after later recovery', () => {
  const paper = makePaper();
  const question = paper.sections[0].groups[0].questions[0];
  question.prompt = 'Which explanation? ' + 'x'.repeat(1000);
  question.options = [
    { id: 'A', text: 'Correct explanation. ' + 'a'.repeat(1000) },
    { id: 'B', text: 'Earlier wrong explanation.' },
    { id: 'C', text: 'Latest wrong explanation. ' + 'c'.repeat(1000) },
  ];
  const report = analyze(
    [
      makeAttempt('first', { submittedAt: iso(NOW - 3000), answers: { q1: 'B' } }),
      makeAttempt('second', { submittedAt: iso(NOW - 2000), answers: { q1: 'C' } }),
      makeAttempt('recovered', { submittedAt: iso(NOW - 1000), answers: { q1: 'A' } }),
    ],
    { papers: [paper] },
  );
  const { text } = report.evidence.find((item) => item.id === 'repeated:p1/q1');
  assert.match(text, /最近一次答对/);
  assert.match(text, /最近一次答错时误选“C: Latest wrong explanation/);
  assert.match(text, /正确选项“A: Correct explanation/);
  assert.ok(!text.includes('Earlier wrong explanation'));
  assert.ok(text.length <= 1000);
  assert.ok(!text.includes('a'.repeat(120)));
  assert.ok(!text.includes('c'.repeat(120)));
  assert.ok(!text.includes('x'.repeat(200)));
  assert.ok(!Object.hasOwn(report.repeatedMistakes[0], 'contrast'));
});

test('period boundary is inclusive, excludes active and future records, and supports all time', () => {
  const records = [
    makeAttempt('boundary', { submittedAt: iso(NOW - 30 * DAY), answers: { q1: 'A' } }),
    makeAttempt('older', { submittedAt: iso(NOW - 30 * DAY - 1), answers: { q1: 'B' } }),
    makeAttempt('active', { status: 'active', answers: { q1: 'B' } }),
    makeAttempt('future', { submittedAt: iso(NOW + 1), answers: { q1: 'B' } }),
  ];
  const report = analyze(records);
  assert.equal(report.summary.attemptCount, 1);
  assert.equal(report.summary.correct, 1);
  assert.equal(analyze(records, { days: null }).summary.attemptCount, 2);
  assert.equal(analyze(records, { days: 7 }).summary.attemptCount, 0);
});

test('old records do not imply zero changes; new telemetry counts only recorded choice transitions', () => {
  const report = analyze([
    makeAttempt('old', { answers: { q1: 'A' } }),
    makeAttempt('new', {
      answers: { q1: 'A' },
      autoSubmitted: true,
      telemetry: {
        version: 1,
        firstAnswers: { q1: 'A' },
        answerChanges: [
          { questionId: 'q1', from: '', to: 'A', at: iso(NOW - 3000000) },
          { questionId: 'q1', from: 'A', to: 'B', at: iso(NOW - 120000) },
          { questionId: 'q1', from: 'B', to: 'A', at: iso(NOW - 60000) },
          { questionId: 'essay', from: 'one', to: 'two', at: iso(NOW - 10000) },
          { questionId: 'q1', from: 'A', to: 'A', at: iso(NOW - 5000) },
        ],
        sectionSwitches: [{ from: 'reading', to: 'writing', at: iso(NOW - 2000000) }],
      },
    }),
  ]);
  assert.equal(report.habits.telemetryAttempts, 1);
  assert.equal(report.habits.answerChanges, 2);
  assert.equal(report.habits.correctToWrong, 1);
  assert.equal(report.habits.wrongToCorrect, 1);
  assert.equal(report.habits.lateChanges, 2);
  assert.equal(report.habits.sectionSwitches, 1);
  assert.equal(report.habits.autoSubmitted, 1);
  assert.ok(report.limitations.some((item) => /1 次旧练习/.test(item)));
  assert.ok(report.limitations.some((item) => /墙钟/.test(item)));
  assert.ok(
    analyze([makeAttempt('old')]).habits.notes.some((item) =>
      /不能.*还原/.test(item.interpretation),
    ),
  );
});

test('saved words require exact lexical evidence and cause uncertainty is preserved', () => {
  const paper = makePaper();
  paper.sections[0].groups[0].passage = 'An artificial reliable device joined the party.';
  const words = [
    { id: 'art', word: 'art', definition: '艺术', createdAt: iso(NOW - DAY) },
    { id: 'reliable', word: 'reliable', definition: '可靠的', createdAt: iso(NOW - DAY) },
    {
      id: 'long',
      word: 'uncharacteristically',
      definition: '一反常态地',
      createdAt: iso(NOW - DAY),
    },
  ];
  const report = analyze([makeAttempt('a', { answers: { q1: 'B' } })], { papers: [paper], words });
  const byId = Object.fromEntries(report.vocabulary.words.map((word) => [word.id, word]));
  assert.equal(byId.art.linkedMistakes, 0);
  assert.equal(byId.reliable.linkedMistakes, 1);
  assert.match(byId.reliable.hypothesis, /不能.*认定/);
  assert.match(byId.long.hypothesis, /尚无足够证据/);
  assert.equal(byId.long.reason, 'unknown');
  assert.equal(report.vocabulary.reasonCounts.find((row) => row.id === 'unknown').count, 3);
});

test('review evidence and explicit causes are separate; current book survives the period filter', () => {
  const words = [
    {
      id: 'old',
      word: 'evidence',
      createdAt: iso(NOW - 80 * DAY),
      reason: 'context',
      encounters: [{ at: iso(NOW - 80 * DAY) }],
      reviewHistory: [{ at: iso(NOW - 60 * DAY), rating: 'forgotten' }],
    },
    {
      id: 'forget',
      word: 'reliable',
      createdAt: iso(NOW - 10 * DAY),
      reviewHistory: [
        { at: iso(NOW - DAY), rating: 'forgotten' },
        { at: iso(NOW - DAY / 2), rating: 'forgotten' },
      ],
    },
  ];
  const report = analyze([], { words });
  assert.equal(report.summary.vocabularyCount, 2);
  const old = report.vocabulary.words.find((word) => word.id === 'old');
  assert.equal(old.encounterCount, 0);
  assert.equal(old.reviewCount, 0);
  assert.match(old.hypothesis, /自述/);
  const forgot = report.vocabulary.words.find((word) => word.id === 'forget');
  assert.equal(forgot.forgotCount, 2);
  assert.equal(forgot.reason, 'unknown');
  assert.match(forgot.hypothesis, /尚不能区分/);
});

test('different groups in the same paper are not linked merely through a word encounter paperId', () => {
  const paper = makePaper();
  paper.sections[0].groups.push({
    id: 'detail',
    title: 'Passage One',
    passage: 'A serendipity story.',
    questions: [
      { id: 'q3', number: 3, type: 'choice', prompt: 'What happened?', answer: 'A', weight: 1 },
    ],
  });
  const report = analyze([makeAttempt('a', { answers: { q1: 'B', q2: 'B', q3: 'A' } })], {
    papers: [paper],
    words: [
      {
        id: 'w',
        word: 'serendipity',
        createdAt: iso(NOW - 100),
        encounters: [
          { at: iso(NOW - 100), paperId: 'p1', attemptId: 'a', context: 'A serendipity story.' },
        ],
      },
    ],
  });
  assert.equal(report.vocabulary.words[0].linkedMistakes, 0);
});

test('classification uses explicit subtype or content labels, never question number', () => {
  assert.equal(
    questionType(
      { id: 'listening', title: '听力' },
      { id: 'custom', title: 'Imported group' },
      { number: 1 },
    ).id,
    'listening_other',
  );
  assert.equal(
    questionType(
      { id: 'reading', title: '阅读' },
      { id: 'custom', title: 'Questions', questionType: 'reading_inference' },
    ).id,
    'reading_inference',
  );
  assert.equal(
    questionType({ id: 'reading', title: '阅读' }, { id: 'custom', title: 'Passage Two' }).id,
    'reading_detail',
  );
  const paper = seedPapers.find((paper) => paper.available && paper.sections);
  const report = buildInsights({
    papers: [paper],
    attempts: [makeAttempt('seed', { paperId: paper.id })],
    words: [],
    now: NOW,
  });
  assert.deepEqual(report.questionTypes.map((type) => type.id).sort(), [
    'listening_conversation',
    'listening_lecture',
    'listening_passage',
    'reading_cloze',
    'reading_detail',
    'reading_matching',
  ]);
  assert.equal(report.summary.skipped, 55);
  assert.ok(report.limitations.some((text) => /原创练习/.test(text)));
});

test('imported subtype and error-reason names cannot read inherited object properties', () => {
  const paper = makePaper();
  paper.sections[0].groups[0].questionType = 'toString';
  const report = analyze(
    [makeAttempt('a', { answers: { q1: 'B' }, errorReasons: { q1: 'toString' } })],
    { papers: [paper] },
  );
  assert.equal(typeof report.questionTypes[0].label, 'string');
  assert.equal(typeof report.questionTypes[0].recommendation, 'string');
  assert.ok(!report.evidence.some((item) => item.id === 'error:toString'));
  assert.equal(report.questionTypes[0].uniqueQuestions, 1);
  assert.match(report.evidence.find((item) => item.id.startsWith('type:')).text, /独立已答题 1 道/);
});

test('repeating a tiny set never produces high confidence', () => {
  const records = Array.from({ length: 60 }, (_, i) =>
    makeAttempt(`repeat-${i}`, { answers: { q1: 'B', q2: 'B' } }),
  );
  const report = analyze(records);
  assert.equal(report.questionTypes[0].answered, 120);
  assert.equal(report.questionTypes[0].uniqueQuestions, 2);
  assert.equal(report.questionTypes[0].confidence, 'low');
  assert.equal(report.summary.level, 'limited');
});

test('fingerprint is deterministic, independent of generation time, and changes with diagnoses or review feedback', () => {
  const attempts = [makeAttempt('a', { answers: { q1: 'B' } })];
  const words = [{ id: 'w', word: 'reliable', createdAt: iso(NOW - DAY) }];
  const initial = analyze(attempts, { words });
  assert.equal(initial.fingerprint, analyze(attempts, { words, now: NOW + 1000 }).fingerprint);
  assert.notEqual(initial.generatedAt, analyze(attempts, { words, now: NOW + 1000 }).generatedAt);
  assert.notEqual(
    initial.fingerprint,
    analyze([{ ...attempts[0], errorReasons: { q1: 'vocabulary' } }], { words }).fingerprint,
  );
  assert.notEqual(
    initial.fingerprint,
    analyze(attempts, {
      words: [{ ...words[0], reviewHistory: [{ at: iso(NOW - 500), rating: 'forgotten' }] }],
    }).fingerprint,
  );
  assert.notEqual(initial.fingerprint, analyze(attempts, { words, days: 7 }).fingerprint);
  assert.equal(
    initial.fingerprint,
    analyze(attempts, { words: [{ createdAt: words[0].createdAt, word: 'reliable', id: 'w' }] })
      .fingerprint,
  );
});
