import { spawn } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'data/public-access.json');
const notePath = resolve(root, 'data/public-access.txt');
const statusPath = resolve(root, 'data/tunnel-status.json');
if (!existsSync(configPath))
  throw new Error('Run scripts/setup-public-access.mjs before starting the tunnel.');
const atomicJson = (path, value) => {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, path);
};
let output = '';
let savedUrl = '';
const child = spawn(
  '/usr/local/bin/cloudflared',
  [
    '--no-autoupdate',
    'tunnel',
    '--url',
    'http://127.0.0.1:3001',
    '--protocol',
    'http2',
    '--edge-ip-version',
    '4',
    '--metrics',
    '127.0.0.1:20245',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
const consume = (chunk) => {
  process.stdout.write(chunk);
  output = (output + chunk.toString()).slice(-12000);
  const url = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
  if (!url || url === savedUrl) return;
  savedUrl = url;
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  atomicJson(configPath, { ...config, publicOrigin: url });
  atomicJson(statusPath, { url, mode: 'quick', startedAt: new Date().toISOString() });
  if (existsSync(notePath)) {
    let note = readFileSync(notePath, 'utf8')
      .split('\n')
      .map((line) => (line.startsWith('网址：') ? `网址：${url}` : line))
      .join('\n');
    if (!note.includes('Tunnel 重启后'))
      note += '\n这是 Cloudflare Tunnel 临时地址，Tunnel 重启后地址会变化；本文件会自动更新。\n';
    writeFileSync(notePath, note, { mode: 0o600 });
  }
  console.log(`Public URL recorded in ${statusPath}`);
};
child.stdout.on('data', consume);
child.stderr.on('data', consume);
child.on('error', () => {
  console.error('Unable to start cloudflared.');
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => child.kill(signal));
