import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  FolderOpen,
  Menu,
  LogOut,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api, post } from './api';
import { Modal, Skeleton } from './components';
import { Illustration } from './Illustration';
import Papers from './Papers';
import Words from './Words';
import Records from './Records';
import Manage, { ImportForm } from './Manage';
import StartModal from './StartModal';
import PasswordDialog from './PasswordDialog';
import type { Attempt, Paper, Session, View, Word, Workspace } from './types';

const Exam = lazy(() => import('./Exam'));
const Insights = lazy(() => import('./Insights'));
const Admin = lazy(() => import('./Admin'));
const nav = [
  { id: 'papers' as const, name: '真题练习', icon: FileText },
  { id: 'words' as const, name: '我的单词本', icon: BookMarked },
  { id: 'mistakes' as const, name: '错题复盘', icon: RotateCcw },
  { id: 'history' as const, name: '学习记录', icon: Clock3 },
  { id: 'insights' as const, name: '学习诊断', icon: BrainCircuit },
  { id: 'manage' as const, name: '题库管理', icon: FolderOpen },
  { id: 'admin' as const, name: '管理后台', icon: ShieldCheck },
];
const emptyWorkspace: Workspace = { papers: [], attempts: [], words: [] };

export default function App() {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [view, setView] = useState<View>('papers');
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDirty, setImportDirty] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [source, setSource] = useState<Paper | null>(null);
  const [starting, setStarting] = useState<Paper | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const notify = useCallback((message: string) => setToast(message), []);
  const reload = useCallback(async () => {
    const value = await api<Workspace>('/bootstrap');
    setData(value);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let active = true;
    async function syncRoute() {
      let hash = window.location.hash.slice(1);
      try {
        const pending = sessionStorage.getItem('shici-pending-share');
        if (!hash && pending && /^[A-Za-z0-9_-]{32}$/.test(pending)) {
          hash = `share/${pending}`;
          history.replaceState(null, '', '/#' + hash);
        }
      } catch {
        /* A pasted share code also works without browser storage. */
      }
      setError('');
      setLoading(true);
      try {
        if (hash.startsWith('attempt/')) {
          const next = await api<Session>(`/attempts/${encodeURIComponent(hash.slice(8))}`);
          if (active) setSession(next);
        } else {
          if (active) {
            setSession(null);
            const shared = hash.match(/^share\/([A-Za-z0-9_-]{32})$/);
            setView(shared ? 'manage' : nav.some((n) => n.id === hash) ? (hash as View) : 'papers');
            if (shared) {
              setShareToken(shared[1]);
              try {
                sessionStorage.removeItem('shici-pending-share');
              } catch {
                /* Optional storage. */
              }
            } else setShareToken(null);
          }
        }
        const value = await api<Workspace>('/bootstrap');
        if (active) setData(value);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void syncRoute();
    window.addEventListener('hashchange', syncRoute);
    return () => {
      active = false;
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  function navigate(next: View) {
    setSidebar(false);
    window.location.hash = next;
    if (view === next && !session) void reload().catch((e) => notify(e.message));
  }
  function openAttempt(attempt: Attempt) {
    window.location.hash = `attempt/${attempt.id}`;
  }
  const addWord = useCallback(
    async (word: string, context?: string) => {
      try {
        const response = await post<{ word: Word; added: boolean }>('/words', {
          word,
          context,
          paperTitle: session?.paper.title,
          paperId: session?.paper.id,
          attemptId: session?.attempt.id,
        });
        await reload();
        notify(
          response.added ? `已收录 ${response.word.word}` : `${response.word.word} 已在单词本中`,
        );
      } catch (e) {
        notify((e as Error).message);
        throw e;
      }
    },
    [notify, reload, session?.paper.title, session?.paper.id, session?.attempt.id],
  );

  async function startExam() {
    if (!starting) return;
    setBusy(true);
    try {
      const next = await post<Session>('/attempts', { paperId: starting.id });
      setStarting(null);
      openAttempt(next.attempt);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        跳到主要内容
      </a>
      <div className="app-shell">
        {!session && (
          <>
            <aside className={`sidebar ${sidebar ? 'sidebar-open' : ''}`}>
              <button className="brand" onClick={() => navigate('papers')} aria-label="拾词首页">
                <span className="brand-mark brand-mascot">
                  <Illustration kind="writing" size="brand" priority />
                </span>
                <span>
                  <strong>拾词</strong>
                  <small>SHICI</small>
                </span>
              </button>
              <span className="sidebar-label">学习空间</span>
              <nav aria-label="主导航">
                {nav
                  .filter((item) => item.id !== 'admin' || data.user?.role === 'admin')
                  .map(({ id, name, icon: Icon }) => (
                    <button
                      key={id}
                      className={`nav-item ${view === id ? 'nav-active' : ''}`}
                      onClick={() => navigate(id)}
                      aria-current={view === id ? 'page' : undefined}
                    >
                      <Icon size={19} strokeWidth={1.6} />
                      <span>{name}</span>
                      {id === 'words' && data.words.length > 0 && (
                        <small>{data.words.length}</small>
                      )}
                    </button>
                  ))}
              </nav>
              <div className="sidebar-bottom">
                <div className="sidebar-line" />
                <span className="sidebar-bottom-icon">
                  <BookOpen size={19} />
                </span>
                <strong>CET-6 研习室</strong>
                <p>Stay curious. Keep growing.</p>
                <div className="local-caption">
                  <span className="status-dot" />
                  本地学习空间
                </div>
              </div>
            </aside>
            {sidebar && (
              <button
                className="sidebar-backdrop"
                aria-label="关闭导航"
                onClick={() => setSidebar(false)}
              />
            )}
          </>
        )}
        <div className={`app-main ${session ? 'app-main-exam' : ''}`}>
          {!session && (
            <header className="topbar">
              <div className="breadcrumb">
                <button
                  className="icon-button menu-toggle"
                  aria-label="打开导航"
                  onClick={() => setSidebar(true)}
                >
                  <Menu size={20} />
                </button>
                <span>学习空间</span>
                <ChevronRight size={13} />
                <strong>{nav.find((n) => n.id === view)?.name}</strong>
              </div>
              <div className="topbar-account">
                <ShieldCheck size={15} />
                <span title={data.user?.displayName}>
                  {data.user?.displayName || '本地个人账户'}
                </span>
                <span className="account-avatar">{data.user?.displayName?.slice(0, 1) || 'S'}</span>
                {data.user && (
                  <button
                    className="icon-button"
                    title="修改密码"
                    aria-label="修改密码"
                    onClick={() => setPasswordOpen(true)}
                  >
                    <KeyRound size={16} />
                  </button>
                )}
                {data.accessRequired && (
                  <form
                    action="/logout"
                    method="post"
                    onSubmit={() => {
                      try {
                        const prefix = `cet6-draft:${data.user?.id || 'admin'}:`;
                        const legacy = new Set(
                          data.attempts.map((attempt) => `cet6-draft:${attempt.id}`),
                        );
                        Object.keys(localStorage)
                          .filter((key) => key.startsWith(prefix) || legacy.has(key))
                          .forEach((key) => localStorage.removeItem(key));
                      } catch {
                        /* Server sessions are still cleared on logout. */
                      }
                    }}
                  >
                    <button className="icon-button" title="退出登录" aria-label="退出登录">
                      <LogOut size={16} />
                    </button>
                  </form>
                )}
              </div>
            </header>
          )}
          <main
            id="main-content"
            tabIndex={-1}
            className={session ? 'exam-main' : 'workspace-content'}
          >
            {loading ? (
              <Skeleton />
            ) : error ? (
              <div className="connection-error">
                <h1>暂时无法连接学习空间</h1>
                <p>{error}</p>
                <button className="btn btn-primary" onClick={() => window.location.reload()}>
                  <RotateCcw size={16} />
                  重新连接
                </button>
                {window.location.hash.startsWith('#attempt/') && (
                  <button className="btn btn-secondary" onClick={() => navigate('papers')}>
                    返回题库
                  </button>
                )}
              </div>
            ) : session ? (
              <Suspense fallback={<Skeleton />}>
                <Exam
                  key={session.attempt.id}
                  session={session}
                  onSession={setSession}
                  onExit={() => navigate('papers')}
                  onWord={addWord}
                  notify={notify}
                />
              </Suspense>
            ) : (
              <>
                {view === 'papers' && (
                  <Papers
                    data={data}
                    onStart={setStarting}
                    onImport={() => setImporting(true)}
                    onSource={setSource}
                    onOpen={openAttempt}
                    onWord={addWord}
                    onView={navigate}
                    notify={notify}
                  />
                )}
                {view === 'words' && (
                  <Words words={data.words} reload={reload} onAdd={addWord} notify={notify} />
                )}
                {view === 'insights' && (
                  <Suspense fallback={<Skeleton />}>
                    <Insights
                      onOpen={(id) => {
                        window.location.hash = `attempt/${id}`;
                      }}
                      onPractice={() => navigate('papers')}
                      notify={notify}
                    />
                  </Suspense>
                )}
                {(view === 'history' || view === 'mistakes') && (
                  <Records
                    attempts={data.attempts}
                    mistakes={view === 'mistakes'}
                    onOpen={openAttempt}
                    onPractice={() => navigate('papers')}
                  />
                )}
                {view === 'manage' && (
                  <Manage
                    papers={data.papers}
                    onImport={() => setImporting(true)}
                    onSource={setSource}
                    reload={reload}
                    notify={notify}
                    shareToken={shareToken}
                    onShareClosed={() => {
                      setShareToken(null);
                      history.replaceState(null, '', '/#manage');
                    }}
                  />
                )}
                {view === 'admin' &&
                  (data.user?.role === 'admin' ? (
                    <Suspense fallback={<Skeleton />}>
                      <Admin notify={notify} />
                    </Suspense>
                  ) : (
                    <div className="empty">
                      <ShieldCheck size={30} />
                      <h2>仅管理员可以访问</h2>
                    </div>
                  ))}
                <footer className="workspace-footer">
                  <span>拾词 · 把读过的，变成自己的。</span>
                  <span>CET-6 学习空间</span>
                </footer>
              </>
            )}
          </main>
        </div>
      </div>
      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} />}
      {importing && (
        <Modal
          title="导入试卷"
          wide
          onClose={() => {
            if (
              !importDirty ||
              window.confirm('校对修改尚未保存，确认关闭？原 PDF 和已保存草稿会保留。')
            ) {
              setImporting(false);
              setImportDirty(false);
            }
          }}
        >
          <ImportForm
            notify={notify}
            onDirtyChange={setImportDirty}
            onDone={async () => {
              await reload();
              setImportDirty(false);
              setImporting(false);
            }}
          />
        </Modal>
      )}
      {source && (
        <Modal title="真题来源" onClose={() => setSource(null)}>
          <span className="tag tag-neutral">
            {source.year} 年 {source.month} 月
          </span>
          <h3 className="source-title">{source.title}</h3>
          <p className="source-description">
            {source.available
              ? '这份试卷已导入，可以直接开始练习。'
              : '该考次暂未导入题目，以下是已核验的资料来源。'}
          </p>
          <a className="source-link" href={source.source?.url} target="_blank" rel="noreferrer">
            <ExternalLink size={19} />
            <span>
              {source.source?.label || '查看原始资料'}
              <small>{source.source?.url ? new URL(source.source.url).hostname : ''}</small>
            </span>
            <ArrowRight size={18} />
          </a>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setSource(null)}>
              关闭
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setSource(null);
                setImporting(true);
              }}
            >
              <ArrowRight size={16} />
              导入试卷
            </button>
          </div>
        </Modal>
      )}
      {starting && (
        <StartModal
          paper={starting}
          busy={busy}
          onClose={() => setStarting(null)}
          onStart={() => void startExam()}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="关闭通知" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
