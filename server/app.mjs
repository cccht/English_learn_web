import express from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';
import { allQuestions, gradeAttempt, sanitizePaper } from './scoring.mjs';
import { seedPapers, seedDictionary } from './seed.mjs';
import { buildInsights } from './analytics.mjs';
import { createAiService, normalizeConfig } from './ai.mjs';
import { createAccessGate } from './access.mjs';
import { createAccounts } from './accounts.mjs';
import { createAccountRoutes } from './admin.mjs';
import { createAnnotationRoutes } from './annotations.mjs';
import { createLibraryService } from './library.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const identifier = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine(
    (value) => !['__proto__', 'constructor', 'prototype'].includes(value),
    'ID 使用了保留名称',
  );
const audioUrlSchema = z
  .string()
  .max(4000)
  .refine((value) => {
    if (value !== value.trim() || /[\\\u0000-\u001f]/.test(value)) return false;
    try {
      if (value.startsWith('/') && !value.startsWith('//'))
        return new URL(value, 'http://localhost').origin === 'http://localhost';
      if (!/^https?:\/\//i.test(value)) return false;
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, '音频需要有效的 HTTP、HTTPS 地址或本站路径');
const optionSchema = z.object({ id: identifier, text: z.string().min(1).max(20000) });
const questionSchema = z
  .object({
    id: identifier,
    number: z.number().int().positive().max(500),
    type: z.enum(['choice', 'text']),
    grading: z.enum(['auto', 'manual']).optional(),
    sourcePage: z.number().int().min(1).max(80).optional(),
    originalNumber: z.string().max(20).optional(),
    prompt: z.string().max(50000),
    options: z.array(optionSchema).max(30).optional().default([]),
    answer: z.string().max(20000).optional(),
    explanation: z.string().max(50000).optional().default(''),
    weight: z.number().positive().max(100),
    referenceAnswer: z.string().max(50000).optional(),
    keywords: z.array(z.string().max(200)).max(200).optional(),
    minWords: z.number().int().nonnegative().max(10000).optional(),
    maxWords: z.number().int().positive().max(10000).optional(),
  })
  .superRefine((question, ctx) => {
    if (question.type === 'choice') {
      if (question.options.length < 2)
        ctx.addIssue({ code: 'custom', message: '选择题至少需要两个选项' });
      if (
        (question.answer || question.grading !== 'manual') &&
        !question.options.some((option) => option.id === question.answer)
      )
        ctx.addIssue({ code: 'custom', message: '选择题答案必须对应选项 ID' });
      if (new Set(question.options.map((option) => option.id)).size !== question.options.length)
        ctx.addIssue({ code: 'custom', message: '选项 ID 不能重复' });
    }
    if (
      question.type === 'text' &&
      question.grading !== 'manual' &&
      !question.referenceAnswer?.trim()
    )
      ctx.addIssue({ code: 'custom', message: '主观题需要参考答案' });
    if (
      question.minWords !== undefined &&
      question.maxWords !== undefined &&
      question.minWords > question.maxWords
    )
      ctx.addIssue({ code: 'custom', message: '最少字数不能超过最多字数' });
  });
const groupSchema = z.object({
  id: identifier,
  title: z.string().min(1).max(300),
  instructions: z.string().max(50000).optional().default(''),
  passage: z.string().max(100000).optional().default(''),
  transcript: z.string().max(100000).optional(),
  audioUrl: audioUrlSchema.optional(),
  questionType: z.string().min(1).max(80).optional(),
  questions: z.array(questionSchema).min(1).max(100),
});
const paperSchema = z
  .object({
    id: identifier,
    title: z.string().min(1).max(300),
    subtitle: z.string().max(1000).optional().default(''),
    description: z.string().max(2000).optional(),
    kind: z.enum(['practice', 'past']),
    year: z.number().int().min(1980).max(2100),
    month: z.number().int().min(1).max(12),
    set: z.number().int().min(0).max(10),
    available: z.boolean(),
    durationMinutes: z.number().min(1).max(300),
    source: z.object({
      label: z.string().min(1).max(500),
      url: z.union([
        z.literal(''),
        z
          .string()
          .url()
          .refine((url) => /^https?:\/\//i.test(url), '来源仅支持 HTTP 或 HTTPS 地址'),
      ]),
    }),
    sections: z
      .array(
        z.object({
          id: z.enum(['writing', 'listening', 'reading', 'translation']),
          title: z.string().min(1).max(300),
          durationMinutes: z.number().positive().max(300),
          groups: z.array(groupSchema).min(1).max(30),
        }),
      )
      .max(4),
  })
  .superRefine((paper, ctx) => {
    if (paper.available && paper.sections.length === 0)
      ctx.addIssue({ code: 'custom', message: '可练习试卷必须包含题目' });
    if (new Set(paper.sections.map((section) => section.id)).size !== paper.sections.length)
      ctx.addIssue({ code: 'custom', message: '大题 ID 不能重复' });
    const questions = allQuestions(paper);
    if (new Set(questions.map((question) => question.id)).size !== questions.length)
      ctx.addIssue({ code: 'custom', message: '题目 ID 不能重复' });
    if (new Set(questions.map((question) => question.number)).size !== questions.length)
      ctx.addIssue({ code: 'custom', message: '题号不能重复' });
    const groups = paper.sections.flatMap((section) => section.groups);
    if (new Set(groups.map((group) => group.id)).size !== groups.length)
      ctx.addIssue({ code: 'custom', message: '题组 ID 不能重复' });
    if (
      questions.length &&
      Math.abs(questions.reduce((sum, question) => sum + question.weight, 0) - 100) > 0.001
    )
      ctx.addIssue({ code: 'custom', message: '所有题目分值之和必须为 100' });
  });

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function metadata(paper) {
  const { sections, ...summary } = paper;
  return {
    ...summary,
    questionCount: allQuestions(paper).length,
    manualQuestionCount: allQuestions(paper).filter((question) => question.grading === 'manual')
      .length,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      durationMinutes: section.durationMinutes,
      questionCount: section.groups.reduce((sum, group) => sum + group.questions.length, 0),
    })),
  };
}

function publicAttempt(attempt) {
  const { lastSeen, selfScores, telemetry, ...result } = attempt;
  return result;
}

function validateAnswers(paper, input) {
  const answers = z.record(z.string(), z.string().max(30000)).parse(input);
  const questions = new Map(allQuestions(paper).map((question) => [question.id, question]));
  for (const [id, value] of Object.entries(answers)) {
    const question = questions.get(id);
    if (!question) fail(400, `未知题目：${id}`);
    if (
      question.type === 'choice' &&
      value !== '' &&
      !question.options.some((option) => option.id === value)
    )
      fail(400, `题目 ${question.number} 的选项无效`);
  }
  return answers;
}

const csvCell = (input) => {
  let value = String(input ?? '');
  if (/^[\s]*[=+@-]/.test(value)) value = `'${value}`;
  return `"${value.replaceAll('"', '""')}"`;
};

const staticOptions = {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (/[\\/](?:assets|fonts)[\\/]/.test(filePath) && !filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
};

export function createApp({
  dbPath = resolve(ROOT, 'data/learning.sqlite'),
  now = () => Date.now(),
  initialPapers = seedPapers,
  dictionary = seedDictionary,
  fetchImpl = globalThis.fetch,
  aiFetchImpl = globalThis.fetch,
  aiDefaultConfig = {},
  access,
  storeOverride,
  authenticatedUser,
  aiBaseRestriction,
  staticDir = resolve(ROOT, 'dist'),
  pdfExtract,
  pdfRender,
} = {}) {
  const store = storeOverride || createStore(dbPath);
  for (const paper of initialPapers) {
    if (!store.getSharedPaper(paper.id)) store.addSharedPaper(paperSchema.parse(paper));
  }
  if (access) {
    const accounts = createAccounts({ db: store.db, bootstrapPassword: access.password, now });
    const app = express();
    const tenants = new Map();
    app.disable('x-powered-by');
    app.set('trust proxy', 'loopback');
    app.use(createAccessGate({ ...access, accounts, now }));
    app.use('/api', createAccountRoutes(accounts));
    const dist = staticDir;
    app.use((req, res, next) => {
      if (!req.user)
        return express.static(dist, staticOptions)(req, res, () => res.status(404).end());
      let tenant = tenants.get(req.user.id);
      if (!tenant) {
        tenant = createApp({
          now,
          initialPapers: [],
          dictionary,
          fetchImpl,
          aiFetchImpl,
          aiDefaultConfig:
            req.user.role === 'admin'
              ? aiDefaultConfig
              : {
                  provider: 'openai-compatible',
                  baseUrl: 'https://api.openai.com/v1',
                  model: '',
                  apiKey: '',
                },
          storeOverride: store.forUser(req.user.id),
          authenticatedUser: req.user,
          staticDir,
          pdfExtract,
          pdfRender,
          aiBaseRestriction:
            req.user.role === 'admin' ? undefined : () => accounts.memberAiBaseUrl(),
        });
        tenants.set(req.user.id, tenant);
      }
      tenant.app(req, res, next);
    });
    app.use((error, _req, res, _next) =>
      res.status(error instanceof z.ZodError ? 400 : error.status || 500).json({
        error:
          error instanceof z.ZodError
            ? error.issues[0].message
            : error.status
              ? error.message
              : '账号服务暂时不可用，请稍后重试。',
      }),
    );
    return {
      app,
      store,
      accounts,
      ready: accounts.ready,
      close: async () => {
        await accounts.ready.catch(() => {});
        await Promise.allSettled([...tenants.values()].map((tenant) => tenant.close()));
        if (!storeOverride) store.close();
      },
    };
  }
  const ai = createAiService({
    store,
    now,
    fetchImpl: aiFetchImpl,
    defaultConfig: aiDefaultConfig,
  });
  const syncAiPolicy = () => {
    if (!aiBaseRestriction) return;
    const allowed = aiBaseRestriction();
    const config = ai.getConfig();
    if (config.baseUrl !== allowed || config.provider !== 'openai-compatible')
      ai.updateConfig({ provider: 'openai-compatible', baseUrl: allowed });
  };
  const publicAiConfig = () => {
    syncAiPolicy();
    return { ...ai.getConfig(), managedEndpoint: Boolean(aiBaseRestriction) };
  };
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', createAnnotationRoutes({ store, now }));
  const library = createLibraryService({
    store,
    now,
    parsePaper: (input) => paperSchema.parse(input),
    metadata,
    authenticatedUser,
    extract: pdfExtract,
    render: pdfRender,
  });
  app.use('/api', library.router);

  function touch(attempt) {
    if (attempt.status !== 'active') return attempt;
    const deadline = Date.parse(attempt.deadlineAt);
    const until = Math.min(now(), deadline);
    const elapsed = Math.max(0, until - Date.parse(attempt.lastSeen)) / 1000;
    attempt.sectionSpent[attempt.currentSection] =
      (attempt.sectionSpent[attempt.currentSection] || 0) + elapsed;
    attempt.lastSeen = new Date(Math.max(until, Date.parse(attempt.lastSeen))).toISOString();
    if (now() >= deadline) {
      attempt.status = 'submitted';
      attempt.submittedAt = attempt.deadlineAt;
      attempt.autoSubmitted = true;
      attempt.result = gradeAttempt(store.getPaper(attempt.paperId), attempt.answers);
    }
    store.saveAttempt(attempt);
    return attempt;
  }
  function requireAttempt(id) {
    const attempt = store.getAttempt(id);
    if (!attempt) fail(404, '答题记录不存在');
    return touch(attempt);
  }
  function attemptPayload(attempt) {
    const paper = store.getPaper(attempt.paperId);
    return {
      attempt: publicAttempt(attempt),
      paper: attempt.status === 'submitted' ? paper : sanitizePaper(paper),
      user: authenticatedUser || null,
    };
  }

  function applyAnswers(attempt, paper, input) {
    const answers = validateAnswers(paper, input);
    if (attempt.telemetry?.version === 1) {
      const choices = new Set(
        allQuestions(paper)
          .filter((q) => q.type === 'choice')
          .map((q) => q.id),
      );
      for (const [questionId, to] of Object.entries(answers)) {
        if (!choices.has(questionId)) continue;
        const from = Object.hasOwn(attempt.answers, questionId) ? attempt.answers[questionId] : '';
        if (to && !Object.hasOwn(attempt.telemetry.firstAnswers, questionId))
          attempt.telemetry.firstAnswers[questionId] = to;
        if (from && from !== to)
          attempt.telemetry.answerChanges.push({
            questionId,
            from,
            to,
            at: new Date(now()).toISOString(),
          });
      }
    }
    attempt.answers = { ...attempt.answers, ...answers };
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/bootstrap', (_req, res) => {
    res.json({
      papers: store.listPapers().map(metadata),
      attempts: store.listAttempts().map((attempt) => publicAttempt(touch(attempt))),
      words: store.listWords(),
      accessRequired: Boolean(authenticatedUser),
      user: authenticatedUser || null,
    });
  });
  const rangeDays = (value) =>
    value === null || value === 'all'
      ? null
      : z.coerce
          .number()
          .int()
          .refine((number) => number === 30 || number === 90, '请选择近 30 天、90 天或全部记录')
          .parse(value ?? 30);
  const diagnose = (days) =>
    buildInsights({
      papers: store.listPapers(),
      attempts: store.listAttempts().map(touch),
      words: store.listWords(),
      days,
      now: now(),
    });
  app.get('/api/insights', (req, res) => res.json(diagnose(rangeDays(req.query.days))));
  app.get('/api/ai/config', (_req, res) => res.json(publicAiConfig()));
  app.put('/api/ai/config', (req, res) => {
    syncAiPolicy();
    if (aiBaseRestriction) {
      const config = normalizeConfig({
        provider: req.body?.provider || 'openai-compatible',
        baseUrl: req.body?.baseUrl || aiBaseRestriction(),
        model: '',
        apiKey: '',
        timeoutSeconds: 90,
      });
      if (config.provider !== 'openai-compatible' || config.baseUrl !== aiBaseRestriction())
        fail(403, '普通账号的 AI 服务地址由管理员设置，可以填写自己的模型名和 API Key。');
    }
    ai.updateConfig(req.body);
    res.json(publicAiConfig());
  });
  app.get('/api/ai/models', async (_req, res) => {
    syncAiPolicy();
    res.json(await ai.getModels());
  });
  app.get('/api/insights/ai/history', (req, res) => {
    const days = rangeDays(req.query.days);
    const jobs = store
      .listAiJobs()
      .filter((job) => job.rangeDays === days)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30)
      .map((job) => {
        const { result, evidence, ...summary } = ai.getJob(job.id);
        return summary;
      });
    res.json({ jobs });
  });
  app.get('/api/insights/ai/latest', (req, res) =>
    res.json({ job: ai.latest(rangeDays(req.query.days)) || null }),
  );
  app.post('/api/insights/ai', (req, res) => {
    syncAiPolicy();
    const input = z
      .object({ days: z.union([z.number(), z.null()]).optional(), force: z.boolean().optional() })
      .strict()
      .parse(req.body || {});
    const report = diagnose(rangeDays(input.days));
    const job = ai.start(report, { force: input.force ?? false });
    res.status(job.status === 'completed' ? 200 : 202).json({ job });
  });
  app.get('/api/insights/ai/:id', (req, res) => {
    const job = ai.getJob(req.params.id);
    if (!job) fail(404, '这份 AI 分析记录不存在');
    res.json({ job });
  });
  app.get('/api/template', (_req, res) => {
    res.attachment('cet6-paper-template.json').json({
      id: 'my-cet6-paper',
      title: '我的六级试卷',
      subtitle: '请替换为您有权使用的题目与答案',
      kind: 'practice',
      year: 2026,
      month: 6,
      set: 1,
      available: true,
      durationMinutes: 70,
      source: { label: '自行整理', url: '' },
      sections: [
        {
          id: 'reading',
          title: '阅读理解',
          durationMinutes: 40,
          groups: [
            {
              id: 'reading-a',
              title: '仔细阅读',
              instructions: 'Choose the best answer.',
              passage: 'The library opens at nine every morning.',
              questions: [
                {
                  id: 'reading-1',
                  number: 1,
                  type: 'choice',
                  prompt: 'When does the library open?',
                  options: [
                    { id: 'A', text: 'At eight.' },
                    { id: 'B', text: 'At nine.' },
                  ],
                  answer: 'B',
                  explanation: '文章明确指出图书馆每天上午九点开放。',
                  weight: 70,
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
              id: 'writing-a',
              title: '短文写作',
              instructions: 'Write about the importance of reading.',
              passage: '',
              questions: [
                {
                  id: 'writing-1',
                  number: 2,
                  type: 'text',
                  prompt: 'The importance of reading',
                  referenceAnswer:
                    'Reading introduces us to new ideas and helps us understand the world.',
                  explanation: '结合个人经历，论述阅读的意义，并检查语法与段落结构。',
                  weight: 30,
                },
              ],
            },
          ],
        },
      ],
    });
  });
  app.get('/api/papers/:id', (req, res) => {
    const paper = store.getPaper(req.params.id);
    if (!paper) fail(404, '试卷不存在');
    res.json(sanitizePaper(paper));
  });
  app.post('/api/papers', (req, res) => {
    const paper = paperSchema.parse(req.body);
    if (store.getPaper(paper.id)) fail(409, '试卷 ID 已存在，请修改 ID 后重新导入');
    store.addPaper(paper);
    res.status(201).json({ paper: metadata(paper) });
  });

  app.post('/api/attempts', (req, res) => {
    const { paperId } = z.object({ paperId: identifier }).parse(req.body);
    const paper = store.getPaper(paperId);
    if (!paper) fail(404, '试卷不存在');
    if (!paper.available) fail(409, '这份试卷尚未导入题目，请先导入有权使用的完整试卷');
    const activeAttempts = store
      .listAttempts()
      .map(touch)
      .filter((attempt) => attempt.status === 'active');
    const existing = activeAttempts.find((attempt) => attempt.paperId === paperId);
    if (existing) return res.json(attemptPayload(existing));
    if (activeAttempts.length)
      fail(
        409,
        `已有进行中的试卷“${activeAttempts[0].paperTitle}”，请继续作答或交卷后再开始其他试卷`,
      );
    const started = now();
    const attempt = {
      id: randomUUID(),
      paperId,
      paperTitle: paper.title,
      status: 'active',
      startedAt: new Date(started).toISOString(),
      deadlineAt: new Date(started + paper.durationMinutes * 60000).toISOString(),
      lastSeen: new Date(started).toISOString(),
      currentSection: paper.sections[0].id,
      currentGroup: paper.sections[0].groups[0].id,
      answers: {},
      sectionSpent: Object.fromEntries(paper.sections.map((section) => [section.id, 0])),
      telemetry: { version: 1, firstAnswers: {}, answerChanges: [], sectionSwitches: [] },
    };
    store.saveAttempt(attempt);
    res.status(201).json(attemptPayload(attempt));
  });
  app.get('/api/attempts/:id', (req, res) =>
    res.json(attemptPayload(requireAttempt(req.params.id))),
  );
  app.patch('/api/attempts/:id', (req, res) => {
    const input = z
      .object({
        answers: z.record(z.string(), z.string()).optional(),
        currentSection: z.string().optional(),
        currentGroup: z.string().optional(),
      })
      .strict()
      .parse(req.body);
    const attempt = requireAttempt(req.params.id);
    if (attempt.status !== 'active') return res.json(attemptPayload(attempt));
    const paper = store.getPaper(attempt.paperId);
    const selectedSection = paper.sections.find(
      (section) => section.id === (input.currentSection ?? attempt.currentSection),
    );
    if (!selectedSection) fail(400, '大题不存在');
    if (
      input.currentGroup !== undefined &&
      !selectedSection.groups.some((group) => group.id === input.currentGroup)
    )
      fail(400, '题组不属于当前大题');
    if (input.answers) applyAnswers(attempt, paper, input.answers);
    if (input.currentSection !== undefined) {
      if (!paper.sections.some((section) => section.id === input.currentSection))
        fail(400, '大题不存在');
      if (attempt.telemetry?.version === 1 && attempt.currentSection !== input.currentSection) {
        attempt.telemetry.sectionSwitches.push({
          from: attempt.currentSection,
          to: input.currentSection,
          at: new Date(now()).toISOString(),
        });
      }
      attempt.currentSection = input.currentSection;
    }
    attempt.currentGroup =
      input.currentGroup ||
      (selectedSection.groups.some((group) => group.id === attempt.currentGroup)
        ? attempt.currentGroup
        : selectedSection.groups[0].id);
    store.saveAttempt(attempt);
    res.json(attemptPayload(attempt));
  });
  app.post('/api/attempts/:id/submit', (req, res) => {
    const input = z
      .object({ answers: z.record(z.string(), z.string()).optional() })
      .strict()
      .parse(req.body || {});
    const attempt = requireAttempt(req.params.id);
    if (attempt.status === 'submitted') return res.json(attemptPayload(attempt));
    const paper = store.getPaper(attempt.paperId);
    if (input.answers) applyAnswers(attempt, paper, input.answers);
    attempt.status = 'submitted';
    attempt.submittedAt = new Date(now()).toISOString();
    attempt.autoSubmitted = false;
    attempt.result = gradeAttempt(paper, attempt.answers);
    store.saveAttempt(attempt);
    res.json(attemptPayload(attempt));
  });
  app.post('/api/attempts/:id/self-grade', (req, res) => {
    const { scores } = z
      .object({ scores: z.record(z.string(), z.number().nonnegative()) })
      .strict()
      .parse(req.body);
    const attempt = requireAttempt(req.params.id);
    if (attempt.status !== 'submitted') fail(409, '请先交卷');
    const paper = store.getPaper(attempt.paperId);
    const subjective = new Map(
      allQuestions(paper)
        .filter((question) => question.type === 'text' || question.grading === 'manual')
        .map((question) => [question.id, question]),
    );
    for (const [id, score] of Object.entries(scores)) {
      if (!subjective.has(id)) fail(400, '只能对人工评分题自行评分');
      if (score > subjective.get(id).weight)
        fail(400, `题目 ${subjective.get(id).number} 的分数不能高于满分`);
    }
    attempt.selfScores = { ...attempt.selfScores, ...scores };
    attempt.result = gradeAttempt(paper, attempt.answers, attempt.selfScores);
    store.saveAttempt(attempt);
    res.json(attemptPayload(attempt));
  });

  app.patch('/api/attempts/:id/error-reasons', (req, res) => {
    const { questionId, reason } = z
      .object({
        questionId: identifier,
        reason: z.enum([
          'unknown',
          'vocabulary',
          'grammar',
          'locating',
          'inference',
          'time',
          'careless',
        ]),
      })
      .strict()
      .parse(req.body);
    const attempt = requireAttempt(req.params.id);
    if (attempt.status !== 'submitted') fail(409, '交卷后才能标记错因');
    const item = attempt.result?.items.find((q) => q.questionId === questionId);
    if (!item || item.correct !== false) fail(400, '只能标记本次练习的客观错题或未答题');
    attempt.errorReasons = { ...attempt.errorReasons, [questionId]: reason };
    store.saveAttempt(attempt);
    res.json(attemptPayload(attempt));
  });

  async function lookupWord(word) {
    const local = Object.hasOwn(dictionary, word) ? dictionary[word] : undefined;
    if (local)
      return typeof local === 'string' ? { phonetic: '', definition: local, example: '' } : local;
    try {
      const response = await fetchImpl(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (response.ok) {
        const entries = await response.json();
        const entry = Array.isArray(entries) ? entries[0] : undefined;
        const meaning = entry?.meanings?.[0];
        const definition = meaning?.definitions?.[0];
        if (typeof definition?.definition === 'string')
          return {
            phonetic: String(
              entry.phonetic || entry.phonetics?.find((phonetic) => phonetic.text)?.text || '',
            ).slice(0, 200),
            definition: `${meaning.partOfSpeech || ''} ${definition.definition}`
              .trim()
              .slice(0, 5000),
            example: String(definition.example || '').slice(0, 5000),
          };
      }
    } catch {
      /* A lookup failure must not prevent saving a selected word. */
    }
    return { phonetic: '', definition: '暂未查到释义，可手动补充', example: '' };
  }
  app.get('/api/words/export', (req, res) => {
    const format = z.enum(['csv', 'json', 'txt']).parse(req.query.format || 'csv');
    const words = store.listWords();
    res.attachment(`cet6-vocabulary-${new Date(now()).toISOString().slice(0, 10)}.${format}`);
    if (format === 'json') return res.json(words);
    if (format === 'txt')
      return res
        .type('text/plain; charset=utf-8')
        .send(
          words
            .map(
              (word) =>
                `${word.word}\t${word.phonetic}\t${word.definition}\n${word.context || word.example || ''}`,
            )
            .join('\n\n'),
        );
    const columns = [
      'word',
      'phonetic',
      'definition',
      'example',
      'context',
      'paperTitle',
      'mastered',
      'createdAt',
      'reason',
      'encounterCount',
      'reviewCount',
      'forgotCount',
    ];
    const rows = [
      columns,
      ...words.map((word) => {
        const expanded = {
          ...word,
          reason: word.reason || 'unknown',
          encounterCount: word.encounters?.length ?? 1,
          reviewCount: word.reviewHistory?.length ?? 0,
          forgotCount:
            word.reviewHistory?.filter((item) => item.rating === 'forgotten').length ?? 0,
        };
        return columns.map((column) => expanded[column]);
      }),
    ];
    res
      .type('text/csv; charset=utf-8')
      .send(`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`);
  });
  app.post('/api/words', async (req, res) => {
    const input = z
      .object({
        word: z.string().min(1).max(100),
        context: z.string().max(200000).optional().default(''),
        paperTitle: z.string().max(300).optional().default(''),
        paperId: identifier.optional(),
        attemptId: identifier.optional(),
      })
      .parse(req.body);
    const word = input.word
      .trim()
      .toLowerCase()
      .replace(/^[^a-z]+|[^a-z]+$/g, '');
    if (!/^[a-z]+(?:['-][a-z]+)*$/.test(word)) fail(400, '请选择一个英文单词');
    let paperId = input.paperId;
    if (input.attemptId) {
      const related = store.getAttempt(input.attemptId);
      if (!related) fail(400, '关联答卷不存在');
      if (paperId && paperId !== related.paperId) fail(400, '单词来源与答卷不匹配');
      paperId = related.paperId;
    }
    if (paperId && !store.getPaper(paperId)) fail(400, '关联试卷不存在');
    const encounter = {
      at: new Date(now()).toISOString(),
      context: input.context,
      ...(paperId ? { paperId } : {}),
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
    };
    const encounterAgain = (existing) => {
      const history = existing.encounters || [
        { at: existing.createdAt, context: existing.context || '', legacy: true },
      ];
      existing.encounters = [...history, encounter];
      existing.lastEncounterAt = encounter.at;
      store.saveWord(existing);
      return res.json({ word: existing, added: false });
    };
    const existing = store.findWord(word);
    if (existing) return encounterAgain(existing);
    const details = await lookupWord(word);
    const concurrent = store.findWord(word);
    if (concurrent) return encounterAgain(concurrent);
    const record = {
      id: randomUUID(),
      word,
      phonetic: details.phonetic || '',
      definition: details.definition || '',
      example: details.example || '',
      context: input.context,
      paperTitle: input.paperTitle,
      createdAt: new Date(now()).toISOString(),
      mastered: false,
      reason: 'unknown',
      encounters: [encounter],
      reviewHistory: [],
    };
    store.saveWord(record);
    res.status(201).json({ word: record, added: true });
  });
  app.patch('/api/words/:id', (req, res) => {
    const input = z
      .object({
        mastered: z.boolean().optional(),
        definition: z.string().max(5000).optional(),
        reason: z
          .enum(['unknown', 'new', 'forgotten', 'context', 'listening', 'confusion', 'collocation'])
          .optional(),
      })
      .strict()
      .parse(req.body);
    const word = store.getWord(req.params.id);
    if (!word) fail(404, '单词不存在');
    Object.assign(word, input);
    store.saveWord(word);
    res.json({ word });
  });
  app.post('/api/words/:id/review', (req, res) => {
    const { eventId, rating } = z
      .object({ eventId: identifier, rating: z.enum(['remembered', 'forgotten']) })
      .strict()
      .parse(req.body);
    const word = store.getWord(req.params.id);
    if (!word) fail(404, '单词不存在');
    const history = word.reviewHistory || [];
    if (!history.some((item) => item.id === eventId)) {
      word.reviewHistory = [...history, { id: eventId, at: new Date(now()).toISOString(), rating }];
      word.mastered = rating === 'remembered';
      store.saveWord(word);
    }
    res.json({ word });
  });
  app.delete('/api/words/:id', (req, res) => {
    if (!store.getWord(req.params.id)) fail(404, '单词不存在');
    store.deleteWord(req.params.id);
    res.status(204).end();
  });

  app.use('/api', (_req, _res) => fail(404, '接口不存在'));
  const dist = staticDir;
  if (existsSync(dist)) {
    app.use(express.static(dist, staticOptions));
    app.get('/{*path}', (_req, res) =>
      res.sendFile(resolve(dist, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }),
    );
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: '数据格式不正确',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'JSON 格式不正确' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: '文件过大，最大支持 5 MB' });
    if (!error.status) console.error(error);
    res
      .status(error.status || 500)
      .json({ error: error.status ? error.message : '服务暂时不可用，请稍后重试' });
  });
  return {
    app,
    store,
    close: async () => {
      await library.close();
      await ai.close();
      if (!storeOverride) store.close();
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const accessPath = process.env.SHICI_ACCESS_FILE || resolve(ROOT, 'data/public-access.json');
  const access =
    process.env.SHICI_ACCESS_FILE || existsSync(accessPath)
      ? JSON.parse(readFileSync(accessPath, 'utf8'))
      : undefined;
  const { app, close } = createApp({ access });
  const port = Number(process.env.PORT || 3001);
  const server = app.listen(port, '127.0.0.1', () =>
    console.log(`CET-6 learning server: http://127.0.0.1:${port}`),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () =>
      server.close(async () => {
        await close();
        process.exit(0);
      }),
    );
}
