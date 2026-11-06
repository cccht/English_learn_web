import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';

const scrypt = promisify(scryptCallback);
const HASH_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, '账号至少需要 3 位')
  .max(32, '账号不能超过 32 位')
  .regex(/^[a-z0-9][a-z0-9_.-]*$/, '账号需为 3 至 32 位字母、数字或 _ . -');
export const passwordSchema = z
  .string()
  .min(10, '密码至少需要 10 位')
  .max(128, '密码不能超过 128 位');
const registrationSchema = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(1, '请填写称呼').max(40, '称呼不能超过 40 位'),
    password: passwordSchema,
  })
  .strict();
const failure = (status, message) => Object.assign(new Error(message), { status });
export const publicUser = (user) =>
  user
    ? {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        active: Boolean(user.active),
        createdAt: user.created_at,
      }
    : null;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, HASH_OPTIONS);
  return `scrypt:32768:8:3:${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const parts = stored?.split(':');
  if (!parts || parts.length !== 6 || parts.slice(0, 4).join(':') !== 'scrypt:32768:8:3')
    return false;
  const expected = Buffer.from(parts[5], 'hex');
  if (expected.length !== 64 || !/^[a-f0-9]{32}$/.test(parts[4])) return false;
  const actual = await scrypt(password, parts[4], 64, HASH_OPTIONS);
  return timingSafeEqual(actual, expected);
}

export function createAccounts({ db, bootstrapPassword, now = () => Date.now() }) {
  if (
    typeof bootstrapPassword !== 'string' ||
    bootstrapPassword.length < 16 ||
    bootstrapPassword.length > 128
  )
    throw new Error('管理员初始化需要有效的访问密码。');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      active INTEGER NOT NULL DEFAULT 1, session_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO auth_settings (key, value) VALUES ('registration_enabled', 'true');
  `);
  const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const findUser = (username) =>
    db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
  const ready = (async () => {
    if (db.prepare('SELECT count(*) AS count FROM users').get().count === 0) {
      const hash = await hashPassword(bootstrapPassword);
      db.prepare(
        "INSERT OR IGNORE INTO users (id, username, display_name, password_hash, role, created_at) VALUES ('admin', 'admin', '管理员', ?, 'admin', ?)",
      ).run(hash, new Date(now()).toISOString());
    }
    if (!db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").get())
      throw new Error('没有可用的管理员账号，请从本机恢复管理员。');
  })();
  ready.catch(() => {});
  const registrationEnabled = () =>
    db.prepare("SELECT value FROM auth_settings WHERE key = 'registration_enabled'").get()
      ?.value === 'true';
  return {
    ready,
    getUser,
    findUser,
    registrationEnabled,
    memberAiBaseUrl: () =>
      db.prepare("SELECT value FROM auth_settings WHERE key = 'member_ai_base_url'").get()?.value ||
      'https://api.openai.com/v1',
    setMemberAiBaseUrl: (value) =>
      db
        .prepare(
          "INSERT INTO auth_settings (key, value) VALUES ('member_ai_base_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(value),
    async authenticate(username, password) {
      await ready;
      const user = findUser(typeof username === 'string' ? username.trim().toLowerCase() : '');
      const fallback = getUser('admin').password_hash;
      const valid = await verifyPassword(
        typeof password === 'string' && password.length <= 128 ? password : '',
        user?.password_hash || fallback,
      );
      return valid && user?.active ? user : null;
    },
    async register(input) {
      await ready;
      if (!registrationEnabled()) throw failure(403, '管理员已关闭注册，已有账号仍可登录。');
      const values = registrationSchema.parse(input);
      if (findUser(values.username)) throw failure(409, '这个账号已被使用，请换一个。');
      const hash = await hashPassword(values.password);
      if (!registrationEnabled()) throw failure(403, '管理员已关闭注册，已有账号仍可登录。');
      const id = randomUUID();
      try {
        db.prepare(
          "INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'user', ?)",
        ).run(id, values.username, values.displayName, hash, new Date(now()).toISOString());
      } catch (error) {
        if (findUser(values.username)) throw failure(409, '这个账号已被使用，请换一个。');
        throw error;
      }
      return getUser(id);
    },
    setRegistration(enabled) {
      db.prepare("UPDATE auth_settings SET value = ? WHERE key = 'registration_enabled'").run(
        JSON.stringify(enabled),
      );
    },
    listUsers() {
      return db.prepare('SELECT * FROM users ORDER BY created_at, id').all().map(publicUser);
    },
    setActive(id, active) {
      const user = getUser(id);
      if (!user) throw failure(404, '账号不存在');
      if (user.role === 'admin') throw failure(400, '不能停用管理员账号');
      db.prepare(
        'UPDATE users SET active = ?, session_version = session_version + 1 WHERE id = ?',
      ).run(Number(active), id);
      return publicUser(getUser(id));
    },
    async changePassword(id, currentPassword, newPassword) {
      passwordSchema.parse(newPassword);
      const user = getUser(id);
      if (
        typeof currentPassword !== 'string' ||
        currentPassword.length > 128 ||
        !user ||
        !(await verifyPassword(currentPassword, user.password_hash))
      )
        throw failure(400, '当前密码不正确');
      const hash = await hashPassword(newPassword);
      db.prepare(
        'UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
      ).run(hash, id);
    },
  };
}
