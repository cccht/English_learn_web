import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronDown,
  Download,
  FileSearch,
  RefreshCw,
  Settings2,
  Sparkles,
  Target,
  Timer,
  X,
} from 'lucide-react';
import { api, dateLabel, duration, patch, post } from './api';
import { Empty, Modal, PageHeading, Skeleton } from './components';
import {
  errorReasons,
  wordReasons,
  type AiConfig,
  type AiJob,
  type Finding,
  type InsightReport,
} from './insight-types';
import './insights.css';

const pct = (value: number | null) => (value === null ? '暂无数据' : `${value.toFixed(1)}%`);
const activeJob = (job: AiJob | null) => job?.status === 'queued' || job?.status === 'running';
const confidenceLabel = { low: '样本有限', medium: '有一定依据', high: '样本较充分' };

function SectionTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="in-section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Findings({ rows }: { rows: Finding[] }) {
  return (
    <div className="in-findings">
      {rows.map((row, index) => (
        <article key={row.title} className="in-finding">
          <span className="in-finding-index">{String(index + 1).padStart(2, '0')}</span>
          <div>
            <h3>{row.title}</h3>
            <p className="in-evidence-line">{row.evidence}</p>
            <p>{row.interpretation}</p>
            <div className="in-action">
              <ArrowRight size={14} />
              <span>{row.action}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function TypeBars({ rows }: { rows: InsightReport['questionTypes'] }) {
  return (
    <div className="in-type-bars">
      {rows.map((row) => (
        <div className="in-type-row" key={row.id}>
          <div className="in-type-top">
            <strong>{row.label}</strong>
            <span className={row.errorRate !== null && row.errorRate >= 50 ? 'text-warm' : ''}>
              {pct(row.errorRate)}
            </span>
          </div>
          <div
            className="in-bar-track"
            role="img"
            aria-label={`${row.label}错误率 ${pct(row.errorRate)}`}
          >
            <div style={{ width: `${row.errorRate ?? 0}%` }} />
          </div>
          <div className="in-type-foot">
            <span>
              答错 {row.wrong} / 已答 {row.answered} · 未答 {row.skipped}
            </span>
            <span>{confidenceLabel[row.confidence]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ModelSettings({
  initial,
  onClose,
  onSaved,
}: {
  initial: AiConfig;
  onClose: () => void;
  onSaved: (config: AiConfig) => void;
}) {
  const [config, setConfig] = useState(initial);
  const [key, setKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const next = await api<AiConfig>('/ai/config', {
        method: 'PUT',
        body: JSON.stringify({
          provider: config.provider,
          baseUrl: config.baseUrl,
          model: config.model,
          timeoutSeconds: config.timeoutSeconds,
          ...(key.trim() ? { apiKey: key.trim() } : {}),
          clearApiKey: clearKey,
        }),
      });
      setKey('');
      onSaved(next);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="模型设置" onClose={() => !busy && onClose()}>
      <form onSubmit={save} className="in-config-form">
        <label>
          模型服务
          <select
            value={config.provider}
            disabled={initial.managedEndpoint}
            onChange={(e) => {
              const provider = e.target.value as AiConfig['provider'];
              setConfig((old) => ({
                ...old,
                provider,
                baseUrl:
                  provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1',
                model: '',
              }));
              setKey('');
            }}
          >
            {[
              { id: 'openai-compatible', label: '兼容 OpenAI 的 API' },
              { id: 'ollama', label: '本机 Ollama' },
            ].map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          服务地址 Base URL
          <input
            type="url"
            required
            value={config.baseUrl}
            readOnly={initial.managedEndpoint}
            onChange={(e) => setConfig((old) => ({ ...old, baseUrl: e.target.value }))}
            placeholder="https://your-service.example/v1"
          />
        </label>
        <label>
          模型名称
          <input
            required
            value={config.model}
            onChange={(e) => setConfig((old) => ({ ...old, model: e.target.value }))}
            placeholder="服务提供方的模型名称"
            maxLength={200}
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            autoComplete="new-password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={initial.hasApiKey ? '已保存，留空保留' : '填写服务方提供的密钥'}
            maxLength={4096}
          />
        </label>
        {initial.hasApiKey && (
          <label className="in-checkbox">
            <input
              type="checkbox"
              checked={clearKey}
              onChange={(e) => setClearKey(e.target.checked)}
            />
            清除已保存密钥
          </label>
        )}
        <label>
          请求超时（秒）
          <input
            type="number"
            min={10}
            max={180}
            value={config.timeoutSeconds}
            onChange={(e) =>
              setConfig((old) => ({ ...old, timeoutSeconds: Number(e.target.value) }))
            }
            required
          />
        </label>
        <p className="in-form-note">
          {initial.managedEndpoint
            ? '服务地址由管理员设置，模型与 API Key 仅用于当前账号。'
            : '生成分析时会发送统计摘要及部分错题、生词语境。密钥保存在本机，不会显示在报告中；切换服务后需重新填写密钥。'}
        </p>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy}>
            <Check size={16} />
            {busy ? '保存中' : '保存设置'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function exportReport(report: InsightReport, job: AiJob | null) {
  const safe = (value: string) => value.replaceAll('|', '/').replaceAll('\n', ' ');
  const lines = [
    '# 拾词学习诊断',
    '',
    `生成时间：${dateLabel(report.generatedAt)}`,
    `范围：${report.rangeDays === null ? '全部' : `近 ${report.rangeDays} 天`}`,
    `已交卷 ${report.summary.attemptCount} 次；已答 ${report.summary.answered} 题次；答错 ${report.summary.wrong}；未答 ${report.summary.skipped}；正确率 ${pct(report.summary.accuracy)}。`,
    '',
    '## 题型统计',
    '',
    '| 题型 | 已答 | 答错 | 未答 | 错误率 | 独立已答题 |',
    '|---|---:|---:|---:|---:|---:|',
    ...report.questionTypes.map(
      (row) =>
        `| ${safe(row.label)} | ${row.answered} | ${row.wrong} | ${row.skipped} | ${pct(row.errorRate)} | ${row.uniqueQuestions} |`,
    ),
    '',
    '## 优先练习',
    ...report.priorities.flatMap((row) => [
      '',
      `### ${row.title}`,
      row.evidence,
      row.interpretation,
      row.action,
    ]),
    '',
    '## 词汇诊断',
    ...report.vocabulary.words.flatMap((word) => [
      '',
      `### ${word.word}`,
      `原因标记：${word.reasonLabel}；复习 ${word.reviewCount} 次，自报没记住 ${word.forgotCount} 次。`,
      word.hypothesis,
      word.recommendation,
    ]),
    '',
    '## 数据限制',
    ...report.limitations.map((text) => `- ${text}`),
  ];
  if (job?.result)
    lines.push(
      '',
      '## AI 解读',
      `模型：${job.model}；生成于 ${dateLabel(job.createdAt)}${job.fingerprint !== report.fingerprint ? '；此为旧数据报告。' : ''}`,
      job.result.overview,
      ...job.result.findings.flatMap((item) => [
        '',
        `### ${item.title}`,
        item.analysis,
        `证据：${item.evidenceIds.join(', ')}`,
        ...item.actions.map((action) => `- ${action}`),
      ]),
      '',
      '### 练习计划',
      ...job.result.plan.flatMap((day) => [
        '',
        `第 ${day.day} 天：${day.title}，${day.minutes} 分钟`,
        ...day.tasks.map((task) => `- ${task}`),
      ]),
      '',
      '### AI 证据快照',
      ...(job.evidence || []).map((item) => `- ${item.id}: ${item.text}`),
    );
  const url = URL.createObjectURL(
    new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `shici-diagnosis-${report.generatedAt.slice(0, 10)}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Insights({
  onOpen,
  onPractice,
  notify,
}: {
  onOpen: (id: string) => void;
  onPractice: () => void;
  notify: (message: string) => void;
}) {
  const [days, setDays] = useState('30');
  const [tab, setTab] = useState('overview');
  const [report, setReport] = useState<InsightReport | null>(null);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [job, setJob] = useState<AiJob | null>(null);
  const [history, setHistory] = useState<AiJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [settings, setSettings] = useState(false);
  const [saving, setSaving] = useState('');
  const [wordQuery, setWordQuery] = useState('');
  const [evidence, setEvidence] = useState<{ id: string; text: string }[] | null>(null);
  const requestId = useRef(0);
  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      api<InsightReport>(`/insights?days=${days}`),
      api<{ job: AiJob | null }>(`/insights/ai/latest?days=${days}`),
      api<AiConfig>('/ai/config'),
    ]);
    if (id !== requestId.current) return;
    if (results[0].status === 'fulfilled') setReport(results[0].value);
    else {
      setReport(null);
      setError(results[0].reason.message);
    }
    if (results[1].status === 'fulfilled') setJob(results[1].value.job);
    else {
      setJob(null);
      setError(results[1].reason.message);
    }
    if (results[2].status === 'fulfilled') setConfig(results[2].value);
    else setError(results[2].reason.message);
    setLoading(false);
  }, [days]);
  useEffect(() => {
    void reload();
    return () => {
      requestId.current++;
    };
  }, [reload]);
  useEffect(() => {
    let mounted = true;
    api<{ jobs: AiJob[] }>(`/insights/ai/history?days=${days}`)
      .then((value) => {
        if (mounted) setHistory(value.jobs);
      })
      .catch(() => {
        if (mounted) setHistory([]);
      });
    return () => {
      mounted = false;
    };
  }, [days, job?.id, job?.status]);
  useEffect(() => {
    if (!job || !activeJob(job)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await api<{ job: AiJob }>(`/insights/ai/${job.id}`);
        if (stopped) return;
        setJob(value.job);
        if (activeJob(value.job)) timer = setTimeout(poll, 1500);
      } catch (reason) {
        if (!stopped) {
          setError((reason as Error).message);
          timer = setTimeout(poll, 5000);
        }
      }
    };
    timer = setTimeout(poll, 500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [job?.id, job?.status]);
  async function generate() {
    if (!report) return;
    if (!config?.model) {
      setSettings(true);
      return;
    }
    setGenerating(true);
    setError('');
    setTab('ai');
    try {
      const result = await post<{ job: AiJob }>('/insights/ai', {
        days: days === 'all' ? null : Number(days),
        force: true,
      });
      setJob(result.job);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setGenerating(false);
    }
  }
  async function mark(path: string, input: object, id: string) {
    setSaving(id);
    try {
      await patch(path, input);
      await reload();
      notify('原因已更新');
    } catch (reason) {
      notify((reason as Error).message);
    } finally {
      setSaving('');
    }
  }
  const showEvidence = (ids: string[]) => {
    const entries =
      job?.evidence || (job?.fingerprint === report?.fingerprint ? report?.evidence : []) || [];
    setEvidence(
      ids.map(
        (id) =>
          entries.find((entry) => entry.id === id) || {
            id,
            text: '这份报告未保留对应证据快照，请重新生成。',
          },
      ),
    );
  };
  if (loading) return <Skeleton />;
  if (!report)
    return (
      <>
        <PageHeading title="学习诊断" subtitle="学习记录暂时无法读取" illustration="insights" />
        <p className="inline-error" role="alert">
          {error}
        </p>
        <button className="btn btn-secondary" onClick={() => void reload()}>
          <RefreshCw size={16} />
          重新加载
        </button>
      </>
    );
  const busy = generating || activeJob(job);
  const stale = Boolean(job?.result && job.fingerprint !== report.fingerprint);
  const summary = report.summary;
  const words = report.vocabulary.words.filter((word) =>
    `${word.word} ${word.definition}`.toLowerCase().includes(wordQuery.toLowerCase()),
  );
  const historyOptions =
    job && !history.some((item) => item.id === job.id) ? [job, ...history] : history;
  return (
    <div className="in-page">
      <PageHeading
        title="学习诊断"
        illustration="insights"
        subtitle={`${days === 'all' ? '全部学习记录' : `最近 ${days} 天`} · 更新于 ${dateLabel(report.generatedAt)}`}
      >
        <button className="btn btn-secondary" onClick={() => setSettings(true)} disabled={!config}>
          <Settings2 size={16} />
          模型设置
        </button>
        <button
          className="btn btn-primary"
          onClick={() => void generate()}
          disabled={busy || (!summary.answered && !summary.vocabularyCount)}
        >
          <Sparkles size={16} />
          {busy ? 'AI 正在分析' : '生成 AI 分析'}
        </button>
      </PageHeading>
      <div className="in-summary">
        <div>
          <span>纳入练习</span>
          <strong>
            {summary.attemptCount}
            <small> 次 / {summary.paperCount} 套卷</small>
          </strong>
        </div>
        <div>
          <span>已答客观题正确率</span>
          <strong>
            {summary.accuracy === null ? '--' : `${summary.accuracy.toFixed(1)}%`}
            <small>{summary.answered} 题次</small>
          </strong>
        </div>
        <div>
          <span>反复答错的题</span>
          <strong>
            {summary.repeatedMistakeCount}
            <small> 道</small>
          </strong>
        </div>
        <div>
          <span>当前收录词汇</span>
          <strong>
            {summary.vocabularyCount}
            <small> 个</small>
          </strong>
        </div>
      </div>
      <div className="in-toolbar">
        <div className="tabs" role="tablist" aria-label="诊断内容">
          {[
            { id: 'overview', label: '总览' },
            { id: 'types', label: '题型与错题' },
            { id: 'words', label: '词汇诊断' },
            { id: 'ai', label: 'AI 学习建议' },
          ].map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="in-toolbar-actions">
          <div className="select-wrap">
            <select
              value={days}
              aria-label="分析时间范围"
              onChange={(e) => setDays(e.target.value)}
            >
              <option value="30">近 30 天</option>
              <option value="90">近 90 天</option>
              <option value="all">全部记录</option>
            </select>
            <ChevronDown size={15} />
          </div>
          <button
            className="icon-button"
            title="刷新诊断"
            aria-label="刷新诊断"
            onClick={() => void reload()}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="icon-button"
            title="导出诊断"
            aria-label="导出诊断"
            onClick={() => exportReport(report, job)}
          >
            <Download size={17} />
          </button>
        </div>
      </div>
      {error && (
        <div className="inline-error in-inline-error" role="alert">
          <span>{error}</span>
          <button className="icon-button" onClick={() => setError('')} aria-label="关闭错误提示">
            <X size={15} />
          </button>
        </div>
      )}
      {tab === 'overview' && (
        <>
          {summary.level !== 'developing' && (
            <div className="in-notice">
              <Target size={19} />
              <div>
                <strong>
                  {summary.level === 'empty'
                    ? '先积累记录，再判断弱点'
                    : '当前样本有限，先把结果当作复盘线索'}
                </strong>
                <p>
                  {summary.answered
                    ? `目前涉及 ${summary.paperCount} 套卷。重复做同一原题不等于增加独立样本，尚不能确定稳定的薄弱项。`
                    : '尚无可用于判断题型弱点的客观作答。已收录的单词仍可以单独分析。'}
                </p>
              </div>
              {!summary.attemptCount && (
                <button className="text-button" onClick={onPractice}>
                  开始练习
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          <div className="in-overview-grid">
            <section>
              <SectionTitle
                title="下一步优先练什么"
                subtitle="结论来自下面的记录，可返回原题核对。"
              />
              <Findings rows={report.priorities.slice(0, 4)} />
            </section>
            <section>
              <SectionTitle title="题型错误分布" subtitle="错误率 = 答错题次 / 实际作答题次" />
              {report.questionTypes.length ? (
                <TypeBars rows={report.questionTypes} />
              ) : (
                <Empty title="暂时没有题型数据" detail="交卷后生成统计。" illustration="insights" />
              )}
            </section>
          </div>
          <section className="in-band">
            <SectionTitle
              title="做题习惯"
              subtitle={`${report.habits.telemetryAttempts} 次练习带有新版行为记录；只统计已经保存的变更。`}
            />
            <div className="in-habit-metrics">
              <div>
                <span>选项改答</span>
                <strong>
                  {report.habits.telemetryAttempts ? report.habits.answerChanges : '--'}
                  <small> 次</small>
                </strong>
              </div>
              <div>
                <span>对改错</span>
                <strong>
                  {report.habits.telemetryAttempts ? report.habits.correctToWrong : '--'}
                  <small> 次</small>
                </strong>
              </div>
              <div>
                <span>错改对</span>
                <strong>
                  {report.habits.telemetryAttempts ? report.habits.wrongToCorrect : '--'}
                  <small> 次</small>
                </strong>
              </div>
              <div>
                <span>大题切换</span>
                <strong>
                  {report.habits.telemetryAttempts ? report.habits.sectionSwitches : '--'}
                  <small> 次</small>
                </strong>
              </div>
            </div>
            <Findings rows={report.habits.notes} />
          </section>
          <section className="in-band">
            <SectionTitle
              title="各大题时间"
              subtitle="计时包含离开页面或后台停留，不等于专注时间。"
            />
            {report.sections.length ? (
              <div className="in-time-list">
                {report.sections.map((section) => (
                  <div key={section.sectionId}>
                    <Timer size={17} />
                    <strong>{section.title}</strong>
                    <span>
                      平均 <b>{duration(section.averageSeconds)}</b>
                    </span>
                    <span>建议 {duration(section.recommendedSeconds)}</span>
                    <small>
                      {section.overBudgetCount}/{section.attemptCount} 次超出建议
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">暂无已交卷的计时记录。</p>
            )}
          </section>
        </>
      )}
      {tab === 'types' && (
        <>
          <SectionTitle
            title="按题型看表现"
            subtitle={`答错 ${summary.wrong} 题次；未答 ${summary.skipped} 题次。主观题不参与正确率计算。`}
          />
          {report.questionTypes.length ? (
            <div className="in-table-wrap">
              <table className="in-table">
                <thead>
                  <tr>
                    <th>题型</th>
                    <th>已答</th>
                    <th>答错</th>
                    <th>未答</th>
                    <th>错误率</th>
                    <th>独立已答题</th>
                    <th>样本情况</th>
                  </tr>
                </thead>
                <tbody>
                  {report.questionTypes.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.label}</strong>
                      </td>
                      <td>{row.answered}</td>
                      <td>{row.wrong}</td>
                      <td>{row.skipped}</td>
                      <td className={row.errorRate && row.errorRate >= 50 ? 'text-warm' : ''}>
                        {pct(row.errorRate)}
                      </td>
                      <td>{row.uniqueQuestions}</td>
                      <td>
                        <span className="tag tag-neutral">{confidenceLabel[row.confidence]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="还没有题型统计"
              action="去做一份练习"
              onAction={onPractice}
              illustration="insights"
            />
          )}
          <section className="in-band">
            <SectionTitle
              title="反复错题追踪"
              subtitle="同一试卷的同一道题至少答错两次；未作答不计入答错次数。"
            />
            {report.repeatedMistakes.length ? (
              report.repeatedMistakes.map((item) => (
                <article key={`${item.paperId}/${item.questionId}`} className="in-repeated">
                  <div className="in-repeated-top">
                    <div>
                      <span className="tag tag-neutral">{item.typeLabel}</span>
                      <h3>
                        {item.paperTitle} · 第 {item.questionNumber} 题
                      </h3>
                    </div>
                    <div className="in-repeated-count">
                      <strong>{item.wrongCount}</strong>
                      <span>次答错 / {item.seenCount} 次记录</span>
                    </div>
                  </div>
                  <p className="in-question-prompt">{item.prompt}</p>
                  <p className="in-evidence-line">{item.reason}</p>
                  <div className="in-repeated-actions">
                    <span
                      className={`tag ${item.lastOutcome === 'correct' ? 'tag-green' : 'tag-warm'}`}
                    >
                      最近一次
                      {{ correct: '已答对', wrong: '仍答错', skipped: '未作答' }[item.lastOutcome]}
                    </span>
                    {item.lastOutcome !== 'correct' && (
                      <select
                        aria-label={`第 ${item.questionNumber} 题错因`}
                        value=""
                        disabled={Boolean(saving)}
                        onChange={(e) =>
                          void mark(
                            `/attempts/${item.lastAttemptId}/error-reasons`,
                            { questionId: item.questionId, reason: e.target.value },
                            item.questionId,
                          )
                        }
                      >
                        <option value="" disabled>
                          补充最近一次错因
                        </option>
                        {errorReasons.map((reason) => (
                          <option key={reason.id} value={reason.id}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => onOpen(item.lastAttemptId)}
                    >
                      返回答题报告
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <Empty
                title="还没有反复答错的原题"
                illustration="review"
                detail="单次错误仍计入题型统计，重复错题会在这里集中展示。"
              />
            )}
          </section>
          {report.recentAttempts.length > 0 && (
            <section className="in-band">
              <SectionTitle title="最近的练习" />
              {report.recentAttempts.map((attempt) => (
                <button className="in-recent" key={attempt.id} onClick={() => onOpen(attempt.id)}>
                  <span>
                    <strong>{attempt.title}</strong>
                    <small>{dateLabel(attempt.date)}</small>
                  </span>
                  <span>已答正确率 {pct(attempt.accuracy)}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </section>
          )}
        </>
      )}
      {tab === 'words' && (
        <>
          <SectionTitle
            title="这些词，为什么没认出来"
            subtitle="原因来自你的标记；其他判断是待验证的线索，收藏次数不等于遗忘次数。"
          />
          <div className="in-reason-counts">
            {report.vocabulary.reasonCounts.map((reason) => (
              <div key={reason.id}>
                <span>{reason.label}</span>
                <strong>{reason.count}</strong>
              </div>
            ))}
          </div>
          <div className="search-field in-word-search">
            <input
              aria-label="搜索诊断词汇"
              placeholder="搜索单词或释义"
              value={wordQuery}
              onChange={(e) => setWordQuery(e.target.value)}
            />
          </div>
          {words.length ? (
            words.map((word) => (
              <article className="in-word" key={word.id}>
                <div className="in-word-title">
                  <div>
                    <h3>{word.word}</h3>
                    <p>{word.definition}</p>
                  </div>
                  <select
                    aria-label={`${word.word} 不认识的原因`}
                    value={word.reason}
                    disabled={Boolean(saving)}
                    onChange={(e) =>
                      void mark(`/words/${word.id}`, { reason: e.target.value }, word.id)
                    }
                  >
                    {wordReasons.map((reason) => (
                      <option key={reason.id} value={reason.id}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="in-word-counts">
                  <span>
                    期间收录 / 查询 <b>{word.encounterCount}</b> 次
                  </span>
                  <span>
                    自评复习 <b>{word.reviewCount}</b> 次
                  </span>
                  <span>
                    没记住 <b>{word.forgotCount}</b> 次
                  </span>
                  <span>
                    相关错题记录 <b>{word.linkedMistakes}</b> 条
                  </span>
                </div>
                {word.context && <blockquote>{word.context}</blockquote>}
                <p className="in-word-hypothesis">{word.hypothesis}</p>
                <div className="in-action">
                  <Target size={15} />
                  <span>{word.recommendation}</span>
                </div>
                <details className="in-word-signals">
                  <summary>查看已有记录</summary>
                  <ul>
                    {word.signals.map((signal) => (
                      <li key={signal}>{signal}</li>
                    ))}
                  </ul>
                </details>
              </article>
            ))
          ) : (
            <Empty
              title={summary.vocabularyCount ? '没有匹配的词' : '单词本还没有收录词汇'}
              illustration={summary.vocabularyCount ? 'search' : 'words'}
              detail="单词原因标记和复习记录会成为分析依据。"
            />
          )}
        </>
      )}
      {tab === 'ai' && (
        <>
          <div className="in-ai-status">
            <div className="in-ai-icon">
              <BrainCircuit size={25} strokeWidth={1.5} />
            </div>
            <div>
              <h2>AI 学习建议</h2>
              <p>
                {config?.model
                  ? `${config.provider === 'ollama' ? '本机 Ollama' : '兼容 API'} · ${config.model}`
                  : '模型尚未配置'}
                {job?.status === 'completed' ? ` · 报告模型 ${job.model}` : ''}
              </p>
            </div>
            <button className="text-button" onClick={() => setSettings(true)} disabled={!config}>
              <Settings2 size={15} />
              模型设置
            </button>
          </div>
          <p className="in-ai-scope">
            AI
            根据统计摘要、部分错题和生词语境提出可能原因与验证练习。生成的解释不等于已证实的原因。
          </p>
          {historyOptions.length > 0 && (
            <label className="in-history-label">
              分析记录
              <select
                aria-label="分析记录"
                value={job?.id || ''}
                onChange={async (event) => {
                  try {
                    const value = await api<{ job: AiJob }>(`/insights/ai/${event.target.value}`);
                    setJob(value.job);
                  } catch (reason) {
                    setError((reason as Error).message);
                  }
                }}
              >
                {!job && <option value="">选择已保存的分析</option>}
                {historyOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {dateLabel(item.createdAt)} · {item.model} ·{' '}
                    {
                      {
                        queued: '等待中',
                        running: '分析中',
                        completed: '已完成',
                        failed: '未完成',
                      }[item.status]
                    }
                  </option>
                ))}
              </select>
              <small>最近 30 份，生成失败不会删除此前报告。</small>
            </label>
          )}
          {busy && (
            <div className="in-ai-progress" role="status">
              <Sparkles size={20} />
              <div>
                <strong>正在整理你的学习记录</strong>
                <p>分析任务会保留，离开此页面也可以稍后回来查看。</p>
              </div>
              <div className="in-progress-line" />
            </div>
          )}
          {job?.status === 'failed' && (
            <div className="in-ai-error" role="alert">
              <strong>本次 AI 分析未完成</strong>
              <p>{job.error}</p>
              <button className="btn btn-secondary" onClick={() => void generate()} disabled={busy}>
                <RefreshCw size={15} />
                重新生成
              </button>
            </div>
          )}
          {!job && !busy && (
            <Empty
              title={config?.model ? '准备好生成你的学习分析' : '连接你的 AI 服务'}
              illustration="insights"
              detail={
                config?.model
                  ? '报告会引用已有证据，并整理针对性的练习计划。'
                  : '在模型设置中填写兼容 API 的服务地址、模型和密钥。'
              }
              action={config?.model ? undefined : '打开模型设置'}
              onAction={() => setSettings(true)}
            />
          )}
          {job?.status === 'completed' && job.result && (
            <div className="in-ai-report">
              {stale && (
                <div className="in-notice in-stale">
                  <RefreshCw size={18} />
                  <div>
                    <strong>旧报告 · 数据已更新</strong>
                    <p>下面保留的是生成时的解读与证据快照，请重新分析最新记录。</p>
                  </div>
                </div>
              )}
              <div className="in-ai-report-head">
                <span className="tag tag-green">AI 解读 · 待验证</span>
                <span>{dateLabel(job.finishedAt || job.createdAt)}</span>
              </div>
              <p className="in-ai-overview">{job.result.overview}</p>
              {job.result.findings.map((finding, index) => (
                <article className="in-ai-finding" key={`${finding.title}-${index}`}>
                  <h3>{finding.title}</h3>
                  <p>{finding.analysis}</p>
                  <button className="text-button" onClick={() => showEvidence(finding.evidenceIds)}>
                    <FileSearch size={15} />
                    查看依据 · {finding.evidenceIds.length} 条
                  </button>
                  <ul>
                    {finding.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </article>
              ))}
              {job.result.vocabulary.length > 0 && (
                <section className="in-band">
                  <SectionTitle title="词汇困难的可能原因" />
                  {job.result.vocabulary.map((word) => (
                    <article className="in-ai-finding" key={word.word}>
                      <h3>{word.word}</h3>
                      <p>{word.possibleReason}</p>
                      <button
                        className="text-button"
                        onClick={() => showEvidence(word.evidenceIds)}
                      >
                        <FileSearch size={15} />
                        查看词汇依据
                      </button>
                      <div className="in-action">
                        <Target size={15} />
                        <span>{word.exercise}</span>
                      </div>
                    </article>
                  ))}
                </section>
              )}
              <section className="in-band">
                <SectionTitle
                  title="接下来的练习安排"
                  subtitle="按顺序完成，再用新题检验是否改善。"
                />
                <div className="in-plan">
                  {job.result.plan.map((day) => (
                    <article key={day.day}>
                      <span className="in-plan-day">第 {day.day} 天</span>
                      <div>
                        <h3>{day.title}</h3>
                        <ul>
                          {day.tasks.map((task) => (
                            <li key={task}>{task}</li>
                          ))}
                        </ul>
                      </div>
                      <span className="in-plan-minutes">
                        <Timer size={14} />
                        {day.minutes} 分钟
                      </span>
                    </article>
                  ))}
                </div>
              </section>
              <details className="in-methodology">
                <summary>这份 AI 解读的适用范围</summary>
                <ul>
                  {job.result.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </>
      )}
      <details className="in-methodology">
        <summary>统计口径与数据范围</summary>
        <ul>
          {report.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
      {settings && config && (
        <ModelSettings
          initial={config}
          onClose={() => setSettings(false)}
          onSaved={(value) => {
            setConfig(value);
            setSettings(false);
            setError('');
            notify('模型设置已保存');
          }}
        />
      )}
      {evidence && (
        <Modal title="分析依据" onClose={() => setEvidence(null)} wide>
          <p className="in-form-note">以下是报告生成时引用的统计或记录快照。</p>
          {evidence.map((item) => (
            <div className="in-source" key={item.id}>
              <span>{item.id}</span>
              <p>{item.text}</p>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
