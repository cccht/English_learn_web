import { useState } from 'react';
import { ArrowRight, BarChart3, CheckCircle2, Clock3, FileText } from 'lucide-react';
import { dateLabel, duration } from './api';
import { Empty, PageHeading } from './components';
import type { Attempt } from './types';

export default function Records({
  attempts,
  mistakes = false,
  onOpen,
  onPractice,
}: {
  attempts: Attempt[];
  mistakes?: boolean;
  onOpen: (attempt: Attempt) => void;
  onPractice: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const rows = attempts.filter((a) =>
    mistakes
      ? a.status === 'submitted' && a.result?.items.some((q) => q.correct === false)
      : filter === 'all' || a.status === filter,
  );
  const errors = submitted.flatMap((a) => a.result?.items.filter((q) => q.correct === false) || []);
  return (
    <>
      <PageHeading
        title={mistakes ? '错题复盘' : '学习记录'}
        illustration={mistakes ? 'insights' : 'review'}
        subtitle={
          mistakes
            ? `${errors.length} 道错题，来自 ${rows.length} 次练习`
            : '每一次投入，都有迹可循'
        }
      >
        <button className="btn btn-primary" onClick={onPractice}>
          去练习
          <ArrowRight size={16} />
        </button>
      </PageHeading>
      {!mistakes && (
        <div className="record-overview">
          <div>
            <CheckCircle2 size={20} />
            <span>
              完成练习
              <strong>
                {submitted.length}
                <small> 次</small>
              </strong>
            </span>
          </div>
          <div>
            <Clock3 size={20} />
            <span>
              累计用时
              <strong>
                {duration(
                  attempts.reduce(
                    (s, a) => s + Object.values(a.sectionSpent).reduce((x, y) => x + y, 0),
                    0,
                  ),
                )}
              </strong>
            </span>
          </div>
          <div>
            <BarChart3 size={20} />
            <span>
              客观题正确率
              <strong>
                {submitted.length
                  ? `${Math.round(
                      (submitted.reduce((s, a) => s + (a.result?.correctCount || 0), 0) /
                        Math.max(
                          1,
                          submitted.reduce(
                            (s, a) =>
                              s + (a.result?.items.filter((q) => q.correct !== null).length || 0),
                            0,
                          ),
                        )) *
                        100,
                    )}%`
                  : '—'}
              </strong>
            </span>
          </div>
        </div>
      )}
      {!mistakes && (
        <div className="tabs" role="tablist" aria-label="记录状态">
          {[
            { id: 'all', name: '全部记录' },
            { id: 'active', name: '进行中' },
            { id: 'submitted', name: '已交卷' },
          ].map((t) => (
            <button
              role="tab"
              aria-selected={filter === t.id}
              key={t.id}
              className={filter === t.id ? 'active' : ''}
              onClick={() => setFilter(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {rows.length ? (
        <div className="records-list">
          {rows.map((attempt) => (
            <article key={attempt.id} className="record-row">
              <div className="record-icon">
                <FileText size={23} />
              </div>
              <div className="record-info">
                <h3>{attempt.paperTitle}</h3>
                <p>
                  {dateLabel(attempt.startedAt)}
                  <span>·</span>
                  {duration(Object.values(attempt.sectionSpent).reduce((x, y) => x + y, 0))}
                  <span>·</span>
                  {attempt.status === 'active' ? '进行中' : '已交卷'}
                </p>
                {attempt.status === 'submitted' && (
                  <div className="record-details">
                    {['writing', 'listening', 'reading', 'translation'].map((s, i) => (
                      <span key={s}>
                        {['写作', '听力', '阅读', '翻译'][i]}{' '}
                        {duration(attempt.sectionSpent[s] || 0)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="record-score">
                {mistakes ? (
                  <>
                    <strong className="text-warm">
                      {attempt.result?.items.filter((q) => q.correct === false).length}
                    </strong>
                    <small>道错题</small>
                  </>
                ) : attempt.result ? (
                  <>
                    <strong>
                      {attempt.result.totalScore === null
                        ? attempt.result.objectiveScore
                        : attempt.result.totalScore}
                      <small>
                        {' '}
                        / {attempt.result.totalScore === null ? attempt.result.objectiveMax : 100}
                      </small>
                    </strong>
                    <small>
                      {attempt.result.totalScore === null ? '客观题得分 · 主观题待评' : '练习总分'}
                    </small>
                  </>
                ) : (
                  <span className="tag tag-green">待完成</span>
                )}
              </div>
              <button className="btn btn-secondary btn-small" onClick={() => onOpen(attempt)}>
                {attempt.status === 'active' ? '继续答题' : mistakes ? '查看错题' : '查看报告'}
                <ArrowRight size={15} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={mistakes ? '还没有需要复盘的错题' : '还没有学习记录'}
          illustration={mistakes ? 'insights' : 'review'}
          detail={
            mistakes
              ? '完成练习后，答错的客观题会保存在这里。'
              : '从一份试卷开始，留下你的第一份学习记录。'
          }
          action="选择试卷"
          onAction={onPractice}
        />
      )}
    </>
  );
}
