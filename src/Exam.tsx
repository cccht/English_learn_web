import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  Loader2,
  Pause,
  Play,
  Send,
  Volume2,
  X,
  LayoutGrid,
  Monitor,
  Tablet,
  Smartphone,
  PenLine,
} from 'lucide-react';
import { duration, patch, post } from './api';
import type { Group, Question, Session } from './types';
import { errorReasons } from './insight-types';
import WordText from './WordText';
import Notebook from './Notebook';
import { articleText, type NotebookHandle } from './note-types';
import { useExamLayout, type DisplayMode } from './useExamLayout';
import { Modal } from './components';
import { Illustration } from './Illustration';
import './exam.css';
import './exam-layout.css';

type Props = {
  session: Session;
  onSession: (session: Session) => void;
  onExit: () => void;
  onWord: (word: string, context: string) => Promise<unknown>;
  notify: (message: string) => void;
};

function storedText(values: Record<string, string>, id: string): string {
  const value = Object.hasOwn(values, id) ? values[id] : undefined;
  return typeof value === 'string' ? value : '';
}

function storedSeconds(values: Record<string, number>, id: string): number {
  const value = Object.hasOwn(values, id) ? values[id] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const draftKey = (session: Session) =>
  `cet6-draft:${session.user?.id || 'admin'}:${session.attempt.id}`;
function readDraft(session: Session) {
  try {
    const raw =
      localStorage.getItem(draftKey(session)) ||
      (!session.user || session.user.id === 'admin'
        ? localStorage.getItem(`cet6-draft:${session.attempt.id}`)
        : null);
    const draft = JSON.parse(raw || 'null');
    if (
      draft?.answers &&
      typeof draft.answers === 'object' &&
      !Array.isArray(draft.answers) &&
      Object.values(draft.answers).every((value) => typeof value === 'string') &&
      session.attempt.status === 'active'
    )
      return draft as {
        answers: Record<string, string>;
        currentSection: string;
        currentGroup?: string;
      };
  } catch {
    /* A damaged local draft must not hide the server copy. */
  }
  return {
    answers: session.attempt.answers,
    currentSection: session.attempt.currentSection,
    currentGroup: session.attempt.currentGroup,
  };
}

function Listening({ group }: { group: Group }) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [rate, setRate] = useState(1.0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    setPlaying(false);
    setError('');
    setRate(1.0);
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [group.id, supported]);

  const seek = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + delta));
  };

  const changeRate = (newRate: number) => {
    setRate(newRate);
    if (audioRef.current) audioRef.current.playbackRate = newRate;
  };

  useEffect(() => {
    if (!group.audioUrl) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        seek(-5);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        seek(5);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        if (audio.paused) {
          void audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [group.audioUrl]);

  const play = () => {
    if (!supported || !group.transcript) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(group.transcript);
    speech.lang = 'en-US';
    speech.rate = 0.9;
    speech.onstart = () => setPlaying(true);
    speech.onend = () => setPlaying(false);
    speech.onerror = (event) => {
      setPlaying(false);
      if (event.error !== 'interrupted' && event.error !== 'canceled')
        setError('当前设备暂时无法朗读，请稍后重试。');
    };
    setError('');
    window.speechSynthesis.speak(speech);
  };
  return (
    <div className="ex-audio">
      <span className="ex-audio-icon">
        <Volume2 size={22} />
      </span>
      <div className="ex-audio-label">
        <strong>{group.audioUrl ? '听力音频' : '合成朗读'}</strong>
        <span>{group.audioUrl ? '本组听力材料' : '英语语音合成'}</span>
      </div>
      {group.audioUrl ? (
        <>
          <audio
            ref={audioRef}
            controls
            src={group.audioUrl}
            preload="metadata"
            onError={() => setError('听力音频加载失败，请检查音频链接或网络后重试。')}
            onCanPlay={() => {
              setError('');
              if (audioRef.current) audioRef.current.playbackRate = rate;
            }}
          />
          <div className="ex-audio-tools">
            <button
              type="button"
              className="ex-audio-btn"
              onClick={() => seek(-5)}
              title="回退 5 秒 (快捷键: J)"
            >
              -5s
            </button>
            <button
              type="button"
              className="ex-audio-btn"
              onClick={() => seek(5)}
              title="快进 5 秒 (快捷键: L)"
            >
              +5s
            </button>
            <select
              className="ex-audio-rate"
              value={rate}
              onChange={(e) => changeRate(parseFloat(e.target.value))}
              aria-label="播放倍速"
              title="播放倍速"
            >
              <option value="0.8">0.8x</option>
              <option value="1">1.0x</option>
              <option value="1.2">1.2x</option>
              <option value="1.5">1.5x</option>
            </select>
          </div>
        </>
      ) : group.transcript && supported ? (
        <button
          className="icon-button"
          aria-label={playing ? '停止朗读' : '播放合成朗读'}
          onClick={play}
        >
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
      ) : (
        <span className="muted">{!supported ? '此浏览器不支持语音合成' : '暂无听力音频'}</span>
      )}
      {error && <p className="ex-error">{error}</p>}
    </div>
  );
}

function TextAnswer({
  question,
  value,
  onChange,
  disabled,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const count = (value.match(/\b[A-Za-z]+(?:['-][A-Za-z]+)*\b/g) || []).length;
  return (
    <div className="ex-writing">
      <label className="ex-answer-label" htmlFor={`answer-${question.id}`}>
        我的作答<span>{question.weight} 分</span>
      </label>
      <textarea
        id={`answer-${question.id}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        maxLength={30000}
        placeholder="Write your answer here..."
        spellCheck
        lang="en"
      />
      <div className="ex-writing-footer">
        <span>英文单词数</span>
        <strong>{count}</strong>
      </div>
    </div>
  );
}

function Review({ session, onSession, onExit, onWord, notify }: Props) {
  const [noteGroup, setNoteGroup] = useState<Group | null>(null);
  const reviewNotebook = useRef<NotebookHandle>(null);
  const [reasonSaving, setReasonSaving] = useState('');
  async function saveReason(questionId: string, reason: string) {
    setReasonSaving(questionId);
    try {
      const next = await patch<Session>(`/attempts/${session.attempt.id}/error-reasons`, {
        questionId,
        reason,
      });
      onSession(next);
      notify('错因已记录，学习诊断会同步更新');
    } catch (error) {
      notify(error instanceof Error ? error.message : '错因保存失败');
    } finally {
      setReasonSaving('');
    }
  }
  const [filter, setFilter] = useState<'mistakes' | 'all' | 'writing'>('mistakes');
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (session.attempt.result?.items || [])
        .filter((item) => item.correct === null && item.score !== null)
        .map((item) => [item.questionId, String(item.score)]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const result = session.attempt.result;
  const sections = session.paper.sections || [];
  const questions = new Map(
    sections.flatMap((section) =>
      section.groups.flatMap((group) =>
        group.questions.map((question) => [question.id, { question, group, section }] as const),
      ),
    ),
  );
  if (!result)
    return (
      <div className="ex-empty">
        <CircleAlert size={30} />
        <h2>成绩暂时不可用</h2>
        <button className="btn btn-secondary" onClick={onExit}>
          返回试卷库
        </button>
      </div>
    );
  const subjective = result.items.filter((item) => item.correct === null);
  const hasManualChoice = subjective.some(
    (item) => questions.get(item.questionId)?.question.type === 'choice',
  );
  const filtered = result.items.filter(
    (item) =>
      filter === 'all' || (filter === 'writing' ? item.correct === null : item.correct === false),
  );
  const wrongCount = result.items.filter((item) => item.correct === false).length;
  const saveScores = async () => {
    const values: Record<string, number> = {};
    for (const item of subjective) {
      const input = storedText(scores, item.questionId);
      if (input === undefined || input.trim() === '') {
        setError('请填写每道需人工评分题目的分数。');
        return;
      }
      const score = Number(input);
      if (!Number.isFinite(score) || score < 0 || score > item.maxScore) {
        setError(`第 ${item.number} 题的自评分须在 0 至 ${item.maxScore} 分之间。`);
        return;
      }
      values[item.questionId] = score;
    }
    setSaving(true);
    setError('');
    try {
      const next = await post<Session>(`/attempts/${session.attempt.id}/self-grade`, {
        scores: values,
      });
      onSession(next);
      notify('自评分已保存');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '自评分保存失败');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="ex-shell ex-review">
      <header className="ex-top">
        <button className="icon-button" onClick={onExit} aria-label="返回试卷库">
          <ArrowLeft size={21} />
        </button>
        <div className="ex-title">
          <span>练习报告</span>
          <h1>{session.paper.title}</h1>
        </div>
        <span className="ex-finished">
          <CheckCircle2 size={16} />
          已交卷
        </span>
      </header>
      <div className="ex-review-main">
        <div className="ex-report-heading">
          <div>
            <span className="ex-eyebrow">YOUR PROGRESS</span>
            <h2>每一次练习，都更进一步。</h2>
            <p>
              完成于{' '}
              {new Date(session.attempt.submittedAt || session.attempt.startedAt).toLocaleString(
                'zh-CN',
              )}
            </p>
          </div>
          <Illustration kind="review" size="report" priority />
        </div>
        <div className="ex-score-band">
          <div>
            <span>客观题得分</span>
            <strong>
              {result.objectiveScore.toFixed(1)}
              <small> / {result.objectiveMax}</small>
            </strong>
          </div>
          <div>
            <span>客观题正确</span>
            <strong>
              {result.correctCount}
              <small> / {result.questionCount} 题</small>
            </strong>
          </div>
          <div>
            <span>综合自评</span>
            <strong>
              {result.totalScore === null ? '待自评' : result.totalScore.toFixed(1)}
              <small>{result.totalScore === null ? '' : ' / 100'}</small>
            </strong>
          </div>
          <div>
            <span>换算参考 · 非官方报道分</span>
            <strong>
              {result.estimated710 === null ? '--' : Math.round(result.estimated710)}
              <small> / 710</small>
            </strong>
          </div>
        </div>
        <div className="ex-time-summary">
          {sections.map((section) => (
            <div key={section.id}>
              <Clock3 size={15} />
              <span>{section.title}</span>
              <strong>{duration(storedSeconds(session.attempt.sectionSpent, section.id))}</strong>
            </div>
          ))}
        </div>
        {result.subjectiveScore === null && (
          <div className="ex-subjective-note">
            <CircleAlert size={17} />
            <span>
              {hasManualChoice
                ? '部分题目没有可自动核验的答案，需要人工评分；未评分前不生成总分。'
                : '作文与翻译尚待评阅。对照参考答案完成自评后，将得到包含主观题的练习估分。'}
            </span>
            <button onClick={() => setFilter('writing')}>
              去自评 <ArrowRight size={15} />
            </button>
          </div>
        )}
        <div className="ex-review-tabs" role="tablist" aria-label="解析筛选">
          <button
            role="tab"
            aria-selected={filter === 'mistakes'}
            className={filter === 'mistakes' ? 'active' : ''}
            onClick={() => setFilter('mistakes')}
          >
            错题解析 <span>{wrongCount}</span>
          </button>
          <button
            role="tab"
            aria-selected={filter === 'all'}
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            全部题目 <span>{result.items.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={filter === 'writing'}
            className={filter === 'writing' ? 'active' : ''}
            onClick={() => setFilter('writing')}
          >
            {hasManualChoice ? '人工评分' : '写作与翻译'}
          </button>
        </div>
        {filtered.length === 0 && (
          <div className="ex-empty">
            <CheckCircle2 size={36} />
            <h3>这一页没有错题</h3>
            <p>可以切换到全部题目，继续回顾本次练习。</p>
          </div>
        )}
        <div className="ex-review-list">
          {filtered.map((item) => {
            const entry = questions.get(item.questionId);
            if (!entry) return null;
            const { question, group, section } = entry;
            const choiceText = (value?: string) =>
              value
                ? `${value}. ${question.options?.find((option) => option.id === value)?.text || ''}`
                : '未作答';
            return (
              <article className="ex-review-item" key={item.questionId}>
                <div className="ex-review-item-heading">
                  <span
                    className={`ex-question-number ${item.correct === false ? 'incorrect' : item.correct === true ? 'correct' : ''}`}
                  >
                    {item.number}
                  </span>
                  <span>
                    {section.title} · {group.title}
                  </span>
                  <strong className={item.correct === false ? 'ex-wrong' : ''}>
                    {item.correct === null
                      ? item.score === null
                        ? '待自评'
                        : `自评 ${item.score} / ${item.maxScore} 分`
                      : `${item.score} / ${item.maxScore} 分`}
                  </strong>
                </div>
                <p className="ex-review-prompt">
                  <WordText text={question.prompt} onWord={onWord} />
                </p>
                {item.correct === false && (
                  <div className="vocab-reason">
                    <label htmlFor={`error-reason-${item.questionId}`}>
                      {item.answer ? '这次为什么做错' : '这次为什么没作答'}
                    </label>
                    <select
                      id={`error-reason-${item.questionId}`}
                      value={
                        storedText(session.attempt.errorReasons || {}, item.questionId) || 'unknown'
                      }
                      onChange={(event) => void saveReason(item.questionId, event.target.value)}
                      disabled={Boolean(reasonSaving)}
                    >
                      {errorReasons.map((reason) => (
                        <option key={reason.id} value={reason.id}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {question.type === 'choice' ? (
                  <div className="ex-comparison">
                    <div
                      className={
                        item.correct === true
                          ? 'ex-correct-box'
                          : item.correct === false
                            ? 'ex-wrong-box'
                            : ''
                      }
                    >
                      <span>我的答案</span>
                      <p>
                        <WordText text={choiceText(item.answer)} onWord={onWord} />
                      </p>
                    </div>
                    <div>
                      <span>{item.correct === null ? '答案状态' : '正确答案'}</span>
                      <p>
                        <WordText
                          text={
                            item.correct === null && !item.expected
                              ? '原题未提供标准答案，待人工核对'
                              : choiceText(item.expected)
                          }
                          onWord={onWord}
                        />
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="ex-subjective-answer">
                    <span className="ex-mini-label">我的作答</span>
                    <p>{item.answer || '未作答'}</p>
                  </div>
                )}
                {(item.explanation || item.feedback) && (
                  <div className="ex-explanation">
                    <span className="ex-mini-label">答案解析</span>
                    <p>
                      <WordText text={item.explanation || item.feedback || ''} onWord={onWord} />
                    </p>
                  </div>
                )}
                {(item.referenceAnswer || question.referenceAnswer) && (
                  <div className="ex-reference">
                    <span className="ex-mini-label">参考答案</span>
                    <p>
                      <WordText
                        text={item.referenceAnswer || question.referenceAnswer || ''}
                        onWord={onWord}
                      />
                    </p>
                  </div>
                )}
                {(group.passage || group.transcript) && (
                  <details className="ex-original">
                    <summary>查看{group.transcript ? '听力原文' : '阅读原文'}</summary>
                    <p className="ex-passage">
                      <WordText text={group.passage || group.transcript || ''} onWord={onWord} />
                    </p>
                  </details>
                )}
                {item.correct === null && (
                  <div className="ex-self-score">
                    <label htmlFor={`score-${item.questionId}`}>我的自评分</label>
                    <input
                      id={`score-${item.questionId}`}
                      type="number"
                      min="0"
                      max={item.maxScore}
                      step="0.5"
                      inputMode="decimal"
                      value={storedText(scores, item.questionId)}
                      onChange={(event) =>
                        setScores((previous) => ({
                          ...previous,
                          [item.questionId]: event.target.value,
                        }))
                      }
                    />
                    <span>/ {item.maxScore} 分</span>
                  </div>
                )}
                <button className="ex-note-open" onClick={() => setNoteGroup(group)}>
                  <PenLine size={16} />
                  查看文章与批注
                </button>
              </article>
            );
          })}
        </div>
        {(filter === 'writing' || filter === 'all') && subjective.length > 0 && (
          <div className="ex-self-submit">
            <p>自评用于学习反馈；710 分仅按练习得分比例换算，非官方报道分。</p>
            {error && (
              <p className="ex-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary" disabled={saving} onClick={() => void saveScores()}>
              {saving ? <Loader2 className="ex-spin" size={17} /> : <Check size={17} />}
              {hasManualChoice ? '保存人工评分' : '保存主观题自评分'}
            </button>
          </div>
        )}
        {noteGroup && (
          <Modal
            title={noteGroup.title + ' · 批注'}
            wide
            onClose={() => {
              void (async () => {
                if (!reviewNotebook.current || (await reviewNotebook.current.flush()))
                  setNoteGroup(null);
                else notify('批注尚未保存，请先导出或重试。');
              })();
            }}
          >
            <div className="nk-modal">
              <Notebook
                ref={reviewNotebook}
                key={noteGroup.id}
                userId={session.user?.id || 'admin'}
                attemptId={session.attempt.id}
                groupId={noteGroup.id}
                text={articleText(noteGroup)}
                title={noteGroup.title}
                onWord={onWord}
                notify={notify}
              />
            </div>
          </Modal>
        )}
        <footer className="ex-report-footer">
          <a className="btn btn-primary" href="#insights">
            查看学习诊断
            <ArrowRight size={17} />
          </a>
          <button className="btn btn-secondary" onClick={onExit}>
            <ArrowLeft size={17} />
            返回试卷库
          </button>
          <span>已收藏的词汇可在单词本中复习与导出</span>
        </footer>
      </div>
    </div>
  );
}

export default function Exam(props: Props) {
  const { session, onSession, onExit, onWord, notify } = props;
  const sections = session.paper.sections || [];
  const initialDraft = useRef(readDraft(session));
  const [answers, setAnswers] = useState<Record<string, string>>(initialDraft.current.answers);
  const [sectionId, setSectionId] = useState(
    initialDraft.current.currentSection || sections[0]?.id || '',
  );
  const [groupIndex, setGroupIndex] = useState(() =>
    Math.max(
      0,
      sections
        .find((section) => section.id === initialDraft.current.currentSection)
        ?.groups.findIndex((group) => group.id === initialDraft.current.currentGroup) ?? 0,
    ),
  );
  const layout = useExamLayout(session.user?.id || 'admin');
  const [phonePanel, setPhonePanel] = useState<'article' | 'answers'>('article');
  const [answerCard, setAnswerCard] = useState(false);
  const [switching, setSwitching] = useState(false);
  const notebook = useRef<NotebookHandle>(null);
  const answerPanel = useRef<HTMLElement>(null);
  const [now, setNow] = useState(Date.now());
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [timing, setTiming] = useState({
    spent: session.attempt.sectionSpent,
    section: session.attempt.currentSection,
    anchor: Date.now(),
  });
  const answersRef = useRef(answers);
  const sectionRef = useRef(sectionId);
  const groupRef = useRef(
    sections.find((section) => section.id === sectionId)?.groups[groupIndex]?.id || '',
  );
  const latestSession = useRef(session);
  const handlers = useRef({ onSession, onExit, notify });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const expiryHandled = useRef(false);
  const busyRef = useRef(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  handlers.current = { onSession, onExit, notify };
  latestSession.current = session;
  const active = session.attempt.status === 'active';
  const section = sections.find((item) => item.id === sectionId) || sections[0];
  const group = section?.groups[Math.min(groupIndex, section.groups.length - 1)];
  const allQuestions = sections.flatMap((item) => item.groups.flatMap((value) => value.questions));
  const doneCount = allQuestions.filter((question) =>
    Boolean(storedText(answers, question.id).trim()),
  ).length;
  const remaining = Math.max(
    0,
    Math.ceil((new Date(session.attempt.deadlineAt).getTime() - now) / 1000),
  );
  const spent = (id: string) =>
    storedSeconds(timing.spent, id) +
    (active && timing.section === id ? Math.max(0, (now - timing.anchor) / 1000) : 0);

  const storeDraft = useCallback(() => {
    try {
      localStorage.setItem(
        draftKey(latestSession.current),
        JSON.stringify({
          answers: answersRef.current,
          currentSection: sectionRef.current,
          currentGroup: groupRef.current,
        }),
      );
    } catch {
      /* Server saving remains available when browser storage is full. */
    }
  }, []);

  const save = useCallback(() => {
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        if (latestSession.current.attempt.status !== 'active') return;
        if (mounted.current) setSaveState('saving');
        const snapshot = answersRef.current;
        const savedSection = sectionRef.current;
        const savedGroup = groupRef.current;
        try {
          const next = await patch<Session>(`/attempts/${latestSession.current.attempt.id}`, {
            answers: snapshot,
            currentSection: savedSection,
            currentGroup: savedGroup,
          });
          if (!mounted.current) return;
          latestSession.current = next;
          setTiming({
            spent: next.attempt.sectionSpent,
            section: next.attempt.currentSection,
            anchor: Date.now(),
          });
          handlers.current.onSession(next);
          if (next.attempt.status === 'submitted') window.scrollTo({ top: 0, behavior: 'auto' });
          setSaveState(
            snapshot === answersRef.current &&
              savedSection === sectionRef.current &&
              savedGroup === groupRef.current
              ? 'saved'
              : 'dirty',
          );
          setError('');
        } catch (reason) {
          if (mounted.current) {
            setSaveState('error');
            setError(reason instanceof Error ? reason.message : '保存失败，本地草稿已保留');
          }
          throw reason;
        }
      });
    queue.current = task;
    return task;
  }, []);

  const submit = useCallback(async (automatic = false) => {
    if (busyRef.current || latestSession.current.attempt.status !== 'active') return;
    busyRef.current = true;
    setSubmitting(true);
    setError('');
    setConfirmOpen(false);
    try {
      await queue.current.catch(() => {});
      if (notebook.current && !(await notebook.current.flush()))
        throw new Error('批注尚未保存，请重试或先导出批注。');
      const next = await post<Session>(`/attempts/${latestSession.current.attempt.id}/submit`, {
        answers: answersRef.current,
      });
      latestSession.current = next;
      try {
        localStorage.removeItem(draftKey(next));
        if (!next.user || next.user.id === 'admin')
          localStorage.removeItem(`cet6-draft:${next.attempt.id}`);
      } catch {
        /* Submitted results are stored on the server. */
      }
      handlers.current.onSession(next);
      window.scrollTo({ top: 0, behavior: 'auto' });
      handlers.current.notify(
        automatic ? '考试时间已到，试卷已自动提交' : '交卷成功，练习报告已生成',
      );
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '交卷失败，答案已保留，请重试');
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const heartbeat = window.setInterval(() => {
      if (!busyRef.current) void save().catch(() => {});
    }, 15000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(heartbeat);
    };
  }, [active, save]);
  useEffect(() => {
    if (!active || busyRef.current) return;
    const debounce = window.setTimeout(() => {
      if (!busyRef.current) void save().catch(() => {});
    }, 800);
    return () => window.clearTimeout(debounce);
  }, [answers, sectionId, active, save]);
  useEffect(() => {
    if (active && remaining <= 1 && !expiryHandled.current) {
      expiryHandled.current = true;
      void submit(true);
    }
  }, [active, remaining, submit]);
  useEffect(() => {
    if (!active) return;
    const flushOnPageExit = () => {
      if (latestSession.current.attempt.status !== 'active') return;
      storeDraft();
      const body = JSON.stringify({
        answers: answersRef.current,
        currentSection: sectionRef.current,
        currentGroup: groupRef.current,
      });
      void fetch(`/api/attempts/${latestSession.current.attempt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      flushOnPageExit();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', flushOnPageExit);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', flushOnPageExit);
    };
  }, [active, storeDraft]);
  useEffect(() => {
    if (confirmOpen) confirmButton.current?.focus();
  }, [confirmOpen]);

  const updateAnswer = (id: string, value: string) => {
    const next = { ...answersRef.current, [id]: value };
    answersRef.current = next;
    setAnswers(next);
    setSaveState('dirty');
    storeDraft();
  };
  const switchSection = async (id: string) => {
    if (switching || busyRef.current) return;
    setSwitching(true);
    if (notebook.current && !(await notebook.current.flush())) {
      notify('批注尚未保存，请先重试或导出。');
      setSwitching(false);
      return;
    }
    sectionRef.current = id;
    groupRef.current = sections.find((section) => section.id === id)!.groups[0].id;
    setSectionId(id);
    setGroupIndex(0);
    setSaveState('dirty');
    storeDraft();
    window.scrollTo({ top: 0, behavior: 'auto' });
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    void save().catch(() => {});
    setSwitching(false);
    answerPanel.current?.scrollTo({ top: 0 });
  };
  const switchGroup = async (index: number, questionId?: string) => {
    if (switching || busyRef.current) return;
    setSwitching(true);
    if (notebook.current && !(await notebook.current.flush())) {
      notify('批注尚未保存，请先重试或导出。');
      setSwitching(false);
      return;
    }
    groupRef.current = section.groups[index].id;
    setGroupIndex(index);
    storeDraft();
    setAnswerCard(false);
    if (questionId) setPhonePanel('answers');
    void save().catch(() => {});
    setSwitching(false);
    requestAnimationFrame(() => {
      const node = questionId ? document.getElementById(`question-${questionId}`) : null;
      if (node && answerPanel.current)
        answerPanel.current.scrollTo({
          top: node.offsetTop - answerPanel.current.offsetTop,
          behavior: 'smooth',
        });
      else answerPanel.current?.scrollTo({ top: 0 });
    });
  };
  const exit = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLeaving(true);
    try {
      storeDraft();
      if (notebook.current && !(await notebook.current.flush())) throw new Error('批注尚未保存');
      await save();
      handlers.current.onExit();
    } catch {
      setError('暂时无法保存到服务器。草稿已留在此设备，网络恢复后请再次返回。');
    } finally {
      busyRef.current = false;
      setLeaving(false);
    }
  };

  if (!active) return <Review {...props} />;
  if (!section || !group)
    return (
      <div className="ex-empty">
        <CircleAlert size={32} />
        <h2>这份试卷还没有题目</h2>
        <button className="btn btn-secondary" onClick={onExit}>
          返回试卷库
        </button>
      </div>
    );
  const blocked = submitting || leaving || switching || remaining <= 1;
  const questionsInSection = section.groups.flatMap((item) => item.questions);
  return (
    <div
      className={'ex-shell ex-active ex-layout-' + layout.mode}
      style={{ height: layout.height }}
      data-device-mode={layout.mode}
    >
      <header className="ex-top">
        <button
          className="icon-button"
          onClick={() => void exit()}
          disabled={submitting || leaving}
          aria-label="保存并返回试卷库"
          title="保存并返回"
        >
          {leaving ? <Loader2 className="ex-spin" size={20} /> : <ArrowLeft size={20} />}
        </button>
        <div className="ex-title">
          <span>
            {session.paper.document
              ? 'PDF 试卷练习'
              : session.paper.kind === 'practice'
                ? '原创全卷练习'
                : '六级真题练习'}
          </span>
          <h1 title={session.paper.title}>{session.paper.title}</h1>
        </div>
        <div className={'ex-countdown ' + (remaining < 300 ? 'urgent' : '')} aria-label="剩余时间">
          <Clock3 size={17} />
          <div>
            <span>剩余时间</span>
            <strong>{duration(remaining)}</strong>
          </div>
        </div>
        <button
          className="btn btn-primary ex-submit-btn"
          disabled={submitting || leaving}
          onClick={() => (remaining === 0 ? void submit() : setConfirmOpen(true))}
        >
          {submitting ? <Loader2 className="ex-spin" size={16} /> : <Send size={16} />}
          <span>{submitting ? '交卷中' : '交卷'}</span>
        </button>
      </header>
      <div className="ex-pinned-status">
        <div className="ex-current-time" aria-label="本大题用时">
          <Clock3 size={14} />
          <span>{section.title}</span>
          <strong>{duration(spent(section.id))}</strong>
          <small>/ {section.durationMinutes}:00</small>
        </div>
        <div className="ex-total-progress" aria-label="答题进度">
          <progress value={doneCount} max={allQuestions.length} />
          <span>
            已答 <strong>{doneCount}</strong> / {allQuestions.length}
          </span>
        </div>
        <div className="ex-save-state" aria-live="polite">
          <Cloud size={14} />
          <span>
            {saveState === 'saving'
              ? '保存中'
              : saveState === 'error'
                ? '保存失败'
                : saveState === 'dirty'
                  ? '待保存'
                  : '已自动保存'}
          </span>
          {saveState === 'error' && (
            <button onClick={() => void save().catch(() => {})}>重试</button>
          )}
        </div>
      </div>
      <nav className="ex-section-tabs" aria-label="试卷大题">
        {sections.map((item, index) => (
          <button
            className={section.id === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => void switchSection(item.id)}
            disabled={blocked}
          >
            <span className="ex-section-index">0{index + 1}</span>
            <strong>{item.title}</strong>
          </button>
        ))}
      </nav>
      <div className="ex-workspace">
        <div className="ex-workspace-bar">
          <h2 className="ex-sr-only">{group.title}</h2>
          <select
            className="ex-group-picker"
            aria-label="选择题组"
            title={group.title}
            value={groupIndex}
            onChange={(event) => void switchGroup(Number(event.target.value))}
            disabled={blocked}
          >
            {section.groups.map((item, index) => (
              <option key={item.id} value={index}>
                {item.title}
              </option>
            ))}
          </select>
          <div className="ex-workspace-tools">
            <button
              className="icon-button"
              title="上一部分"
              aria-label="上一部分"
              disabled={blocked || (groupIndex === 0 && sections.indexOf(section) === 0)}
              onClick={() =>
                groupIndex > 0
                  ? void switchGroup(groupIndex - 1)
                  : void switchSection(sections[sections.indexOf(section) - 1].id)
              }
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              title="下一部分"
              aria-label="下一部分"
              disabled={blocked}
              onClick={() =>
                groupIndex < section.groups.length - 1
                  ? void switchGroup(groupIndex + 1)
                  : sections.indexOf(section) < sections.length - 1
                    ? void switchSection(sections[sections.indexOf(section) + 1].id)
                    : setConfirmOpen(true)
              }
            >
              <ChevronRight size={18} />
            </button>
            <button
              className="icon-button"
              title="答题卡"
              aria-label="打开答题卡"
              onClick={() => setAnswerCard(true)}
            >
              <LayoutGrid size={18} />
            </button>
            <label className="ex-mode-picker" title="显示模式">
              {layout.mode === 'phone' ? (
                <Smartphone size={16} />
              ) : layout.mode === 'tablet' ? (
                <Tablet size={16} />
              ) : (
                <Monitor size={16} />
              )}
              <select
                value={layout.preference}
                aria-label="显示模式"
                onChange={(event) => layout.setPreference(event.target.value as DisplayMode)}
              >
                <option value="auto">自动</option>
                <option value="desktop">电脑</option>
                <option value="tablet">iPad</option>
                <option value="phone">手机</option>
              </select>
            </label>
          </div>
        </div>
        {error && (
          <div className="ex-error-banner" role="alert">
            <CircleAlert size={16} />
            <span>{error}</span>
            {remaining === 0 && !submitting && (
              <button className="btn btn-secondary" onClick={() => void submit()}>
                重新交卷
              </button>
            )}
          </div>
        )}
        {layout.mode === 'phone' && (
          <div className="ex-phone-tabs" role="tablist" aria-label="答题视图">
            <button
              role="tab"
              aria-selected={phonePanel === 'article'}
              className={phonePanel === 'article' ? 'active' : ''}
              onClick={() => setPhonePanel('article')}
            >
              <BookOpen size={16} />
              文章与批注
            </button>
            <button
              role="tab"
              aria-selected={phonePanel === 'answers'}
              className={phonePanel === 'answers' ? 'active' : ''}
              onClick={() => setPhonePanel('answers')}
            >
              <CheckCircle2 size={16} />
              作答{' '}
              <span>
                {
                  group.questions.filter((question) => storedText(answers, question.id).trim())
                    .length
                }
                /{group.questions.length}
              </span>
            </button>
          </div>
        )}
        <div className="ex-answer-layout ex-split" data-phone-panel={phonePanel}>
          <section className="ex-reading ex-reader-pane" aria-label="文章与批注">
            <Notebook
              ref={notebook}
              key={group.id}
              userId={session.user?.id || 'admin'}
              attemptId={session.attempt.id}
              groupId={group.id}
              text={articleText(group)}
              title={group.title}
              onWord={onWord}
              notify={notify}
            />
          </section>
          <section ref={answerPanel} className="ex-questions ex-answer-pane" aria-label="作答区">
            <div className="ex-pane-heading">
              <strong>题目与选项</strong>
              <span>
                本组{' '}
                {
                  group.questions.filter((question) => storedText(answers, question.id).trim())
                    .length
                }{' '}
                / {group.questions.length}
              </span>
            </div>
            {group.instructions && (
              <details className="ex-instruction-details">
                <summary>作答说明</summary>
                <p>
                  <WordText text={group.instructions} onWord={onWord} />
                </p>
              </details>
            )}
            {(group.audioUrl || group.transcript) && <Listening key={group.id} group={group} />}
            {group.questions.map((question) => (
              <article id={`question-${question.id}`} className="ex-question" key={question.id}>
                <div className="ex-question-heading">
                  <span className="ex-question-number">{question.number}</span>
                  <h3>
                    <WordText text={question.prompt} onWord={onWord} />
                  </h3>
                  {question.type === 'choice' && (
                    <span className="ex-question-weight">{question.weight} 分</span>
                  )}
                </div>
                {question.type === 'choice' ? (
                  <fieldset
                    className={`ex-options ${(question.options?.length || 0) > 5 ? 'ex-options-compact' : ''}`}
                    disabled={blocked}
                  >
                    <legend className="ex-sr-only">第 {question.number} 题答案</legend>
                    {question.options?.map((option) => (
                      <label
                        className={storedText(answers, question.id) === option.id ? 'selected' : ''}
                        key={option.id}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={option.id}
                          checked={storedText(answers, question.id) === option.id}
                          onChange={() => updateAnswer(question.id, option.id)}
                        />
                        <span className="ex-option-letter">{option.id}</span>
                        <span className="ex-option-text">{option.text}</span>
                        {storedText(answers, question.id) === option.id && (
                          <Check size={17} className="ex-option-check" />
                        )}
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <TextAnswer
                    question={question}
                    value={storedText(answers, question.id)}
                    onChange={(value) => updateAnswer(question.id, value)}
                    disabled={blocked}
                  />
                )}
              </article>
            ))}
            <div className="ex-inline-navigation">
              <button
                className="btn btn-secondary"
                disabled={blocked || (groupIndex === 0 && sections.indexOf(section) === 0)}
                onClick={() =>
                  groupIndex > 0
                    ? void switchGroup(groupIndex - 1)
                    : void switchSection(sections[sections.indexOf(section) - 1].id)
                }
              >
                <ChevronLeft size={17} />
                上一部分
              </button>
              <button
                className="btn btn-secondary"
                disabled={blocked}
                onClick={() =>
                  groupIndex < section.groups.length - 1
                    ? void switchGroup(groupIndex + 1)
                    : sections.indexOf(section) < sections.length - 1
                      ? void switchSection(sections[sections.indexOf(section) + 1].id)
                      : setConfirmOpen(true)
                }
              >
                {groupIndex === section.groups.length - 1 &&
                sections.indexOf(section) === sections.length - 1
                  ? '完成作答'
                  : '下一部分'}
                <ChevronRight size={17} />
              </button>
            </div>
          </section>
        </div>
      </div>
      {answerCard && (
        <Modal title="答题卡" onClose={() => setAnswerCard(false)}>
          <p className="ex-card-summary">
            已答 {doneCount} / {allQuestions.length} · 当前 {section.title}
          </p>
          <div className="ex-question-buttons">
            {questionsInSection.map((question) => (
              <button
                key={question.id}
                disabled={blocked}
                className={storedText(answers, question.id).trim() ? 'answered' : ''}
                aria-label={
                  '第 ' +
                  question.number +
                  ' 题' +
                  (storedText(answers, question.id).trim() ? '，已作答' : '，未作答')
                }
                onClick={() =>
                  void switchGroup(
                    section.groups.findIndex((item) =>
                      item.questions.some((value) => value.id === question.id),
                    ),
                    question.id,
                  )
                }
              >
                {question.number}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {confirmOpen && (
        <div
          className="ex-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmOpen(false);
          }}
        >
          <div
            className="ex-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ex-submit-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConfirmOpen(false);
              if (event.key === 'Tab') {
                const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
                const first = buttons[0];
                const last = buttons[buttons.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              className="icon-button ex-modal-close"
              aria-label="取消交卷"
              onClick={() => setConfirmOpen(false)}
            >
              <X size={19} />
            </button>
            <span className="ex-modal-icon">
              <Send size={24} />
            </span>
            <h2 id="ex-submit-title">准备好交卷了吗？</h2>
            <p>
              {allQuestions.length - doneCount > 0
                ? `还有 ${allQuestions.length - doneCount} 道题未作答，未作答的客观题计 0 分。`
                : '所有题目均已作答，可以提交本次练习。'}
            </p>
            <div className="ex-submit-summary">
              {sections.map((item) => {
                const qs = item.groups.flatMap((value) => value.questions);
                return (
                  <div key={item.id}>
                    <span>{item.title}</span>
                    <strong>
                      {qs.filter((q) => storedText(answers, q.id).trim()).length} / {qs.length}
                    </strong>
                  </div>
                );
              })}
            </div>
            <div className="ex-modal-actions">
              <button
                ref={confirmButton}
                className="btn btn-secondary"
                onClick={() => setConfirmOpen(false)}
              >
                继续作答
              </button>
              <button className="btn btn-primary" onClick={() => void submit()}>
                <Send size={16} />
                确认交卷
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
