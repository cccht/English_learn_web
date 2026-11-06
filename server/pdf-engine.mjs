import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { constants, existsSync } from 'node:fs';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execute = promisify(execFile);
export const PDF_LIMITS = {
  bytes: 20 * 1024 * 1024,
  pages: 80,
  ocrPages: 40,
  text: 600000,
  storage: 200 * 1024 * 1024,
};
const programs = ['bwrap', 'prlimit', 'pdfinfo', 'pdftotext', 'pdftoppm', 'tesseract'];
export const pdfEngineAvailable = () => programs.every((name) => existsSync('/usr/bin/' + name));
const aborted = () => Object.assign(new Error('PDF 转换已取消'), { name: 'AbortError' });
let active = 0;
const queue = [];

async function slot(signal) {
  if (signal?.aborted) throw aborted();
  if (active < 2) {
    active++;
    return;
  }
  if (queue.length >= 24)
    throw Object.assign(new Error('PDF 转换队列已满，请稍后重试。'), { status: 429 });
  await new Promise((resolve, reject) => {
    const entry = {
      resolve: () => {
        signal?.removeEventListener('abort', cancel);
        resolve();
      },
    };
    const cancel = () => {
      const index = queue.indexOf(entry);
      if (index >= 0) queue.splice(index, 1);
      reject(aborted());
    };
    signal?.addEventListener('abort', cancel, { once: true });
    queue.push(entry);
  });
}
function release() {
  const next = queue.shift();
  if (next) next.resolve();
  else active--;
}

export function pdfSandboxArguments(directory, program, args) {
  return [
    '--as=1073741824',
    '--cpu=45',
    '--fsize=67108864',
    '--nofile=128',
    '--',
    '/usr/bin/bwrap',
    '--unshare-all',
    '--die-with-parent',
    '--new-session',
    '--cap-drop',
    'ALL',
    '--ro-bind',
    '/usr',
    '/usr',
    '--ro-bind',
    '/lib',
    '/lib',
    '--ro-bind',
    '/lib64',
    '/lib64',
    '--ro-bind-try',
    '/etc/fonts',
    '/etc/fonts',
    '--ro-bind-try',
    '/var/cache/fontconfig',
    '/var/cache/fontconfig',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/tmp',
    '--bind',
    directory,
    '/work',
    '--chdir',
    '/work',
    '--clearenv',
    '--setenv',
    'PATH',
    '/usr/bin',
    '--setenv',
    'HOME',
    '/tmp',
    '--setenv',
    'LANG',
    'C.UTF-8',
    '--setenv',
    'LC_ALL',
    'C.UTF-8',
    '--setenv',
    'OMP_THREAD_LIMIT',
    '1',
    '--',
    '/usr/bin/' + program,
    ...args,
  ];
}

async function command(directory, program, args, signal, timeout = 45000) {
  if (signal?.aborted) throw aborted();
  try {
    const { stdout } = await execute(
      '/usr/bin/prlimit',
      pdfSandboxArguments(directory, program, args),
      {
        signal,
        timeout,
        killSignal: 'SIGKILL',
        maxBuffer: 4 * 1024 * 1024,
        encoding: 'utf8',
        env: { PATH: '/usr/bin', LANG: 'C.UTF-8' },
      },
    );
    return stdout;
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw aborted();
    if (error.killed || error.signal)
      throw Object.assign(new Error('PDF 处理超时或超过资源限制，请拆分文件后重试。'), {
        status: 422,
      });
    throw Object.assign(new Error('无法解析该 PDF；请确认文件完整、未加密，或尝试重新导出。'), {
      status: 422,
    });
  }
}

async function workspace(bytes, signal, work) {
  if (!pdfEngineAvailable())
    throw Object.assign(new Error('服务器尚未安装 PDF/OCR 隔离处理组件，请联系管理员。'), {
      status: 503,
    });
  await slot(signal);
  let directory;
  try {
    directory = await mkdtemp(join(tmpdir(), 'shici-pdf-'));
    await writeFile(join(directory, 'input.pdf'), bytes, { mode: 0o400 });
    return await work(directory);
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
    release();
  }
}

export function validatePdfBytes(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 16 ||
    !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))
  )
    throw Object.assign(new Error('请选择有效的 PDF 文件。'), { status: 400 });
  if (bytes.length > PDF_LIMITS.bytes)
    throw Object.assign(new Error('PDF 不能超过 20 MB。'), { status: 413 });
}

export async function extractPdf(bytes, { signal, progress = () => {} } = {}) {
  validatePdfBytes(bytes);
  return workspace(bytes, signal, async (directory) => {
    const info = await command(directory, 'pdfinfo', ['input.pdf'], signal, 15000);
    if (/^Encrypted:\s+yes/im.test(info))
      throw Object.assign(new Error('暂不支持加密 PDF，请使用有权访问的未加密文件。'), {
        status: 422,
      });
    const count = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (!Number.isInteger(count) || count < 1 || count > PDF_LIMITS.pages)
      throw Object.assign(new Error(`PDF 需包含 1 至 ${PDF_LIMITS.pages} 页，请拆分过长文件。`), {
        status: 422,
      });
    progress({ status: 'extracting', pageCount: count, currentPage: 0 });
    const text = await command(
      directory,
      'pdftotext',
      ['-enc', 'UTF-8', '-eol', 'unix', 'input.pdf', '-'],
      signal,
      30000,
    );
    const chunks = text.split('\f');
    const pages = [];
    let ocrCount = 0,
      length = 0;
    for (let index = 0; index < count; index++) {
      let value = (chunks[index] || '').trim(),
        method = 'text';
      const content = value.replace(/\s/g, '');
      if (content.length < 40 || (value.match(/\ufffd/g) || []).length > content.length / 10) {
        if (++ocrCount > PDF_LIMITS.ocrPages)
          throw Object.assign(new Error('扫描页超过 40 页，请拆分后再识别。'), { status: 422 });
        method = 'ocr';
        progress({ status: 'ocr', pageCount: count, currentPage: index + 1 });
        await command(
          directory,
          'pdftoppm',
          [
            '-f',
            String(index + 1),
            '-l',
            String(index + 1),
            '-singlefile',
            '-scale-to',
            '2200',
            '-gray',
            '-png',
            'input.pdf',
            'page',
          ],
          signal,
        );
        value = (
          await command(
            directory,
            'tesseract',
            ['page.png', 'stdout', '-l', 'eng+chi_sim', '--psm', '3'],
            signal,
          )
        ).trim();
        await rm(join(directory, 'page.png'), { force: true });
      }
      length += value.length;
      if (length > PDF_LIMITS.text)
        throw Object.assign(new Error('提取文字超过 60 万字符，请拆分 PDF。'), { status: 422 });
      pages.push({ number: index + 1, text: value, method });
      progress({
        status: method === 'ocr' ? 'ocr' : 'extracting',
        pageCount: count,
        currentPage: index + 1,
      });
    }
    return { pages, pageCount: count, ocrPages: ocrCount };
  });
}

export async function renderPdfPage(bytes, page, { signal } = {}) {
  validatePdfBytes(bytes);
  return workspace(bytes, signal, async (directory) => {
    await command(
      directory,
      'pdftoppm',
      [
        '-f',
        String(page),
        '-l',
        String(page),
        '-singlefile',
        '-scale-to',
        '1600',
        '-png',
        'input.pdf',
        'preview',
      ],
      signal,
      30000,
    );
    return readPdfPreview(join(directory, 'preview.png'));
  });
}

export async function readPdfPreview(path) {
  // Never follow a sandbox-created symlink when reading an output on the host.
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 8 || stat.size > 16 * 1024 * 1024)
      throw Object.assign(new Error('PDF 预览输出无效或过大。'), { status: 422 });
    const buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (
      offset !== buffer.length ||
      !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw Object.assign(new Error('PDF 预览输出格式不正确。'), { status: 422 });
    return buffer;
  } finally {
    await handle.close();
  }
}
