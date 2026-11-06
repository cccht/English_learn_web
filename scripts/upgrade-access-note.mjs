import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(resolve(root, 'data/public-access.json'), 'utf8'));
const path = resolve(root, 'data/public-access.txt');
const backup = resolve(root, 'data/backups/public-access-before-accounts.txt');
if (existsSync(path) && !existsSync(backup)) copyFileSync(path, backup);
let note = existsSync(path)
  ? readFileSync(path, 'utf8')
  : `拾词公网访问\n\n网址：${config.publicOrigin || ''}\n`;
note = note.replace(/^访问密码：.*$/m, `初始管理员密码：${config.password}`);
if (!note.includes('管理员账号：')) note += '\n管理员账号：admin\n';
if (!note.includes('初始管理员密码：')) note += `初始管理员密码：${config.password}\n`;
note = note.replace(
  '修改密码后需要重启 shici-web 服务；如需退出所有会话，同时更换 public-access.json 的 sessionSecret。',
  '登录后可用右上角“修改密码”更新密码，无需重启；这里的初始密码仅用于首次创建管理员。',
);
if (!note.includes('原有学习记录'))
  note +=
    '\n原有学习记录已归管理员账号；新注册账号的数据独立保存。管理员在“管理后台”控制开放注册。\n';
writeFileSync(path + '.tmp', note, { mode: 0o600 });
renameSync(path + '.tmp', path);
console.log(
  'Administrator account: admin. Private sign-in notes updated; original notes preserved.',
);
