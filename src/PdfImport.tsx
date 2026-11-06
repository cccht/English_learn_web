import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Equal,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api, post } from './api';
import { pdfStatus, processingPdf, type PdfJob } from './library-types';
import type { Group, Paper, Question } from './types';
import './library.css';

const entries = (paper: Paper) =>
  (paper.sections || []).flatMap((section, si) =>
    section.groups.flatMap((group, gi) =>
      group.questions.map((question, qi) => ({ section, group, question, si, gi, qi })),
    ),
  );
function equalWeights(paper: Paper) {
  const list = entries(paper);
  list.forEach(({ question }, i) => {
    question.weight = (Math.floor(10000 / list.length) + Number(i < 10000 % list.length)) / 100;
  });
}

function PdfEditor({
  job,
  onUpdate,
  onDone,
  notify,
  onDirtyChange,
}: {
  job: PdfJob;
  onUpdate: (job: PdfJob) => void;
  onDone: () => Promise<void>;
  notify: (message: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Paper>(() => structuredClone(job.draft!));
  const [index, setIndex] = useState(0),
    [page, setPage] = useState(1);
  const [sourceMode, setSourceMode] = useState<'image' | 'text'>('image');
  const [sourceZoom, setSourceZoom] = useState(100);
  const sourceContent = useRef<HTMLDivElement>(null);
  const [reviewed, setReviewed] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false),
    [imageRetry, setImageRetry] = useState(0);
  const questions = entries(draft),
    selected = questions[Math.min(index, Math.max(questions.length - 1, 0))];
  const weightSum = questions.reduce((sum, item) => sum + item.question.weight, 0);
  useEffect(() => {
    setDraft(structuredClone(job.draft!));
    setReviewed(false);
    onDirtyChange(false);
  }, [job.id, job.revision, onDirtyChange]);
  useEffect(() => {
    setImageFailed(false);
    setSourceZoom(100);
    sourceContent.current?.scrollTo({ top: 0, left: 0 });
  }, [page, sourceMode]);
  const change = (work: (paper: Paper) => void) => {
    setDraft((previous) => {
      const next = structuredClone(previous);
      work(next);
      return next;
    });
    setReviewed(false);
    onDirtyChange(true);
    setError('');
  };
  const editQuestion = (values: Partial<Question>) => {
    if (selected)
      change((paper) =>
        Object.assign(
          paper.sections![selected.si].groups[selected.gi].questions[selected.qi],
          values,
        ),
      );
  };
  const editGroup = (values: Partial<Group>) => {
    if (selected)
      change((paper) => Object.assign(paper.sections![selected.si].groups[selected.gi], values));
  };
  const select = (value: number) => {
    setIndex(value);
    const next = questions[value];
    if (next?.question.sourcePage) setPage(next.question.sourcePage);
  };
  function addQuestion() {
    const insertedIndex = selected
      ? questions.reduce(
          (last, item, i) => (item.si === selected.si && item.gi === selected.gi ? i + 1 : last),
          0,
        )
      : 0;
    change((paper) => {
      if (!paper.sections?.length)
        paper.sections = [
          {
            id: 'reading',
            title: '阅读理解',
            durationMinutes: 30,
            groups: [
              { id: 'group-' + crypto.randomUUID(), title: 'PDF 题目', passage: '', questions: [] },
            ],
          },
        ];
      const all = entries(paper);
      let number = 1;
      while (all.some((item) => item.question.number === number)) number++;
      const group = selected
        ? paper.sections[selected.si].groups[selected.gi]
        : paper.sections[0].groups[0];
      group.questions.push({
        id: 'question-' + crypto.randomUUID(),
        number,
        type: 'choice',
        prompt: '',
        options: [
          { id: 'A', text: '' },
          { id: 'B', text: '' },
        ],
        grading: 'manual',
        weight: 1,
        sourcePage: page,
      });
      equalWeights(paper);
    });
    setIndex(insertedIndex);
  }
  function removeQuestion() {
    if (!selected || !window.confirm('删除这道校对题目？原 PDF 不会删除。')) return;
    change((paper) => {
      paper.sections![selected.si].groups[selected.gi].questions.splice(selected.qi, 1);
      paper.sections = paper
        .sections!.map((section) => ({
          ...section,
          groups: section.groups.filter((group) => group.questions.length),
        }))
        .filter((section) => section.groups.length);
      equalWeights(paper);
    });
    setIndex(Math.max(0, index - 1));
  }
  async function save(commit: boolean) {
    setSaving(true);
    setError('');
    try {
      if (!draft.title.trim()) throw new Error('请填写试卷名称。');
      if (Math.abs(weightSum - 100) > 0.001)
        throw new Error('题目分值之和须为 100，可使用“平均分值”重新分配。');
      if (commit && questions.some((item) => !item.question.prompt.trim()))
        throw new Error('请补充空白题干后再入库。');
      if (commit) {
        const result = await post<{ paper: Paper }>(`/pdf-imports/${job.id}/commit`, {
          draft,
          revision: job.revision,
          reviewed,
        });
        onDirtyChange(false);
        await onDone();
        notify(`已导入：${result.paper.title}`);
      } else {
        const result = await api<{ job: PdfJob }>(`/pdf-imports/${job.id}/draft`, {
          method: 'PUT',
          body: JSON.stringify({ draft, revision: job.revision }),
        });
        onUpdate(result.job);
        onDirtyChange(false);
        notify('校对草稿已保存');
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="pdf-editor">
      <div className="library-form-row">
        <label className="grow">
          试卷名称
          <input
            value={draft.title}
            onChange={(event) =>
              change((paper) => {
                paper.title = event.target.value;
              })
            }
            maxLength={300}
          />
        </label>
        <label>
          总时长（分钟）
          <input
            type="number"
            min={1}
            max={300}
            value={draft.durationMinutes}
            onChange={(event) =>
              change((paper) => {
                paper.durationMinutes = Number(event.target.value);
              })
            }
          />
        </label>
      </div>
      <details className="pdf-metadata">
        <summary>试卷信息</summary>
        <div className="library-form-row">
          <label>
            年份
            <input
              type="number"
              min={1980}
              max={2100}
              value={draft.year}
              onChange={(event) =>
                change((paper) => {
                  paper.year = Number(event.target.value);
                })
              }
            />
          </label>
          <label>
            月份
            <select
              aria-label="试卷月份"
              value={draft.month}
              onChange={(event) =>
                change((paper) => {
                  paper.month = Number(event.target.value);
                })
              }
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1} 月
                </option>
              ))}
            </select>
          </label>
          <label>
            试卷分类
            <select
              aria-label="试卷分类"
              value={draft.kind}
              onChange={(event) =>
                change((paper) => {
                  paper.kind = event.target.value as Paper['kind'];
                })
              }
            >
              <option value="practice">练习试卷</option>
              <option value="past">历年真题</option>
            </select>
          </label>
        </div>
      </details>
      {job.warnings.length > 0 && (
        <details className="pdf-warnings" open>
          <summary>{job.warnings.length} 项待核对</summary>
          <ul>
            {job.warnings.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="pdf-editor-toolbar">
        <strong>{questions.length} 道题</strong>
        <span className={Math.abs(weightSum - 100) > 0.001 ? 'text-error' : 'muted'}>
          总分 {weightSum.toFixed(2)} / 100
        </span>
        <button
          className="text-button"
          onClick={() => change(equalWeights)}
          disabled={!questions.length}
        >
          <Equal size={15} />
          平均分值
        </button>
        <button
          className="btn btn-secondary"
          onClick={addQuestion}
          disabled={questions.length >= 500}
        >
          <Plus size={16} />
          添加题目
        </button>
      </div>
      <div className="pdf-editor-layout">
        <div className="pdf-source">
          <div className="pdf-source-toolbar">
            <div className="library-segments" aria-label="原文视图">
              <button aria-pressed={sourceMode === 'image'} onClick={() => setSourceMode('image')}>
                原页
              </button>
              <button aria-pressed={sourceMode === 'text'} onClick={() => setSourceMode('text')}>
                提取文字
              </button>
            </div>
            <select
              aria-label="PDF 页码"
              value={page}
              onChange={(event) => setPage(Number(event.target.value))}
            >
              {Array.from({ length: job.pageCount || job.document.pages || 1 }, (_, i) => (
                <option key={i} value={i + 1}>
                  第 {i + 1} 页
                </option>
              ))}
            </select>
            <a
              className="icon-button"
              href={`/api/pdf-documents/${job.documentId}`}
              aria-label="下载原 PDF"
              title="下载原 PDF"
            >
              <Download size={17} />
            </a>
          </div>
          {sourceMode === 'image' && (
            <div className="pdf-zoom-tools">
              <button
                className="icon-button"
                type="button"
                title="缩小原页"
                aria-label="缩小原页"
                disabled={sourceZoom <= 100}
                onClick={() => setSourceZoom((value) => Math.max(100, value - 50))}
              >
                <ZoomOut size={17} />
              </button>
              <span>{sourceZoom}%</span>
              <button
                className="icon-button"
                type="button"
                title="放大原页"
                aria-label="放大原页"
                disabled={sourceZoom >= 300}
                onClick={() => setSourceZoom((value) => Math.min(300, value + 50))}
              >
                <ZoomIn size={17} />
              </button>
            </div>
          )}
          <div className="pdf-source-content" ref={sourceContent}>
            {sourceMode === 'text' ? (
              <pre>
                {job.pages?.find((item) => item.number === page)?.text || '该页没有提取到文字。'}
              </pre>
            ) : imageFailed ? (
              <div className="pdf-preview-error">
                <p>原页预览暂不可用</p>
                <button
                  className="text-button"
                  onClick={() => {
                    setImageFailed(false);
                    setImageRetry((value) => value + 1);
                  }}
                >
                  <RefreshCw size={16} />
                  重新加载
                </button>
              </div>
            ) : (
              <img
                src={`/api/pdf-documents/${job.documentId}/pages/${page}?v=${imageRetry}`}
                alt={`PDF 第 ${page} 页`}
                style={{ width: `${sourceZoom}%` }}
                onError={() => setImageFailed(true)}
              />
            )}
          </div>
        </div>
        <div className="pdf-question-editor">
          {selected ? (
            <>
              <div className="pdf-question-navigation">
                <button
                  className="icon-button"
                  aria-label="上一道校对题目"
                  title="上一题"
                  disabled={index <= 0}
                  onClick={() => select(index - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <select
                  aria-label="切换校对题目"
                  value={Math.min(index, questions.length - 1)}
                  onChange={(event) => select(Number(event.target.value))}
                >
                  {questions.map((item, i) => (
                    <option key={item.question.id} value={i}>
                      第 {item.question.number} 题 · {item.section.title}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  aria-label="下一道校对题目"
                  title="下一题"
                  disabled={index >= questions.length - 1}
                  onClick={() => select(index + 1)}
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  className="icon-button danger"
                  aria-label="删除校对题目"
                  title="删除题目"
                  onClick={removeQuestion}
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <div className="library-form-row">
                <label>
                  题号
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={selected.question.number}
                    onChange={(event) => editQuestion({ number: Number(event.target.value) })}
                  />
                </label>
                <label>
                  题型
                  <select
                    aria-label="题型"
                    value={selected.question.type}
                    onChange={(event) =>
                      editQuestion(
                        event.target.value === 'text'
                          ? { type: 'text', options: [], answer: undefined, grading: 'manual' }
                          : {
                              type: 'choice',
                              options: [
                                { id: 'A', text: '' },
                                { id: 'B', text: '' },
                              ],
                              grading: 'manual',
                            },
                      )
                    }
                  >
                    <option value="choice">选择题</option>
                    <option value="text">文字作答</option>
                  </select>
                </label>
                <label>
                  分值
                  <input
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={selected.question.weight}
                    onChange={(event) => editQuestion({ weight: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label>
                题目
                <textarea
                  aria-label="题目"
                  rows={4}
                  value={selected.question.prompt}
                  onChange={(event) => editQuestion({ prompt: event.target.value })}
                />
              </label>
              {selected.question.type === 'choice' && (
                <div className="pdf-options">
                  {(selected.question.options || []).map((option, i) => (
                    <div className="pdf-option-row" key={option.id}>
                      <label>
                        <span>选项 {option.id}</span>
                        <textarea
                          aria-label={`选项 ${option.id}`}
                          rows={2}
                          value={option.text}
                          onChange={(event) => {
                            const options = [...selected.question.options!];
                            options[i] = { ...option, text: event.target.value };
                            editQuestion({ options });
                          }}
                        />
                      </label>
                      <button
                        className="icon-button"
                        aria-label={`删除选项 ${option.id}`}
                        title={`删除选项 ${option.id}`}
                        disabled={selected.question.options!.length <= 2}
                        onClick={() =>
                          editQuestion({
                            options: selected.question.options!.filter(
                              (item) => item.id !== option.id,
                            ),
                            ...(selected.question.answer === option.id
                              ? { answer: undefined, grading: 'manual' as const }
                              : {}),
                          })
                        }
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    disabled={(selected.question.options?.length || 0) >= 26}
                    onClick={() => {
                      const id = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                        .split('')
                        .find(
                          (id) => !selected.question.options?.some((option) => option.id === id),
                        )!;
                      editQuestion({
                        options: [...(selected.question.options || []), { id, text: '' }],
                      });
                    }}
                  >
                    <Plus size={15} />
                    添加选项
                  </button>
                  <div className="library-form-row">
                    <label className="grow">
                      标准答案
                      <select
                        aria-label="标准答案"
                        value={selected.question.answer || ''}
                        onChange={(event) =>
                          editQuestion({
                            answer: event.target.value || undefined,
                            grading: event.target.value ? 'auto' : 'manual',
                          })
                        }
                      >
                        <option value="">未提供，人工评分</option>
                        {selected.question.options?.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      评分方式
                      <select
                        aria-label="评分方式"
                        value={selected.question.grading || 'auto'}
                        onChange={(event) =>
                          editQuestion({ grading: event.target.value as 'auto' | 'manual' })
                        }
                      >
                        <option value="auto" disabled={!selected.question.answer}>
                          自动判分
                        </option>
                        <option value="manual">人工评分</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
              {selected.question.type === 'text' && (
                <label>
                  参考答案（可留空）
                  <textarea
                    aria-label="参考答案（可留空）"
                    rows={4}
                    value={selected.question.referenceAnswer || ''}
                    onChange={(event) => editQuestion({ referenceAnswer: event.target.value })}
                  />
                </label>
              )}
              <label>
                解析（可留空）
                <textarea
                  aria-label="解析（可留空）"
                  rows={3}
                  value={selected.question.explanation || ''}
                  onChange={(event) => editQuestion({ explanation: event.target.value })}
                />
              </label>
              <details className="pdf-group-fields">
                <summary>
                  {selected.section.title} · {selected.group.title}
                </summary>
                <label>
                  题组名称
                  <input
                    value={selected.group.title}
                    onChange={(event) => editGroup({ title: event.target.value })}
                  />
                </label>
                <label>
                  阅读原文
                  <textarea
                    aria-label="阅读原文"
                    rows={7}
                    value={selected.group.passage || ''}
                    onChange={(event) => editGroup({ passage: event.target.value })}
                  />
                </label>
                <label>
                  作答要求
                  <textarea
                    aria-label="作答要求"
                    rows={3}
                    value={selected.group.instructions || ''}
                    onChange={(event) => editGroup({ instructions: event.target.value })}
                  />
                </label>
                {selected.section.id === 'listening' && (
                  <label>
                    听力音频地址
                    <input
                      value={selected.group.audioUrl || ''}
                      onChange={(event) => editGroup({ audioUrl: event.target.value || undefined })}
                    />
                  </label>
                )}
              </details>
            </>
          ) : (
            <div className="pdf-preview-error">
              <p>尚无可校对题目</p>
              <button className="btn btn-secondary" onClick={addQuestion}>
                <Plus size={16} />
                添加题目
              </button>
            </div>
          )}
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="pdf-editor-footer">
        <label className="library-checkbox">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
          />
          已核对题目、选项与答案
        </label>
        <div>
          <button
            className="btn btn-secondary"
            disabled={saving || !questions.length}
            onClick={() => void save(false)}
          >
            <Save size={16} />
            保存校对
          </button>
          <button
            className="btn btn-primary"
            disabled={saving || !reviewed || !questions.length}
            onClick={() => void save(true)}
          >
            {saving ? <Loader2 className="ex-spin" size={16} /> : <Upload size={16} />}确认入库
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PdfImport({
  onDone,
  notify,
  onDirtyChange,
}: {
  onDone: () => Promise<void>;
  notify: (message: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [job, setJob] = useState<PdfJob | null>(null),
    [jobs, setJobs] = useState<PdfJob[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [available, setAvailable] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    const value = await api<{ jobs: PdfJob[] }>('/pdf-imports');
    setJobs(value.jobs);
  };
  useEffect(() => {
    let current = true;
    void Promise.all([
      api<{ jobs: PdfJob[] }>('/pdf-imports'),
      api<{ pdf: boolean }>('/library/capabilities'),
    ])
      .then(([value, capabilities]) => {
        if (current) {
          setJobs(value.jobs);
          setAvailable(capabilities.pdf);
        }
      })
      .catch((reason) => {
        if (current) setError(reason.message);
      });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    if (!processingPdf(job)) return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await api<{ job: PdfJob }>(`/pdf-imports/${job!.id}`);
        if (current) {
          setJob(value.job);
          setError('');
          if (!processingPdf(value.job)) await refresh();
        }
      } catch (reason) {
        if (current) {
          setError((reason as Error).message);
          timer = setTimeout(poll, 1500);
        }
      }
    };
    timer = setTimeout(poll, 850);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [job]);
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('PDF 不能超过 20 MB');
      const value = await api<{ job: PdfJob }>('/pdf-imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', 'X-Filename': encodeURIComponent(file.name) },
        body: file,
      });
      setJob(value.job);
      setFile(null);
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(name: 'cancel' | 'retry') {
    if (!job) return;
    setBusy(true);
    setError('');
    try {
      const value = await post<{ job: PdfJob }>(`/pdf-imports/${job.id}/${name}`);
      setJob(value.job);
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (job?.status === 'ready' && job.draft)
    return (
      <PdfEditor
        key={job.id}
        job={job}
        onUpdate={setJob}
        onDone={onDone}
        notify={notify}
        onDirtyChange={onDirtyChange}
      />
    );
  return (
    <div className="pdf-import">
      {job && processingPdf(job) ? (
        <div className="pdf-progress" role="status">
          <Loader2 className="ex-spin" size={30} />
          <h3>{pdfStatus[job.status]}</h3>
          <p>{job.filename}</p>
          <progress
            max={job.pageCount || 1}
            value={job.pageCount ? job.currentPage || 0 : undefined}
          />
          <span>
            {job.pageCount ? `第 ${job.currentPage || 0} / ${job.pageCount} 页` : '正在准备转换'}
          </span>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void action('cancel')}
          >
            <X size={16} />
            取消转换
          </button>
        </div>
      ) : (
        <>
          {job?.error && (
            <div className="inline-error" role="alert">
              <p>{job.error}</p>
              <button className="text-button" disabled={busy} onClick={() => void action('retry')}>
                <RefreshCw size={16} />
                重新识别
              </button>
            </div>
          )}
          {job?.status === 'imported' && (
            <p className="pdf-import-success">“{job.filename}”已在题库中，未重复导入。</p>
          )}
          <button
            className="upload-zone"
            disabled={busy || !available}
            onClick={() => input.current?.click()}
          >
            <FileUp size={32} strokeWidth={1.4} />
            <strong>{file?.name || '选择 PDF 试卷'}</strong>
            <span>
              {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'PDF · 最大 20 MB · 80 页'}
            </span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            aria-label="选择 PDF 试卷文件"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setError('');
              event.target.value = '';
            }}
          />
          {!available && (
            <p className="inline-error">服务器 PDF/OCR 组件尚未就绪，JSON 导入仍可使用。</p>
          )}
          <div className="import-actions">
            <span className="muted small">扫描件最多 40 页</span>
            <button
              className="btn btn-primary"
              disabled={!file || busy || !available}
              onClick={() => void upload()}
            >
              {busy ? <Loader2 className="ex-spin" size={16} /> : <Upload size={16} />}上传并识别
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {jobs.length > 0 && !processingPdf(job) && (
        <div className="pdf-recent">
          <h3>最近导入</h3>
          {jobs.slice(0, 8).map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setError('');
                void api<{ job: PdfJob }>(`/pdf-imports/${item.id}`)
                  .then((value) => setJob(value.job))
                  .catch((reason) => setError(reason.message));
              }}
            >
              <span>{item.filename}</span>
              <small>{pdfStatus[item.status]}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
