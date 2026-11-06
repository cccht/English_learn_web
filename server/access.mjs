import express from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { parseCookie } from 'cookie';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { publicUser } from './accounts.mjs';
import { renderAuthPage } from './auth-view.mjs';

const COOKIE = 'shici_session';
const MAX_AGE = 7 * 24 * 60 * 60;
const localHostname = (value) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(value);

export function createAccessGate({
  password,
  sessionSecret,
  publicOrigin,
  accounts,
  now = () => Date.now(),
}) {
  if (
    typeof password !== 'string' ||
    password.length < 16 ||
    typeof sessionSecret !== 'string' ||
    sessionSecret.length < 32 ||
    !accounts
  )
    throw new Error('账号登录需要有效的管理员初始化密码、会话密钥和账号存储。');
  const allowedOrigin = publicOrigin ? new URL(publicOrigin).origin : null;
  if (allowedOrigin && new URL(allowedOrigin).protocol !== 'https:')
    throw new Error('公网入口必须使用 HTTPS。');
  const secret = new TextEncoder().encode(sessionSecret);
  const router = express.Router();
  const cookieOptions = (req) => ({
    httpOnly: true,
    secure: req.secure || !localHostname(req.hostname),
    sameSite: 'strict',
    path: '/',
  });
  const validOrigin = (req) => {
    const origin = req.get('origin');
    if (!origin) return true;
    try {
      const parsed = new URL(origin);
      if (allowedOrigin && parsed.origin === allowedOrigin) return true;
      const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
      return (
        parsed.origin === new URL(req.protocol + '://' + (forwardedHost || req.get('host'))).origin
      );
    } catch {
      return false;
    }
  };
  const originGate = (req, res, next) => {
    if (!validOrigin(req))
      return res.status(403).json({ error: '请求来源不匹配，请从网站页面操作。' });
    next();
  };
  const wantsJson = (req) =>
    req.method === 'POST' && req.get('accept')?.includes('application/json');
  const show = (res, mode, options = {}) => {
    const enabled = accounts.registrationEnabled();
    if (wantsJson(res.req))
      return res.status(options.status || 400).json({
        error:
          options.message ||
          (mode === 'register' && !enabled
            ? '管理员已关闭注册，已有账号仍可登录。'
            : '暂时无法完成操作，请重试。'),
        registrationEnabled: enabled,
      });
    return renderAuthPage(res, { mode, enabled, ...options });
  };
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (_req, res) =>
      show(res, 'login', { message: '尝试次数较多，请 15 分钟后重试。', status: 429 }),
  });
  const registerLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 6,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      show(res, 'register', { message: '注册尝试较多，请稍后再试。', status: 429 }),
  });
  const body = [
    express.urlencoded({ extended: false, limit: '8kb' }),
    express.json({ limit: '8kb' }),
  ];
  const signIn = async (user, req, res) => {
    const issued = Math.floor(now() / 1000);
    const token = await new SignJWT({ ver: user.session_version })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('shici-accounts')
      .setAudience('shici-web')
      .setIssuedAt(issued)
      .setExpirationTime(issued + MAX_AGE)
      .sign(secret);
    res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: MAX_AGE * 1000 });
    if (wantsJson(req)) return res.json({ ok: true, redirect: '/' });
    return res.redirect(303, '/');
  };
  router.use((req, res, next) => {
    if (
      /^\/(?:assets|images|fonts|videos)\//.test(req.path) ||
      [
        '/auth.css',
        '/auth.js',
        '/home-static.css',
        '/home-scroll.css',
        '/home-3d.css',
        '/scrub-engine.js',
        '/illustrations.css',
        '/favicon.ico',
      ].includes(req.path)
    )
      return next('router');
    res.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    });
    next();
  });
  router.use(async (_req, _res, next) => {
    await accounts.ready;
    next();
  });
  router.get('/login', (_req, res) => show(res, 'login'));
  router.get('/register', (_req, res) => show(res, 'register'));
  router.post('/login', originGate, loginLimit, ...body, async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (username.length > 32 || password.length > 128)
      return show(res, 'login', { message: '账号或密码不正确。', status: 401 });
    const user = await accounts.authenticate(username, password);
    if (!user)
      return show(res, 'login', {
        message: '账号或密码不正确，或账号已停用。',
        values: { username },
        status: 401,
      });
    await signIn(user, req, res);
  });
  router.post('/register', originGate, registerLimit, ...body, async (req, res) => {
    try {
      if (!accounts.registrationEnabled()) return show(res, 'register', { status: 403 });
      const values = z
        .object({
          username: z.string(),
          displayName: z.string(),
          password: z.string(),
          passwordConfirm: z.string(),
        })
        .strict()
        .parse(req.body);
      if (values.password !== values.passwordConfirm)
        throw Object.assign(new Error('两次输入的密码不一致。'), { status: 400 });
      const user = await accounts.register({
        username: values.username,
        displayName: values.displayName,
        password: values.password,
      });
      await signIn(user, req, res);
    } catch (error) {
      show(res, 'register', {
        status: error instanceof z.ZodError ? 400 : error.status || 500,
        message:
          error instanceof z.ZodError
            ? error.issues[0].message
            : error.status
              ? error.message
              : '暂时无法创建账号，请稍后重试。',
        values: { username: req.body?.username, displayName: req.body?.displayName },
      });
    }
  });
  router.all(['/login', '/register'], (_req, res) =>
    res.status(405).set('Allow', 'GET, POST').end(),
  );
  router.post('/logout', originGate, (req, res) =>
    res.clearCookie(COOKIE, cookieOptions(req)).redirect(303, '/login'),
  );
  router.use(async (req, res, next) => {
    try {
      const token = parseCookie(req.headers.cookie || '')[COOKIE];
      if (typeof token === 'string' && token.length <= 2048) {
        const { payload } = await jwtVerify(token, secret, {
          algorithms: ['HS256'],
          issuer: 'shici-accounts',
          audience: 'shici-web',
          currentDate: new Date(now()),
          maxTokenAge: MAX_AGE,
        });
        const user = typeof payload.sub === 'string' ? accounts.getUser(payload.sub) : null;
        if (user?.active && payload.ver === user.session_version) req.user = publicUser(user);
      }
    } catch {
      /* Expired, disabled and old shared-password sessions must sign in again. */
    }
    if (!req.user) {
      if (req.path === '/api' || req.path.startsWith('/api/'))
        return res.status(401).json({ error: '请先登录学习空间', code: 'AUTH_REQUIRED' });
      if (req.path === '/' && ['GET', 'HEAD'].includes(req.method))
        return renderAuthPage(res, { mode: 'home', enabled: accounts.registrationEnabled() });
      return res.redirect(302, '/login');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !validOrigin(req))
      return res.status(403).json({ error: '请求来源不匹配，请从网站页面操作。' });
    next();
  });
  return router;
}
