import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  Headphones,
  PenLine,
  Plus,
  Search,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { Attempt, Paper, Workspace } from './types';
import { Empty, PageHeading } from './components';
import { Illustration } from './Illustration';

export function speakWord(word: string, notify: (message: string) => void) {
  if (!('speechSynthesis' in window)) return notify('当前浏览器不支持朗读');
  speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(word);
  speech.lang = 'en-US';
  speech.rate = 0.85;
  speech.onerror = () => notify('朗读暂不可用，请检查浏览器语音设置');
  speechSynthesis.speak(speech);
}

export default function Papers({
  data,
  onStart,
  onImport,
  onSource,
  onOpen,
  onWord,
  onView,
  notify,
}: {
  data: Workspace;
  onStart: (paper: Paper) => void;
  onImport: () => void;
  onSource: (paper: Paper) => void;
  onOpen: (attempt: Attempt) => void;
  onWord: (word: string, context?: string) => Promise<void>;
  onView: (view: 'words' | 'history' | 'mistakes') => void;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const papers = data.papers.filter(
    (p) =>
      (filter === 'all' || p.kind === filter) &&
      (year === 'all' || String(p.year) === year) &&
      `${p.title} ${p.subtitle} ${p.year}`.toLowerCase().includes(query.toLowerCase()),
  );
  const submitted = data.attempts.filter((a) => a.status === 'submitted');
  const active = data.attempts.find((a) => a.status === 'active');
  const firstAvailable = data.papers.find((p) => p.available);
  const minutes = Math.floor(
    data.attempts.reduce(
      (sum, a) => sum + Object.values(a.sectionSpent).reduce((x, y) => x + y, 0),
      0,
    ) / 60,
  );
  const mistakes = submitted.reduce(
    (sum, a) => sum + (a.result?.items.filter((q) => q.correct === false).length || 0),
    0,
  );
  const saved = data.words.some((w) => w.word === 'serendipity');
  return (
    <>
      <PageHeading title="真题练习" subtitle="大学英语六级 CET-6" illustration="reading">
        <button className="btn btn-secondary" onClick={onImport}>
          <ArrowDownToLine size={16} />
          导入试卷
        </button>
        <button
          className="btn btn-primary"
          disabled={!firstAvailable && !active}
          onClick={() => (active ? onOpen(active) : firstAvailable && onStart(firstAvailable))}
        >
          {active ? '继续练习' : '开始练习'}
          <ArrowRight size={17} />
        </button>
      </PageHeading>
      <div className="stats-band">
        {[
          { label: '已完成试卷', value: submitted.length, unit: '份', view: 'history' as const },
          { label: '累计学习', value: minutes, unit: '分钟', view: 'history' as const },
          { label: '错题待复盘', value: mistakes, unit: '题', view: 'mistakes' as const },
          { label: '收录单词', value: data.words.length, unit: '个', view: 'words' as const },
        ].map((item) => (
          <button className="stat" key={item.label} onClick={() => onView(item.view)}>
            <span>{item.label}</span>
            <div>
              <strong>{item.value}</strong>
              <small>{item.unit}</small>
            </div>
          </button>
        ))}
      </div>
      <div className="library-layout">
        <section className="paper-library">
          <div className="section-heading">
            <h2>全部试卷</h2>
            <span className="muted small">{data.papers.length} 份试卷</span>
          </div>
          <div className="filter-row">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="搜索试卷"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索试卷名称、年份或关键词"
              />
            </div>
            <div className="select-wrap">
              <select aria-label="筛选年份" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="all">全部年份</option>
                {[...new Set(data.papers.map((p) => p.year))]
                  .sort((a, b) => b - a)
                  .map((y) => (
                    <option key={y}>{y}</option>
                  ))}
              </select>
              <ChevronDown size={15} />
            </div>
          </div>
          <div className="tabs" role="tablist" aria-label="试卷类型">
            {[
              { id: 'all', label: '全部' },
              { id: 'past', label: '历年真题' },
              { id: 'practice', label: '模拟练习' },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={filter === t.id}
                onClick={() => setFilter(t.id)}
                className={filter === t.id ? 'active' : ''}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="paper-list">
            {papers.map((paper, index) => {
              const ongoing = data.attempts.find(
                (a) => a.paperId === paper.id && a.status === 'active',
              );
              const completed = submitted.filter((a) => a.paperId === paper.id);
              return (
                <article
                  className={`paper-row ${paper.available ? 'paper-available' : ''}`}
                  key={paper.id}
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="paper-icon">
                    <FileText size={26} strokeWidth={1.4} />
                    <span>
                      {paper.document ? 'PDF' : paper.kind === 'practice' ? 'CET 6' : paper.year}
                    </span>
                  </div>
                  <div className="paper-info">
                    <div className="paper-title">
                      <h3>{paper.title}</h3>
                      <span
                        className={`tag ${paper.kind === 'practice' ? 'tag-warm' : 'tag-neutral'}`}
                      >
                        {paper.document
                          ? 'PDF 试卷'
                          : paper.kind === 'practice'
                            ? '原创练习'
                            : paper.available
                              ? '历年真题'
                              : '来源资料'}
                      </span>
                    </div>
                    <p>{paper.subtitle || '写作 · 听力 · 阅读 · 翻译'}</p>
                    <div className="paper-meta">
                      <span>
                        <Clock3 size={13} />
                        {paper.durationMinutes} 分钟
                      </span>
                      <span>
                        {paper.available ? `${paper.questionCount || 57} 题` : '需导入题目'}
                      </span>
                      {completed.length > 0 && (
                        <span className="text-green">
                          <Check size={13} />
                          已完成 {completed.length} 次
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className={`btn btn-small ${paper.available ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() =>
                      ongoing ? onOpen(ongoing) : paper.available ? onStart(paper) : onSource(paper)
                    }
                  >
                    {ongoing ? '继续练习' : paper.available ? '开始练习' : '查看来源'}
                    {paper.available ? <ArrowRight size={15} /> : <ExternalLink size={14} />}
                  </button>
                </article>
              );
            })}
            {papers.length === 0 && (
              <Empty
                title="没有匹配的试卷"
                detail="试试其他关键词或年份。"
                action="清除筛选"
                onAction={() => {
                  setQuery('');
                  setYear('all');
                  setFilter('all');
                }}
              />
            )}
          </div>
          <div className="list-footer">
            <span>共 {papers.length} 份试卷</span>
            <span className="page-current">1</span>
          </div>
        </section>
        <aside className="study-rail">
          <section className="daily-word">
            <div className="section-heading">
              <h2>今日词汇</h2>
              <Sparkles size={16} className="muted" />
            </div>
            <Illustration kind="words" size="rail" />
            <div className="word-heading">
              <h3>serendipity</h3>
              <button
                className="icon-button text-green"
                aria-label="朗读 serendipity"
                title="朗读单词"
                onClick={() => speakWord('serendipity', notify)}
              >
                <Volume2 size={18} />
              </button>
            </div>
            <p className="phonetic">/ˌser.ənˈdɪp.ə.ti/</p>
            <p className="word-definition">n. 意外发现美好事物的幸运</p>
            <p className="word-example">A little curiosity can lead to a moment of serendipity.</p>
            <button
              className="btn btn-secondary word-add"
              disabled={adding || saved}
              onClick={async () => {
                setAdding(true);
                try {
                  await onWord(
                    'serendipity',
                    'A little curiosity can lead to a moment of serendipity.',
                  );
                } catch {
                  /* The shared word handler reports the error. */
                } finally {
                  setAdding(false);
                }
              }}
            >
              {saved ? <Check size={17} /> : <Plus size={17} />}
              {saved ? '已加入单词本' : adding ? '正在收录' : '加入单词本'}
            </button>
          </section>
          <section className="practice-plan">
            <div className="section-heading">
              <h2>练习时间安排</h2>
            </div>
            {[
              { icon: PenLine, name: '写作', en: 'Writing', min: 30 },
              { icon: Headphones, name: '听力', en: 'Listening', min: 30 },
              { icon: BookOpen, name: '阅读', en: 'Reading', min: 40 },
              { icon: FileText, name: '翻译', en: 'Translation', min: 30 },
            ].map(({ icon: Icon, name, en, min }) => (
              <div className="plan-row" key={name}>
                <Icon size={17} />
                <span>
                  {name}
                  <small>{en}</small>
                </span>
                <strong>
                  {min}
                  <small> 分钟</small>
                </strong>
              </div>
            ))}
            <div className="plan-total">
              <span>总时长</span>
              <strong>130 分钟</strong>
            </div>
          </section>
          <div className="rail-note">
            <span className="tiny-line" />A word a day.
            <br />A little further, every day.
          </div>
        </aside>
      </div>
    </>
  );
}
