import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { api, dateLabel, patch } from './api';
import { PageHeading, Skeleton } from './components';
import type { User } from './types';
import './admin.css';

type Settings = { registrationEnabled: boolean; users: User[]; memberAiBaseUrl: string };
export default function Admin({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [aiUrl, setAiUrl] = useState('');
  const load = async () => {
    try {
      const value = await api<Settings>('/admin/settings');
      setData(value);
      setAiUrl(value.memberAiBaseUrl);
      setError('');
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  async function registration(enabled: boolean) {
    setBusy('registration');
    try {
      const value = await patch<{ registrationEnabled: boolean }>('/admin/registration', {
        enabled,
      });
      setData((old) => old && { ...old, registrationEnabled: value.registrationEnabled });
      notify(enabled ? '注册已开放' : '注册已关闭，已有账号仍可登录');
      setError('');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function status(user: User, active: boolean) {
    setBusy(user.id);
    try {
      await patch('/admin/users/' + user.id + '/status', { active });
      await load();
      notify(active ? '账号已恢复' : '账号已停用');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy('');
    }
  }
  if (!data && !error) return <Skeleton />;
  return (
    <>
      <PageHeading title="管理后台" subtitle="账号与注册设置" illustration="organize">
        <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => void load()}>
          <RefreshCw size={16} />
          刷新
        </button>
      </PageHeading>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <section className="admin-registration">
            <div className="admin-section-icon">
              <ShieldCheck size={25} strokeWidth={1.5} />
            </div>
            <div>
              <h2>开放新账号注册</h2>
              <p>
                {data.registrationEnabled
                  ? '任何访问者都可以创建独立学习账号。'
                  : '注册入口已关闭，已有账号仍然可以登录。'}
              </p>
            </div>
            <label className="admin-switch">
              <input
                type="checkbox"
                role="switch"
                aria-label="开放注册"
                checked={data.registrationEnabled}
                disabled={Boolean(busy)}
                onChange={(e) => void registration(e.target.checked)}
              />
              <span aria-hidden="true" />
            </label>
          </section>
          <section className="admin-ai-provider">
            <h2>学习账号的 AI 服务</h2>
            <p>普通账号使用此服务地址，模型与 API Key 按账号独立保存。</p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy('ai');
                try {
                  const result = await patch<{ memberAiBaseUrl: string }>('/admin/ai-provider', {
                    baseUrl: aiUrl,
                  });
                  setAiUrl(result.memberAiBaseUrl);
                  setError('');
                  notify('学习账号的 AI 服务地址已更新');
                } catch (reason) {
                  setError((reason as Error).message);
                } finally {
                  setBusy('');
                }
              }}
            >
              <label className="form-label" htmlFor="member-ai-url">
                服务地址 Base URL
              </label>
              <div>
                <input
                  id="member-ai-url"
                  className="text-input"
                  type="url"
                  required
                  value={aiUrl}
                  onChange={(event) => setAiUrl(event.target.value)}
                />
                <button className="btn btn-secondary" disabled={Boolean(busy)}>
                  保存地址
                </button>
              </div>
            </form>
          </section>
          <section className="admin-users">
            <div className="admin-users-heading">
              <h2>
                <Users size={18} />
                账号列表
              </h2>
              <span>{data.users.length} 个账号</span>
            </div>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>账号</th>
                    <th>角色</th>
                    <th>创建时间</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.displayName}</strong>
                        <small>{user.username}</small>
                      </td>
                      <td>
                        <span
                          className={'tag ' + (user.role === 'admin' ? 'tag-green' : 'tag-neutral')}
                        >
                          {user.role === 'admin' ? '管理员' : '学习账号'}
                        </span>
                      </td>
                      <td>{dateLabel(user.createdAt)}</td>
                      <td>
                        {user.role === 'admin' ? (
                          <span className="text-green">正常</span>
                        ) : (
                          <label className="admin-account-state">
                            <input
                              type="checkbox"
                              checked={user.active}
                              disabled={Boolean(busy)}
                              aria-label={`启用 ${user.username}`}
                              onChange={(e) => void status(user, e.target.checked)}
                            />
                            {user.active ? '正常' : '已停用'}
                          </label>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="admin-footnote">停用账号会使其登录会话失效，学习数据继续保留。</p>
          </section>
        </>
      )}
    </>
  );
}
