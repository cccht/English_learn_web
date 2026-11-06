import { ArrowRight, PenLine, Timer } from 'lucide-react';
import { Modal } from './components';
import { Illustration } from './Illustration';
import type { Paper } from './types';

export default function StartModal({
  paper,
  busy,
  onClose,
  onStart,
}: {
  paper: Paper;
  busy: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  const sections = paper.sections || [];
  return (
    <Modal title="准备开始练习" onClose={() => !busy && onClose()}>
      <div className="start-illustrated-heading">
        <Illustration kind="reading" size="dialog" />
        <div>
          <span className="tag tag-green">
            {paper.document ? 'PDF 试卷' : paper.kind === 'practice' ? '原创练习' : '历年真题'}
          </span>
          <h3 className="source-title">{paper.title}</h3>
        </div>
      </div>
      <div className="start-summary">
        <span>
          <Timer size={19} />
          {paper.durationMinutes} 分钟
        </span>
        <span>
          <PenLine size={18} />
          {paper.questionCount ?? 0} 题
        </span>
      </div>
      <div
        className="start-sections"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, sections.length)}, 1fr)` }}
      >
        {sections.map((s) => (
          <div key={s.id}>
            <span>{s.title}</span>
            <strong>
              {s.durationMinutes}
              <small> 分钟</small>
            </strong>
          </div>
        ))}
      </div>
      <p className="start-note">
        开始后持续计时，离开页面仍会计入用时；到时自动交卷。各部分记录独立用时，可以自由切换。
      </p>
      {Boolean(paper.manualQuestionCount) && (
        <p className="start-note">
          其中 {paper.manualQuestionCount} 道题采用人工评分，不会因缺失答案被自动判错。
        </p>
      )}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
          稍后再练
        </button>
        <button className="btn btn-primary" onClick={onStart} disabled={busy}>
          {busy ? '正在创建' : '开始计时'}
          <ArrowRight size={17} />
        </button>
      </div>
    </Modal>
  );
}
