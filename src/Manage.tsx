import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  CheckCircle2,
  Download,
  ExternalLink,
  FileJson,
  Upload,
  Link,
  Share2,
  Search,
  X,
} from 'lucide-react';
import { post } from './api';
import { PageHeading } from './components';
import type { Paper } from './types';
import PdfImport from './PdfImport';
import { CreateShare, ImportShare, MyShares, SelectAll } from './PaperSharing';
import './library.css';

function JsonImportForm({
  onDone,
  notify,
}: {
  onDone: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  async function upload() {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('试卷文件不能超过 4 MB');
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error('文件不是有效的 JSON，请按试卷模板检查格式');
      }
      const response = await post<{ paper: Paper }>('/papers', data);
      await onDone();
      notify(`已导入：${response.paper.title}`);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="import-form">
      <button className="upload-zone" onClick={() => ref.current?.click()} disabled={busy}>
        <FileJson size={32} strokeWidth={1.4} />
        <strong>{file ? file.name : '选择试卷文件'}</strong>
        <span>{file ? `${(file.size / 1024).toFixed(1)} KB` : 'JSON 格式 · 最大 4 MB'}</span>
      </button>
      <input
        ref={ref}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label="选择 JSON 试卷文件"
        onChange={(e) => {
          setFile(e.target.files?.[0] || null);
          setError('');
        }}
      />
      <p className="import-note">
        试卷需要包含题目、选项、正确答案与解析。可下载完整模板，按题型填写你的真题内容。
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="import-actions">
        <a className="btn btn-secondary" href="/api/template" download="cet6-paper-template.json">
          <Download size={16} />
          下载试卷模板
        </a>
        <button className="btn btn-primary" disabled={!file || busy} onClick={() => void upload()}>
          <Upload size={16} />
          {busy ? '校验并导入中' : '导入题库'}
        </button>
      </div>
    </div>
  );
}

export function ImportForm({
  onDone,
  notify,
  onDirtyChange,
}: {
  onDone: () => Promise<void>;
  notify: (message: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [mode, setMode] = useState<'pdf' | 'json'>('pdf'),
    [dirty, setDirty] = useState(false);
  const changed = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange(value);
    },
    [onDirtyChange],
  );
  const switchMode = (value: 'pdf' | 'json') => {
    if (dirty && !window.confirm('当前校对修改尚未保存，切换会丢弃这些修改。继续？')) return;
    changed(false);
    setMode(value);
  };
  return (
    <>
      <div className="library-segments import-modes" aria-label="导入格式">
        <button aria-pressed={mode === 'pdf'} onClick={() => switchMode('pdf')}>
          PDF 试卷
        </button>
        <button aria-pressed={mode === 'json'} onClick={() => switchMode('json')}>
          JSON 试卷
        </button>
      </div>
      {mode === 'pdf' ? (
        <PdfImport onDone={onDone} notify={notify} onDirtyChange={changed} />
      ) : (
        <JsonImportForm onDone={onDone} notify={notify} />
      )}
    </>
  );
}

export default function Manage({
  papers,
  onImport,
  onSource,
  reload,
  notify,
  shareToken,
  onShareClosed,
}: {
  papers: Paper[];
  onImport: () => void;
  onSource: (paper: Paper) => void;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  shareToken?: string | null;
  onShareClosed: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState('');
  const [view, setView] = useState<'library' | 'shares'>('library');
  const [sharing, setSharing] = useState(false),
    [receiving, setReceiving] = useState(false),
    [shareVersion, setShareVersion] = useState(0);
  const filtered = papers.filter((paper) =>
    `${paper.title} ${paper.document?.filename || ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selectable = filtered.filter((paper) => paper.available && paper.document);
  const selectedVisible = selectable.filter((paper) => selected.includes(paper.id)).length;
  useEffect(() => {
    setSelected((previous) =>
      previous.filter((id) =>
        papers.some((paper) => paper.id === id && paper.document && paper.available),
      ),
    );
  }, [papers]);
  const closeShare = () => {
    setReceiving(false);
    if (shareToken) onShareClosed();
  };
  return (
    <>
      <PageHeading
        illustration="organize"
        title="题库管理"
        subtitle={`${papers.filter((p) => p.available).length} 份可练习试卷 · ${papers.filter((p) => !p.available).length} 份真题来源`}
      >
        <button className="btn btn-secondary" onClick={() => setReceiving(true)}>
          <Link size={16} />
          导入分享
        </button>
        <button className="btn btn-primary" onClick={onImport}>
          <ArrowDownToLine size={16} />
          导入试卷
        </button>
      </PageHeading>
      <div className="library-tabs" role="tablist" aria-label="题库视图">
        <button role="tab" aria-selected={view === 'library'} onClick={() => setView('library')}>
          我的题库
        </button>
        <button role="tab" aria-selected={view === 'shares'} onClick={() => setView('shares')}>
          分享记录
        </button>
      </div>
      {view === 'library' ? (
        <>
          <section className="management-intro">
            <div>
              <h2>我的题库</h2>
              <p>
                原创练习与已导入试卷可直接作答。历史真题保留来源入口，导入完整题目后可开始练习。
              </p>
            </div>
            <a
              className="btn btn-secondary"
              href="/api/template"
              download="cet6-paper-template.json"
            >
              <Download size={16} />
              试卷模板
            </a>
          </section>
          <div className="library-selection-toolbar">
            <label className="library-search">
              <Search size={16} />
              <input
                aria-label="搜索题库"
                placeholder="搜索试卷或 PDF 文件名"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span>已选 {selected.length} 份</span>
            {selected.length > 0 && (
              <button
                className="icon-button"
                title="清空选择"
                aria-label="清空试卷选择"
                onClick={() => setSelected([])}
              >
                <X size={16} />
              </button>
            )}
            <button
              className="btn btn-secondary"
              disabled={!selected.length}
              onClick={() => setSharing(true)}
            >
              <Share2 size={16} />
              分享已选
            </button>
          </div>
          <div className="manage-table manage-table-selectable">
            <div className="manage-table-head">
              <SelectAll
                label="全选当前列表中可分享的 PDF 试卷"
                checked={selectable.length > 0 && selectedVisible === selectable.length}
                partial={selectedVisible > 0 && selectedVisible < selectable.length}
                disabled={!selectable.length}
                onChange={(checked) =>
                  setSelected((previous) =>
                    checked
                      ? [...new Set([...previous, ...selectable.map((paper) => paper.id)])]
                      : previous.filter((id) => !selectable.some((paper) => paper.id === id)),
                  )
                }
              />
              <span>试卷名称</span>
              <span>内容状态</span>
              <span>操作</span>
            </div>
            {filtered.map((p) => (
              <div className="manage-table-row" key={p.id}>
                <input
                  type="checkbox"
                  aria-label={`选择${p.title}`}
                  disabled={!p.available || !p.document}
                  checked={selected.includes(p.id)}
                  onChange={(event) =>
                    setSelected((previous) =>
                      event.target.checked
                        ? [...previous, p.id]
                        : previous.filter((id) => id !== p.id),
                    )
                  }
                />
                <div>
                  <strong>{p.title}</strong>
                  <small>
                    {p.document ? `${p.document.filename} · ${p.document.pages} 页` : p.id}
                  </small>
                </div>
                <span className={`status-label ${p.available ? 'text-green' : 'muted'}`}>
                  {p.available && <CheckCircle2 size={15} />}
                  {p.available ? '可开始练习' : '待导入题目'}
                </span>
                {p.document ? (
                  <a
                    className="text-button"
                    href={`/api/pdf-documents/${p.document.id}`}
                    title="下载原 PDF"
                  >
                    <Download size={15} />原 PDF
                  </a>
                ) : p.source?.url ? (
                  <button className="text-button" onClick={() => onSource(p)}>
                    查看来源
                    <ExternalLink size={14} />
                  </button>
                ) : (
                  <span className="small muted">{p.source?.label || '原创练习'}</span>
                )}
              </div>
            ))}
          </div>
          {!filtered.length && <p className="library-empty muted">没有匹配的试卷</p>}
        </>
      ) : (
        <MyShares refreshKey={shareVersion} notify={notify} />
      )}
      {sharing && (
        <CreateShare
          papers={papers.filter((paper) => selected.includes(paper.id))}
          notify={notify}
          onClose={() => setSharing(false)}
          onCreated={() => setShareVersion((value) => value + 1)}
        />
      )}
      {(receiving || shareToken) && (
        <ImportShare
          initialToken={shareToken || undefined}
          onClose={closeShare}
          onDone={reload}
          notify={notify}
        />
      )}
    </>
  );
}
