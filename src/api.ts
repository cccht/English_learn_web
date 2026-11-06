export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => null);
  if (response.status === 401 && body?.code === 'AUTH_REQUIRED') {
    window.location.assign('/login');
    throw new Error('请先登录学习空间');
  }
  if (!response.ok) {
    const detail = Array.isArray(body?.details)
      ? body.details
          .slice(0, 3)
          .map((item: { path: string; message: string }) => `${item.path}: ${item.message}`)
          .join('；')
      : '';
    throw new ApiError(
      `${body?.error || '请求失败，请稍后重试'}${detail ? `：${detail}` : ''}`,
      response.status,
      body,
    );
  }
  return body as T;
}
export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export function duration(seconds: number) {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
}
export function dateLabel(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
