import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookCheck,
  Check,
  ChevronDown,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Volume2,
} from 'lucide-react';
import { api, patch, post } from './api';
import { wordReasons } from './insight-types';
import { Empty, Modal, PageHeading } from './components';
import { speakWord } from './Papers';
import type { Word } from './types';

export default function Words({
  words,
  reload,
  onAdd,
  notify,
}: {
  words: Word[];
  reload: () => Promise<void>;
  onAdd: (word: string, context?: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState('csv');
  const [edit, setEdit] = useState<Word | null>(null);
  const [definition, setDefinition] = useState('');
  const [deleting, setDeleting] = useState<Word | null>(null);
  const [review, setReview] = useState<Word[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const filtered = words.filter(
    (w) =>
      (filter === 'all' || (filter === 'mastered' ? w.mastered : !w.mastered)) &&
      `${w.word} ${w.definition} ${w.context || ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const current = review?.[index];
  async function rateWord(rating: 'remembered' | 'forgotten') {
    if (!current || !review) return;
    const eventId =
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await post(`/words/${current.id}/review`, { eventId, rating });
    await reload();
    if (index < review.length - 1) {
      setIndex((i) => i + 1);
      setFlipped(false);
    } else {
      setReview(null);
      notify('本组复习完成');
    }
  }
  async function updateWord(word: Word, mastered: boolean) {
    try {
      await patch(`/words/${word.id}`, { mastered });
      await reload();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!review || !current) return;
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
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!flipped) {
          setFlipped(true);
          speakWord(current.word, notify);
        } else {
          speakWord(current.word, notify);
        }
      } else if (e.key === '1' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (!busy) void run(() => rateWord('forgotten'));
      } else if (e.key === '2' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (!busy) void run(() => rateWord('remembered'));
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'ArrowUp') {
        e.preventDefault();
        speakWord(current.word, notify);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) setReview(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [review, current, flipped, busy, index]);

  return (
    <>
      <PageHeading
        title="我的单词本"
        illustration="words"
        subtitle={`${words.length} 个单词，${words.filter((w) => w.mastered).length} 个已掌握`}
      >
        <button className="btn btn-secondary" onClick={() => setShowAdd(true)}>
          <Plus size={16} />
          添加单词
        </button>
        <button
          className="btn btn-primary"
          disabled={!words.length}
          onClick={() => {
            setReview(filtered.length ? filtered : words);
            setIndex(0);
            setFlipped(false);
          }}
        >
          <RotateCcw size={16} />
          开始复习
        </button>
      </PageHeading>
      <div className="words-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            value={query}
            aria-label="搜索单词"
            placeholder="搜索单词、释义或例句"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="export-controls">
          <div className="select-wrap">
            <select
              value={format}
              aria-label="导出格式"
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="csv">CSV 表格</option>
              <option value="json">JSON 数据</option>
              <option value="txt">TXT 文本</option>
            </select>
            <ChevronDown size={15} />
          </div>
          <a className="btn btn-secondary" href={`/api/words/export?format=${format}`} download>
            <Download size={16} />
            导出单词本
          </a>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="掌握程度">
        {[
          { id: 'all', name: '全部单词', count: words.length },
          { id: 'learning', name: '待复习', count: words.filter((w) => !w.mastered).length },
          { id: 'mastered', name: '已掌握', count: words.filter((w) => w.mastered).length },
        ].map((t) => (
          <button
            role="tab"
            aria-selected={filter === t.id}
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={filter === t.id ? 'active' : ''}
          >
            {t.name}
            <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>
      {filtered.length ? (
        <div className="word-list">
          {filtered.map((word) => (
            <article className="vocab-row" key={word.id}>
              <div className="vocab-main">
                <div className="word-heading">
                  <h3>{word.word}</h3>
                  <button
                    className="icon-button"
                    aria-label={`朗读 ${word.word}`}
                    title="朗读单词"
                    onClick={() => speakWord(word.word, notify)}
                  >
                    <Volume2 size={16} />
                  </button>
                  {word.mastered && <span className="tag tag-green">已掌握</span>}
                </div>
                <span className="phonetic">{word.phonetic}</span>
                <p className="vocab-definition">{word.definition}</p>
                {(word.context || word.example) && (
                  <p className="vocab-context">{word.context || word.example}</p>
                )}
                <small className="muted">
                  {word.paperTitle || '个人收录'} ·{' '}
                  {new Date(word.createdAt).toLocaleDateString('zh-CN')}
                </small>
                <div className="vocab-reason">
                  <label htmlFor={`reason-${word.id}`}>不认识的原因</label>
                  <select
                    id={`reason-${word.id}`}
                    value={word.reason || 'unknown'}
                    onChange={(event) => {
                      const reason = event.target.value;
                      void run(async () => {
                        await patch(`/words/${word.id}`, { reason });
                        await reload();
                      });
                    }}
                    disabled={busy}
                  >
                    {wordReasons.map((reason) => (
                      <option key={reason.id} value={reason.id}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                  {Boolean(word.reviewHistory?.length) && (
                    <span>
                      复习 {word.reviewHistory!.length} 次 · 没记住{' '}
                      {word.reviewHistory!.filter((item) => item.rating === 'forgotten').length} 次
                    </span>
                  )}
                </div>
              </div>
              <div className="vocab-actions">
                <button
                  className={`icon-button ${word.mastered ? 'is-checked' : ''}`}
                  title={word.mastered ? '标记为待复习' : '标记为已掌握'}
                  aria-label={`${word.mastered ? '复习' : '掌握'} ${word.word}`}
                  onClick={() => updateWord(word, !word.mastered)}
                >
                  <BookCheck size={18} />
                </button>
                <button
                  className="icon-button"
                  title="编辑释义"
                  aria-label={`编辑 ${word.word}`}
                  onClick={() => {
                    setEdit(word);
                    setDefinition(word.definition);
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  title="删除单词"
                  aria-label={`删除 ${word.word}`}
                  onClick={() => setDeleting(word)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={words.length ? '没有匹配的单词' : '你的词汇积累，从这里开始'}
          illustration={words.length ? 'search' : 'words'}
          detail={words.length ? '换个关键词，或查看其他分组。' : '还没有收录单词。'}
          action="添加第一个单词"
          onAction={() => setShowAdd(true)}
        />
      )}
      {showAdd && (
        <Modal title="添加单词" onClose={() => !busy && setShowAdd(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await onAdd(newWord.trim());
                setShowAdd(false);
                setNewWord('');
              });
            }}
          >
            <label className="form-label" htmlFor="new-word">
              英文单词
            </label>
            <input
              className="text-input"
              id="new-word"
              autoFocus
              required
              pattern="[A-Za-z]+(?:[-'][A-Za-z]+)*"
              maxLength={60}
              placeholder="例如 resilience"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>
                取消
              </button>
              <button className="btn btn-primary" disabled={busy}>
                <Plus size={16} />
                {busy ? '查询中' : '加入单词本'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal title={`编辑 ${edit.word}`} onClose={() => !busy && setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await patch(`/words/${edit.id}`, { definition });
                await reload();
                setEdit(null);
                notify('释义已更新');
              });
            }}
          >
            <label className="form-label" htmlFor="definition">
              单词释义
            </label>
            <textarea
              id="definition"
              className="text-input"
              rows={4}
              value={definition}
              maxLength={2000}
              required
              onChange={(e) => setDefinition(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn btn-primary" disabled={busy}>
                <Check size={16} />
                保存释义
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="删除单词" onClose={() => !busy && setDeleting(null)}>
          <p>
            确定从单词本移除 <strong>{deleting.word}</strong>？
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              保留
            </button>
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`/words/${deleting.id}`, { method: 'DELETE' });
                  await reload();
                  setDeleting(null);
                })
              }
            >
              <Trash2 size={16} />
              删除
            </button>
          </div>
        </Modal>
      )}
      {review && current && (
        <Modal
          title={`单词复习 · ${index + 1} / ${review.length}`}
          onClose={() => !busy && setReview(null)}
        >
          <div className="review-word">
            <span className="small muted">{flipped ? '释义与例句' : '英文单词'}</span>
            <h3>{current.word}</h3>
            <p className="phonetic">{current.phonetic}</p>
            <button
              className="icon-button text-green"
              aria-label="朗读当前单词"
              title="朗读单词"
              onClick={() => speakWord(current.word, notify)}
            >
              <Volume2 size={22} />
            </button>
            <div className="review-answer">
              {flipped ? (
                <>
                  <p>{current.definition}</p>
                  <p className="word-example">{current.context || current.example}</p>
                </>
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setFlipped(true);
                    speakWord(current.word, notify);
                  }}
                >
                  显示释义
                  <kbd className="kbd-hint">空格</kbd>
                </button>
              )}
            </div>
          </div>
          <div className="review-navigation">
            <button
              className="icon-button"
              aria-label="上一个单词"
              disabled={index === 0 || busy}
              onClick={() => {
                setIndex((i) => i - 1);
                setFlipped(false);
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void run(() => rateWord('forgotten'))}
            >
              <RotateCcw size={16} />
              没记住
              <kbd className="kbd-hint">1 / ←</kbd>
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void run(() => rateWord('remembered'))}
              disabled={busy}
            >
              <Check size={16} />
              已掌握
              <kbd className="kbd-hint">2 / →</kbd>
            </button>
            <button
              className="icon-button"
              aria-label={index === review.length - 1 ? '完成复习' : '下一个单词'}
              disabled={busy}
              onClick={() => {
                if (index === review.length - 1) setReview(null);
                else {
                  setIndex((i) => i + 1);
                  setFlipped(false);
                }
              }}
            >
              <ArrowRight size={18} />
            </button>
          </div>
          <p className="review-tips">
            快捷键：<kbd className="kbd-hint">空格</kbd> 翻转/朗读 · <kbd className="kbd-hint">1</kbd> 没记住 · <kbd className="kbd-hint">2</kbd> 已掌握 · <kbd className="kbd-hint">Esc</kbd> 退出
          </p>
        </Modal>
      )}
    </>
  );
}
