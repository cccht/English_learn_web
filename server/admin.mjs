import express from 'express';
import { z } from 'zod';
import { normalizeConfig } from './ai.mjs';

export function createAccountRoutes(accounts) {
  const router = express.Router();
  router.use(['/account', '/admin'], express.json({ limit: '8kb' }));
  router.get('/account', (req, res) => res.json({ user: req.user }));
  router.patch('/account/password', async (req, res) => {
    const input = z
      .object({ currentPassword: z.string().max(128), newPassword: z.string().max(128) })
      .strict()
      .parse(req.body);
    await accounts.changePassword(req.user.id, input.currentPassword, input.newPassword);
    res.clearCookie('shici_session', { path: '/' }).json({ ok: true });
  });
  router.use('/admin', (req, res, next) => {
    if (req.user?.role !== 'admin')
      return res.status(403).json({ error: '仅管理员可以访问管理后台。' });
    next();
  });
  router.get('/admin/settings', (_req, res) =>
    res.json({
      registrationEnabled: accounts.registrationEnabled(),
      users: accounts.listUsers(),
      memberAiBaseUrl: accounts.memberAiBaseUrl(),
    }),
  );
  router.patch('/admin/registration', (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(req.body);
    accounts.setRegistration(enabled);
    res.json({ registrationEnabled: accounts.registrationEnabled() });
  });
  router.patch('/admin/users/:id/status', (req, res) => {
    const { active } = z.object({ active: z.boolean() }).strict().parse(req.body);
    res.json({ user: accounts.setActive(req.params.id, active) });
  });
  router.patch('/admin/ai-provider', (req, res) => {
    const { baseUrl } = z.object({ baseUrl: z.string() }).strict().parse(req.body);
    const config = normalizeConfig({
      provider: 'openai-compatible',
      baseUrl,
      model: '',
      apiKey: '',
      timeoutSeconds: 90,
    });
    accounts.setMemberAiBaseUrl(config.baseUrl);
    res.json({ memberAiBaseUrl: config.baseUrl });
  });
  return router;
}
