import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Link, Loader2, Share2, Trash2 } from 'lucide-react';
import { api, post } from './api';
import { Modal } from './components';
import type { Paper } from './types';
import type { Share, SharePreview } from './library-types';
import './library.css';

export function SelectAll({
  checked,
  partial,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  partial: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
const shareUrl = (token: string) => `${window.location.origin}/#share/${token}`;
export async function copyShare(value: string, notify: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(value);
    notify('已复制');
  } catch {
    notify('剪贴板不可用，可从文本框选择并复制。');
  }
}
const expiresLabel = (share: { expiresAt: string | null; revokedAt?: string | null }) =>
  share.revokedAt
    ? '已撤销'
    : !share.expiresAt
      ? '长期有效'
      : Date.parse(share.expiresAt) <= Date.now()
        ? '已到期'
        : `${new Date(share.expiresAt).toLocaleDateString('zh-CN')} 到期`;

export function CreateShare({
  papers,
  onClose,
  onCreated,
  notify,
}: {
  papers: Paper[];
  onClose: () => void;
  onCreated: () => void;
  notify: (message: string) => void;
}) {
  const [title, setTitle] = useState(
    papers.length === 1 ? papers[0].title.slice(0, 120) : `${papers.length} 份 PDF 试卷`,
  );
  const [days, setDays] = useState(30),
    [rights, setRights] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [share, setShare] = useState<Share | null>(null);
  async function create() {
    setBusy(true);
    setError('');
    try {
      const result = await post<{ share: Share }>('/shares', {
        title,
        paperIds: papers.map((paper) => paper.id),
        expiresDays: days,
        rightsConfirmed: rights,
      });
      setShare(result.share);
      onCreated();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={share ? '分享已创建' : '分享 PDF 试卷'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {share ? (
        <div className="share-result">
          <div className="share-created">
            <Check size={22} />
            <strong>
              {share.paperCount} 份试卷 · {expiresLabel(share)}
            </strong>
          </div>
          <label>
            分享链接
            <textarea
              aria-label="分享链接"
              readOnly
              rows={3}
              value={shareUrl(share.token)}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={() => void copyShare(shareUrl(share.token), notify)}
          >
            <Copy size={16} />
            复制链接
          </button>
          <label>
            分享码
            <input readOnly value={share.token} onFocus={(event) => event.target.select()} />
          </label>
          <button className="text-button" onClick={() => void copyShare(share.token, notify)}>
            <Copy size={15} />
            复制分享码
          </button>
        </div>
      ) : (
        <div className="share-form">
          <label>
            分享名称
            <input
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            有效期
            <select
              aria-label="有效期"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={7}>7 天</option>
              <option value={30}>30 天</option>
              <option value={0}>长期有效</option>
            </select>
          </label>
          <ul className="share-paper-list">
            {papers.map((paper) => (
              <li key={paper.id}>
                <strong>{paper.title}</strong>
                <span>
                  {paper.questionCount} 题 · {paper.document?.filename}
                </span>
              </li>
            ))}
          </ul>
          <p className="share-scope">
            持有链接或分享码的已登录用户可导入试卷和原
            PDF。不会分享答卷、批注或单词本；撤销链接不会删除对方已经导入的副本。
          </p>
          <label className="library-checkbox">
            <input
              type="checkbox"
              checked={rights}
              onChange={(event) => setRights(event.target.checked)}
            />
            我有权分享所选内容，且原 PDF 不含个人隐私
          </label>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !rights || !title.trim()}
              onClick={() => void create()}
            >
              {busy ? <Loader2 className="ex-spin" size={16} /> : <Share2 size={16} />}创建分享
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function tokenFrom(value: string) {
  const input = value.trim();
  if (/^[A-Za-z0-9_-]{32}$/.test(input)) return input;
  try {
    const url = new URL(input);
    const match = url.hash.match(/^#share\/([A-Za-z0-9_-]{32})$/);
    if (match) return match[1];
  } catch {
    /* A pasted code does not need to be a URL. */
  }
  throw new Error('请输入完整分享链接或 32 位分享码。');
}

export function ImportShare({
  initialToken,
  onClose,
  onDone,
  notify,
}: {
  initialToken?: string;
  onClose: () => void;
  onDone: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [input, setInput] = useState(initialToken || ''),
    [token, setToken] = useState(''),
    [preview, setPreview] = useState<SharePreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const available = preview?.papers.filter((paper) => !paper.imported) || [];
  useEffect(() => {
    if (!initialToken) return;
    let current = true;
    setBusy(true);
    void post<{ share: SharePreview }>('/shares/resolve', { token: initialToken })
      .then((value) => {
        if (current) {
          setPreview(value.share);
          setToken(initialToken);
          setSelected(
            value.share.papers.filter((paper) => !paper.imported).map((paper) => paper.id),
          );
        }
      })
      .catch((reason) => {
        if (current) setError(reason.message);
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [initialToken]);
  async function resolve() {
    setBusy(true);
    setError('');
    setPreview(null);
    setSelected([]);
    try {
      const code = tokenFrom(input);
      const value = await post<{ share: SharePreview }>('/shares/resolve', { token: code });
      setPreview(value.share);
      setToken(code);
      setSelected(value.share.papers.filter((paper) => !paper.imported).map((paper) => paper.id));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importSelected() {
    setBusy(true);
    setError('');
    try {
      const result = await post<{ papers: Paper[]; existing: Paper[] }>('/shares/import', {
        token,
        paperIds: selected,
      });
      await onDone();
      notify(
        `已导入 ${result.papers.length} 份试卷${result.existing.length ? `，${result.existing.length} 份已存在` : ''}`,
      );
      onClose();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="导入分享试卷"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="share-import">
        <form
          className="share-code-form"
          onSubmit={(event) => {
            event.preventDefault();
            void resolve();
          }}
        >
          <label>
            分享链接或分享码
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <button className="btn btn-secondary" disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="ex-spin" size={16} /> : <Link size={16} />}查看分享
          </button>
        </form>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <>
            <div className="share-preview-heading">
              <h3>{preview.title}</h3>
              <p>
                {preview.author} · {expiresLabel(preview)}
              </p>
            </div>
            <label className="library-checkbox">
              <SelectAll
                label="全选分享试卷"
                checked={available.length > 0 && selected.length === available.length}
                partial={selected.length > 0 && selected.length < available.length}
                disabled={!available.length || busy}
                onChange={(checked) =>
                  setSelected(checked ? available.map((paper) => paper.id) : [])
                }
              />
              全选 · 已选 {selected.length} / {available.length}
            </label>
            <div className="share-receive-list">
              {preview.papers.map((paper) => (
                <label key={paper.id}>
                  <input
                    type="checkbox"
                    disabled={paper.imported || busy}
                    checked={selected.includes(paper.id)}
                    onChange={(event) =>
                      setSelected((previous) =>
                        event.target.checked
                          ? [...previous, paper.id]
                          : previous.filter((id) => id !== paper.id),
                      )
                    }
                  />
                  <span>
                    <strong>{paper.title}</strong>
                    <small>
                      {paper.questionCount} 题 · {paper.document.filename} · {paper.document.pages}{' '}
                      页
                    </small>
                  </span>
                  {paper.imported && <span className="text-green small">已在题库</span>}
                </label>
              ))}
            </div>
            <p className="share-scope">
              导入会创建自己的试卷与 PDF 副本，不覆盖现有内容。原 PDF
              由分享者提供，请确认来源后打开。
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                disabled={busy || !selected.length}
                onClick={() => void importSelected()}
              >
                {busy ? <Loader2 className="ex-spin" size={16} /> : <Download size={16} />}导入{' '}
                {selected.length} 份试卷
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function MyShares({
  refreshKey,
  notify,
}: {
  refreshKey: number;
  notify: (message: string) => void;
}) {
  const [shares, setShares] = useState<Share[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  useEffect(() => {
    let current = true;
    void api<{ shares: Share[] }>('/shares')
      .then((value) => {
        if (current) setShares(value.shares);
      })
      .catch((reason) => {
        if (current) setError(reason.message);
      });
    return () => {
      current = false;
    };
  }, [refreshKey]);
  async function revoke(share: Share) {
    if (!window.confirm('撤销后，这个链接无法继续导入。对方已导入的副本仍保留。确认撤销？')) return;
    setBusy(share.id);
    setError('');
    try {
      await api(`/shares/${share.id}`, { method: 'DELETE' });
      const value = await api<{ shares: Share[] }>('/shares');
      setShares(value.shares);
      notify('分享已撤销');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="my-shares">
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!shares.length ? (
        <p className="muted library-empty">暂无分享记录</p>
      ) : (
        shares.map((share) => (
          <div className="share-record" key={share.id}>
            <div>
              <strong>{share.title}</strong>
              <p>
                {share.paperCount} 份试卷 · {expiresLabel(share)}
              </p>
              <input
                readOnly
                aria-label={`${share.title}的分享链接`}
                value={shareUrl(share.token)}
                onFocus={(event) => event.target.select()}
              />
            </div>
            <button
              className="icon-button"
              title="复制分享链接"
              aria-label={`复制${share.title}的分享链接`}
              disabled={Boolean(share.revokedAt)}
              onClick={() => void copyShare(shareUrl(share.token), notify)}
            >
              <Copy size={17} />
            </button>
            <button
              className="icon-button danger"
              title="撤销分享"
              aria-label={`撤销${share.title}`}
              disabled={Boolean(share.revokedAt) || Boolean(busy)}
              onClick={() => void revoke(share)}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
