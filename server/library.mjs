import express from 'express';
import { z } from 'zod';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import {
  extractPdf,
  renderPdfPage,
  validatePdfBytes,
  PDF_LIMITS,
  pdfEngineAvailable,
} from './pdf-engine.mjs';
import { parsePdfQuestions } from './pdf-parser.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const activeStatuses = new Set(['queued', 'extracting', 'ocr']);
const ids = z
  .array(z.string().min(1).max(120))
  .min(1)
  .max(100, '一次最多选择 100 份试卷')
  .refine((value) => new Set(value).size === value.length, '不能重复选择试卷');
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/, '分享码格式不正确');
const previewLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.libraryPreviewBucket,
  handler: (_req, res) => res.status(429).json({ error: '预览请求过于频繁，请稍后再试。' }),
});
const documentInfo = (document) => ({
  id: document.id,
  filename: document.filename,
  pages: document.pages,
  size: document.bytes.length,
  sha256: document.sha256,
});
const summary = (job) => {
  const { pages, draft, ...value } = job;
  return value;
};

export function createLibraryService({
  store,
  now = () => Date.now(),
  parsePaper,
  metadata,
  authenticatedUser,
  extract = extractPdf,
  render = renderPdfPage,
}) {
  const router = express.Router(),
    active = new Map();
  let closed = false;
  const previewBucket = randomUUID();
  const timestamp = () => new Date(now()).toISOString();
  const save = (job) => {
    store.savePdfImport({ ...job, updatedAt: timestamp() });
  };
  const requireJob = (id) => {
    const job = store.getPdfImport(id);
    if (!job) fail(404, 'PDF 导入记录不存在');
    return job;
  };
  const requireDocument = (id) => {
    const document = store.getPdfDocument(id);
    if (!document) fail(404, 'PDF 文件不存在');
    return document;
  };
  const quota = (size) => {
    if (store.pdfStorageBytes() + size > PDF_LIMITS.storage || store.pdfDocumentCount() >= 200)
      fail(413, '个人 PDF 存储上限为 200 MB、200 个文件。');
  };
  const memberExists = Boolean(
    store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get(),
  );
  const availableShare = (token) => {
    const share = store.resolveShare(hash(tokenSchema.parse(token)));
    if (!share || share.revokedAt || (share.expiresAt && Date.parse(share.expiresAt) <= now()))
      fail(410, '分享不存在、已到期或已被撤销。');
    if (
      memberExists &&
      !store.db.prepare('SELECT active FROM users WHERE id = ?').get(share.ownerId)?.active
    )
      fail(410, '该分享当前不可用。');
    return share;
  };
  const shareSummary = (share) => ({
    id: share.id,
    title: share.title,
    token: share.token,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    revokedAt: share.revokedAt,
    paperCount: share.paperCount ?? share.papers.length,
  });
  const draftStats = (paper) => {
    const all = paper.sections.flatMap((section) =>
      section.groups.flatMap((group) => group.questions),
    );
    const manual = all.filter(
      (question) => question.type === 'text' || question.grading === 'manual',
    ).length;
    return { questionCount: all.length, manualGraded: manual, autoGraded: all.length - manual };
  };

  for (const job of store.listPdfImports()) {
    if (activeStatuses.has(job.status))
      save({
        ...store.getPdfImport(job.id),
        status: 'failed',
        error: '上次转换已中断，原 PDF 已保留，可重新识别。',
      });
  }

  function run(job) {
    if (closed) fail(503, 'PDF 服务正在关闭，请稍后重试。');
    if (active.size) fail(409, '已有一份 PDF 正在转换，请等待完成或取消。');
    const controller = new AbortController();
    const pending = { controller, promise: null };
    active.set(job.id, pending);
    save({ ...job, status: 'queued', error: '', currentPage: 0, importedPaperId: undefined });
    pending.promise = (async () => {
      const timer = setTimeout(() => controller.abort(), 8 * 60 * 1000);
      try {
        const document = requireDocument(job.documentId);
        const result = await extract(Buffer.from(document.bytes), {
          signal: controller.signal,
          progress: (progress) => {
            if (controller.signal.aborted || closed) return;
            if (progress.pageCount) store.setPdfPages(document.id, progress.pageCount);
            save({ ...requireJob(job.id), ...progress });
          },
        });
        if (controller.signal.aborted || closed) throw new Error('aborted');
        store.setPdfPages(document.id, result.pageCount);
        const parsed = parsePdfQuestions(result.pages, {
          id: 'pdf-' + randomUUID(),
          filename: document.filename,
          now: now(),
        });
        const warnings = [...parsed.warnings];
        if (result.ocrPages)
          warnings.unshift(`${result.ocrPages} 页经过 OCR，题号、字母和标点需要核对。`);
        const empty = result.pages.filter((page) => !page.text.trim()).length;
        if (empty) warnings.unshift(`${empty} 页未提取到文字，请查看原 PDF 补充内容。`);
        save({
          ...requireJob(job.id),
          status: 'ready',
          document: documentInfo(requireDocument(document.id)),
          pages: result.pages,
          ocrPages: result.ocrPages,
          draft: parsed.draft,
          stats: parsed.stats,
          warnings,
          revision: (job.revision || 0) + 1,
          completedAt: timestamp(),
        });
      } catch (error) {
        const current = store.getPdfImport(job.id);
        if (current)
          save({
            ...current,
            status: controller.signal.aborted && !closed ? 'cancelled' : 'failed',
            error: closed
              ? '转换已中断，原 PDF 已保留。'
              : controller.signal.aborted
                ? '转换已取消或超过 8 分钟，请拆分文件后重试。'
                : error.status
                  ? error.message
                  : 'PDF 转换失败，原文件已保留，可重试或联系管理员。',
          });
      } finally {
        clearTimeout(timer);
        active.delete(job.id);
      }
    })();
  }

  router.get('/library/capabilities', (_req, res) =>
    res.json({
      pdf: pdfEngineAvailable(),
      maxBytes: PDF_LIMITS.bytes,
      maxPages: PDF_LIMITS.pages,
      maxOcrPages: PDF_LIMITS.ocrPages,
      usedBytes: store.pdfStorageBytes(),
      storageBytes: PDF_LIMITS.storage,
    }),
  );
  router.get('/pdf-imports', (_req, res) =>
    res.json({ jobs: store.listPdfImports().slice(0, 100).map(summary) }),
  );
  router.post(
    '/pdf-imports',
    express.raw({ type: 'application/pdf', limit: '20mb' }),
    (req, res) => {
      validatePdfBytes(req.body);
      if (active.size) fail(409, '已有一份 PDF 正在转换，请等待完成或取消。');
      if (!pdfEngineAvailable() && extract === extractPdf)
        fail(503, '服务器尚未安装 PDF/OCR 隔离处理组件，请联系管理员。');
      let filename;
      try {
        filename = decodeURIComponent(req.get('x-filename') || '试卷.pdf')
          .split(/[\\/]/)
          .at(-1);
      } catch {
        fail(400, '文件名编码不正确');
      }
      filename = filename.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || '试卷.pdf';
      if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
      const digest = hash(req.body);
      let document = store.findPdfDocument(digest);
      const jobs = store.listPdfImports();
      const previous =
        document &&
        jobs.find(
          (job) => job.documentId === document.id && ['ready', 'imported'].includes(job.status),
        );
      if (previous) return res.json({ job: requireJob(previous.id), reused: true });
      if (jobs.length >= 200) fail(429, '最多保留 200 份 PDF 导入记录。');
      if (!document) {
        quota(req.body.length);
        store.addPdfDocument({
          id: randomUUID(),
          sha256: digest,
          filename,
          bytes: req.body,
          createdAt: timestamp(),
        });
        document = store.findPdfDocument(digest);
      }
      const job = {
        id: randomUUID(),
        documentId: document.id,
        filename: document.filename,
        document: documentInfo(document),
        status: 'queued',
        createdAt: timestamp(),
        revision: 0,
        warnings: [],
      };
      run(job);
      res.status(202).json({ job: requireJob(job.id) });
    },
  );
  router.get('/pdf-imports/:id', (req, res) => res.json({ job: requireJob(req.params.id) }));
  router.post('/pdf-imports/:id/retry', (req, res) => {
    const job = requireJob(req.params.id);
    if (!['failed', 'cancelled'].includes(job.status)) fail(409, '只能重新识别失败或取消的导入。');
    run(job);
    res.status(202).json({ job: requireJob(job.id) });
  });
  router.post('/pdf-imports/:id/cancel', async (req, res) => {
    const job = requireJob(req.params.id),
      pending = active.get(job.id);
    if (!pending) fail(409, '该导入已不在转换中。');
    pending.controller.abort();
    await pending.promise;
    res.json({ job: requireJob(job.id) });
  });
  router.put('/pdf-imports/:id/draft', (req, res) => {
    const job = requireJob(req.params.id);
    if (job.status !== 'ready') fail(409, '只有待校对的导入可以修改。');
    const input = z
      .object({ draft: z.unknown(), revision: z.number().int().nonnegative() })
      .strict()
      .parse(req.body);
    if (input.revision !== job.revision) fail(409, '该草稿已更新，请重新打开后再保存。');
    const draft = parsePaper(input.draft);
    draft.id = job.draft.id;
    const next = { ...job, draft, stats: draftStats(draft), revision: job.revision + 1 };
    save(next);
    res.json({ job: requireJob(job.id) });
  });
  router.post('/pdf-imports/:id/commit', (req, res) => {
    const job = requireJob(req.params.id);
    if (job.status === 'imported')
      return res.json({ paper: metadata(store.getOwnedPaper(job.importedPaperId)), reused: true });
    if (job.status !== 'ready') fail(409, '请先等待识别完成。');
    const input = z
      .object({
        draft: z.unknown(),
        revision: z.number().int().nonnegative(),
        reviewed: z.literal(true),
      })
      .strict()
      .parse(req.body);
    if (input.revision !== job.revision) fail(409, '草稿已更新，请重新打开后确认。');
    const paper = parsePaper(input.draft);
    paper.id = job.draft.id;
    paper.available = true;
    if (!paper.sections?.length) fail(400, '请至少添加一道题目。');
    if (
      paper.sections.some((section) =>
        section.groups.some((group) => group.questions.some((question) => !question.prompt.trim())),
      )
    )
      fail(400, '请补充空白题干后再入库。');
    if (store.getPaper(paper.id)) fail(409, '此试卷已存在，未覆盖原数据。');
    paper.document = documentInfo(requireDocument(job.documentId));
    paper.importedAt = timestamp();
    store.transaction(() => {
      store.addPaper(paper);
      save({
        ...job,
        draft: paper,
        stats: draftStats(paper),
        status: 'imported',
        importedPaperId: paper.id,
        revision: job.revision + 1,
      });
    });
    res.status(201).json({ paper: metadata(paper) });
  });
  router.get('/pdf-documents/:id', (req, res) => {
    const document = requireDocument(req.params.id);
    res.set('Content-Security-Policy', "sandbox; default-src 'none'");
    res.attachment(document.filename).type('application/pdf').send(Buffer.from(document.bytes));
  });
  router.get(
    '/pdf-documents/:id/pages/:page',
    (req, _res, next) => {
      req.libraryPreviewBucket = previewBucket;
      next();
    },
    previewLimit,
    async (req, res) => {
      const document = requireDocument(req.params.id);
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(document.pages || 1)
        .parse(req.params.page);
      const controller = new AbortController();
      const cancel = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', cancel);
      try {
        const image = await render(Buffer.from(document.bytes), page, {
          signal: controller.signal,
        });
        res.set('Cache-Control', 'no-store').type('image/png').send(image);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        res.off('close', cancel);
      }
    },
  );

  router.get('/shares', (_req, res) => res.json({ shares: store.listShares().map(shareSummary) }));
  router.post('/shares', (req, res) => {
    const input = z
      .object({
        paperIds: ids,
        title: z.string().trim().min(1).max(120),
        expiresDays: z.union([z.literal(7), z.literal(30), z.literal(0)]).default(30),
        rightsConfirmed: z.literal(true),
      })
      .strict()
      .parse(req.body);
    if (store.listShares().length >= 200) fail(429, '最多保留 200 条分享记录。');
    if (
      store
        .listShares()
        .filter(
          (share) => !share.revokedAt && (!share.expiresAt || Date.parse(share.expiresAt) > now()),
        ).length >= 100
    )
      fail(429, '最多保留 100 个有效分享，请先撤销不需要的分享。');
    let totalSize = 0;
    const papers = input.paperIds.map((id) => {
      const original = store.getOwnedPaper(id);
      if (!original?.available || !original.document) fail(400, '仅能分享自己已入库的 PDF 试卷。');
      const document = requireDocument(original.document.id);
      const paper = parsePaper(original);
      totalSize += Buffer.byteLength(JSON.stringify(paper));
      if (totalSize > 8 * 1024 * 1024) fail(413, '选中的题目内容过多，请分批分享。');
      return {
        id: randomUUID(),
        originalId: original.id,
        paper,
        documentId: document.id,
        document: documentInfo(document),
      };
    });
    const share = {
      id: randomUUID(),
      title: input.title,
      token: randomBytes(24).toString('base64url'),
      author: authenticatedUser?.displayName || '分享者',
      createdAt: timestamp(),
      expiresAt: input.expiresDays
        ? new Date(now() + input.expiresDays * 86400000).toISOString()
        : null,
      revokedAt: null,
      papers,
    };
    if (Buffer.byteLength(JSON.stringify(share)) > 8 * 1024 * 1024)
      fail(413, '选中的题目内容过多，请分批分享。');
    store.addShare(share, hash(share.token));
    res.status(201).json({ share: shareSummary(share) });
  });
  router.delete('/shares/:id', (req, res) => {
    const share = store.getShare(req.params.id);
    if (!share) fail(404, '分享不存在');
    store.saveShare({ ...share, revokedAt: share.revokedAt || timestamp() });
    res.json({ ok: true });
  });
  router.post('/shares/resolve', (req, res) => {
    const input = z.object({ token: tokenSchema }).strict().parse(req.body),
      share = availableShare(input.token);
    res.json({
      share: {
        id: share.id,
        title: share.title,
        author: share.author,
        createdAt: share.createdAt,
        expiresAt: share.expiresAt,
        papers: share.papers.map((item) => ({
          id: item.id,
          title: item.paper.title,
          questionCount: metadata(item.paper).questionCount,
          document: {
            filename: item.document.filename,
            size: item.document.size,
            pages: item.document.pages,
          },
          imported:
            Boolean(store.getShareImport(share.id, item.id)) ||
            (share.ownerId === store.ownerId && Boolean(store.getOwnedPaper(item.originalId))),
        })),
      },
    });
  });
  router.post('/shares/import', (req, res) => {
    const input = z.object({ token: tokenSchema, paperIds: ids }).strict().parse(req.body),
      share = availableShare(input.token);
    const selected = input.paperIds.map((id) => {
      const item = share.papers.find((item) => item.id === id);
      if (!item) fail(400, '所选题目不属于这个分享。');
      return item;
    });
    const imported = [],
      existing = [];
    store.transaction(() => {
      for (const item of selected) {
        const priorId =
          store.getShareImport(share.id, item.id) ||
          (share.ownerId === store.ownerId ? item.originalId : null);
        const prior = priorId && store.getOwnedPaper(priorId);
        if (prior) {
          existing.push(metadata(prior));
          continue;
        }
        const source = store.forUser(share.ownerId).getPdfDocument(item.documentId);
        if (!source) fail(410, '分享中的原 PDF 不可用，未导入任何新试卷。');
        let document = store.findPdfDocument(source.sha256);
        if (!document) {
          quota(source.bytes.length);
          const id = randomUUID();
          store.addPdfDocument({
            id,
            sha256: source.sha256,
            filename: source.filename,
            pages: source.pages,
            bytes: source.bytes,
            createdAt: timestamp(),
          });
          document = store.getPdfDocument(id);
        }
        const paper = parsePaper(item.paper);
        paper.id = 'shared-' + randomUUID();
        paper.document = documentInfo(document);
        paper.importedAt = timestamp();
        paper.sharedFrom = { title: share.title, author: share.author };
        store.addPaper(paper);
        store.saveShareImport(share.id, item.id, paper.id);
        imported.push(metadata(paper));
      }
    });
    res.status(imported.length ? 201 : 200).json({ papers: imported, existing });
  });
  router.use((error, req, res, next) => {
    if (error.type === 'entity.too.large' && req.path === '/pdf-imports')
      return res.status(413).json({ error: 'PDF 不能超过 20 MB。' });
    next(error);
  });
  return {
    router,
    close: async () => {
      closed = true;
      const tasks = [...active.values()];
      for (const task of tasks) task.controller.abort();
      await Promise.allSettled(tasks.map((task) => task.promise));
    },
  };
}
