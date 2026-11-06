import express from 'express';
import { z } from 'zod';

const point = z.tuple([
  z.number().finite().min(0).max(720),
  z.number().finite().min(0).max(200000),
  z.number().finite().min(0).max(1),
]);
const stroke = z
  .object({
    id: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
    tool: z.enum(['pen', 'highlighter']),
    color: z.enum(['#25352e', '#246b56', '#ba4d42', '#3869ab', '#e4bc3e']),
    size: z.number().finite().min(1).max(24),
    pressure: z.boolean(),
    points: z.array(point).min(1).max(5000),
  })
  .strict();
const document = z
  .object({
    baseRevision: z.number().int().min(0),
    formatVersion: z.literal(1),
    pageWidth: z.literal(720),
    strokes: z.array(stroke).max(1500),
    textNote: z.string().max(10000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.strokes.map((item) => item.id)).size !== value.strokes.length)
      ctx.addIssue({ code: 'custom', message: '笔迹编号不能重复' });
    if (value.strokes.reduce((sum, item) => sum + item.points.length, 0) > 150000)
      ctx.addIssue({ code: 'custom', message: '本篇批注已达到笔迹容量，请先导出备份' });
  });
const empty = () => ({ formatVersion: 1, pageWidth: 720, revision: 0, strokes: [], textNote: '' });

export function createAnnotationRoutes({ store, now = () => Date.now() }) {
  const router = express.Router();
  const verify = (req, res, next) => {
    const attempt = store.getAttempt(req.params.id);
    if (!attempt) return res.status(404).json({ error: '答卷不存在' });
    const paper = store.getPaper(attempt.paperId);
    const group = paper?.sections
      ?.flatMap((section) => section.groups)
      .find((item) => item.id === req.params.groupId);
    if (!group) return res.status(404).json({ error: '题组不存在' });
    next();
  };
  router.get('/attempts/:id/annotations/:groupId', verify, (req, res) => {
    res.json({ annotation: store.getAnnotation(req.params.id, req.params.groupId) || empty() });
  });
  router.put('/attempts/:id/annotations/:groupId', verify, (req, res) => {
    const { baseRevision, ...input } = document.parse(req.body);
    const annotation = store.saveAnnotation(
      req.params.id,
      req.params.groupId,
      input,
      baseRevision,
      new Date(now()).toISOString(),
    );
    if (!annotation)
      return res.status(409).json({
        error: '批注已在另一页面或设备更新，本机草稿仍可保留。',
        annotation: store.getAnnotation(req.params.id, req.params.groupId) || empty(),
      });
    res.json({ annotation });
  });
  return router;
}
