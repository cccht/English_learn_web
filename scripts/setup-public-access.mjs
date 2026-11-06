import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = resolve(root, 'data');
const configPath = resolve(data, 'public-access.json');
const notePath = resolve(data, 'public-access.txt');
mkdirSync(data, { recursive: true, mode: 0o700 });
const config = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, 'utf8'))
  : {
      password: randomBytes(18).toString('base64url'),
      sessionSecret: randomBytes(36).toString('base64url'),
    };
if (!existsSync(configPath))
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
if (!existsSync(notePath))
  writeFileSync(
    notePath,
    `拾词公网访问\n\n网址：${config.publicOrigin || '等待临时 Tunnel 启动后自动填入'}\n管理员账号：admin\n初始管理员密码：${config.password}\n\n密码用于学习空间登录，不是 AI API Key。\n数据保存在本机 data/learning.sqlite。\n登录后可在右上角修改密码；初始密码只用于首次创建管理员。\n`,
    { flag: 'wx', mode: 0o600 },
  );
console.log(`Access credentials are ready in ${notePath}; existing credentials were preserved.`);
