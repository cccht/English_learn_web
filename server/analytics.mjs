import { createHash } from 'node:crypto';

const DAY = 86400000;
const rounded = (value) => Math.round(value * 100) / 100;
const percentage = (part, total) => (total ? rounded((part / total) * 100) : null);
const timestamp = (value) => (typeof value === 'number' ? value : Date.parse(value));
const finiteSeconds = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const clip = (value, max = 650) => String(value || '').slice(0, max);
const stableId = (...parts) => parts.map((part) => encodeURIComponent(String(part))).join('/');
const ownValue = (object, key) => (Object.hasOwn(object, key) ? object[key] : undefined);

const TYPE_LABELS = {
  listening_conversation: '听力 · 长对话',
  listening_passage: '听力 · 短文',
  listening_lecture: '听力 · 讲座 / 讲话',
  listening_other: '听力 · 未细分',
  reading_cloze: '阅读 · 选词填空',
  reading_matching: '阅读 · 长篇匹配',
  reading_detail: '阅读 · 仔细阅读',
  reading_other: '阅读 · 未细分',
};
const TYPE_ACTIONS = {
  listening_conversation: '复听错题所在对话，记下转折和说话者态度，再用原句排除干扰项。',
  listening_passage: '复听一篇短文，按主旨、原因和结果记录关键词，逐题核对证据句。',
  listening_lecture: '分段复听讲座，写出主题与分论点，重点核对例子支持的结论。',
  reading_cloze: '先判断空格需要的词性，再检查句意和搭配；每道错题写出选项不适合的理由。',
  reading_matching: '圈出题干中的定位词，找到同义改写后核对整句含义，记录误选段落的差别。',
  reading_detail: '回到原文标出支持答案的句子，对比正确项与误选项的范围、语气和因果关系。',
};
const REASON_LABELS = {
  unknown: '尚不确定',
  new: '从没学过',
  forgotten: '学过但忘了',
  context: '熟词僻义',
  listening: '看得懂但听不出',
  confusion: '形近词混淆',
  collocation: '搭配不熟悉',
};
const ERROR_LABELS = {
  vocabulary: '词汇不认识',
  grammar: '语法 / 长难句',
  locating: '定位错误',
  inference: '推理 / 干扰项',
  time: '时间不够',
  careless: '审题疏漏',
};
const WORD_ACTIONS = {
  unknown: '先遮住释义回忆，再放回原句阅读并听一遍发音，标记最符合这次困难的原因。',
  new: '学习发音、核心词义和原句；随后遮住释义，用一个新句子检验是否能理解。',
  forgotten: '遮住释义主动回忆，再核对答案；隔天和几天后各复习一次并记录结果。',
  context: '对照原句中的含义与已知词义，各写一个例句，说明语境如何改变词义。',
  listening: '先不看文本听词和原句，再对照重音与连读，最后脱离文本复听一次。',
  confusion: '列出实际混淆的两个词，分别写出词义、发音和例句，再交替辨认。',
  collocation: '从原句保留完整搭配，替换主语或宾语造句，再核对搭配是否自然。',
};

function sectionFamily(section) {
  const text = `${section.id || ''} ${section.title || ''}`.toLowerCase();
  if (/listening|听力/.test(text)) return 'listening';
  if (/reading|阅读/.test(text)) return 'reading';
  return String(section.id || 'objective');
}

export function questionType(section, group, question = {}) {
  const family = sectionFamily(section);
  const explicit = String(question.questionType || group.questionType || '').trim();
  let id;
  if (explicit) {
    id =
      Object.hasOwn(TYPE_LABELS, explicit) || explicit.startsWith(`${family}_`)
        ? explicit
        : `${family}_${explicit}`;
  } else {
    const text = `${group.id || ''} ${group.title || ''}`.toLowerCase();
    if (family === 'listening') {
      if (/conversation|对话/.test(text)) id = 'listening_conversation';
      else if (/lecture|\btalk\b|讲座|讲话/.test(text)) id = 'listening_lecture';
      else if (/passage|短文/.test(text)) id = 'listening_passage';
    } else if (family === 'reading') {
      if (/cloze|选词|词汇填空/.test(text)) id = 'reading_cloze';
      else if (/match|长篇|匹配/.test(text)) id = 'reading_matching';
      else if (/comprehension|passage|仔细|精读|detail/.test(text)) id = 'reading_detail';
    }
    id ||= `${family}_other`;
  }
  return {
    id,
    label: ownValue(TYPE_LABELS, id) || `${section.title || section.id} · ${explicit || '未细分'}`,
    sectionId: section.id,
    recommendation:
      ownValue(TYPE_ACTIONS, id) || '逐题核对原文证据，并标记误选原因；补充同类新题检验是否掌握。',
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function wordMatcher(word) {
  const term = String(word || '')
    .trim()
    .replaceAll('’', "'");
  if (!term) return () => false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu');
  return (text) => regex.test(String(text || '').replaceAll('’', "'"));
}

function classifyWord(word, encounters, reviews, linkedMistakes) {
  const reason = Object.hasOwn(REASON_LABELS, word.reason) ? word.reason : 'unknown';
  const forgotCount = reviews.filter((review) => review.rating === 'forgotten').length;
  const remembered = reviews.filter((review) => review.rating === 'remembered').length;
  const signals = [];
  if (reason !== 'unknown') signals.push(`你自行标记：${REASON_LABELS[reason]}。`);
  if (encounters.length)
    signals.push(`所选期间记录了 ${encounters.length} 次收录 / 查询；不代表实际遇到该词的总次数。`);
  if (reviews.length)
    signals.push(
      `所选期间复习 ${reviews.length} 次：自报记住 ${remembered} 次，自报没记住 ${forgotCount} 次。`,
    );
  if (linkedMistakes)
    signals.push(`该词出现在 ${linkedMistakes} 条答错记录对应的材料中；共现不等于致错。`);
  let hypothesis = '尚无足够证据判断原因。收藏一个词本身不能区分没学过、遗忘、语境或听辨困难。';
  if (reason !== 'unknown') {
    hypothesis = `目前的原因来自你的自述“${REASON_LABELS[reason]}”，可通过针对性练习继续验证。`;
  } else if (forgotCount > 0) {
    hypothesis = `你在 ${reviews.length} 次复习中有 ${forgotCount} 次自报“没记住”，提示当前回忆可能仍有困难；尚不能区分最初未学牢与间隔后遗忘，也未通过实际回忆测验验证。`;
  } else if (linkedMistakes > 0) {
    hypothesis = '这个词与错题材料有交集，语境理解可能值得检查；不能据此认定它导致了答错。';
  } else if (remembered > 0) {
    hypothesis =
      '已有自报“记住”的复习反馈，但仍无法据此还原最初收藏时不认识的原因，也未通过实际回忆测验验证。';
  }
  return {
    id: String(word.id),
    word: word.word,
    definition: word.definition || '',
    context: clip(word.context, 500),
    reason,
    reasonLabel: REASON_LABELS[reason],
    encounterCount: encounters.length,
    reviewCount: reviews.length,
    forgotCount,
    linkedMistakes,
    signals,
    hypothesis,
    recommendation: WORD_ACTIONS[reason === 'unknown' && forgotCount ? 'forgotten' : reason],
  };
}

export function buildInsights({
  papers = [],
  attempts = [],
  words = [],
  days = 30,
  now = Date.now(),
}) {
  const current = timestamp(now);
  if (!Number.isFinite(current)) throw new TypeError('now must be a valid date or timestamp');
  const rangeDays = days === null ? null : Math.max(1, Math.floor(Number(days) || 30));
  const cutoff = rangeDays === null ? -Infinity : current - rangeDays * DAY;
  const inRange = (value) => {
    const date = timestamp(value);
    return Number.isFinite(date) && date >= cutoff && date <= current;
  };
  const paperMap = new Map(papers.map((paper) => [paper.id, paper]));
  const submitted = attempts
    .filter((attempt) => attempt.status === 'submitted' && inRange(attempt.submittedAt))
    .sort(
      (a, b) =>
        timestamp(a.submittedAt) - timestamp(b.submittedAt) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const selected = submitted.filter((attempt) =>
    Array.isArray(paperMap.get(attempt.paperId)?.sections),
  );
  const typeRows = new Map();
  const sectionRows = new Map();
  const questionRows = new Map();
  const mistakes = [];
  const recentAttempts = [];
  const evidence = [];
  const addEvidence = (id, text) => evidence.push({ id, text: clip(text, 1000) });
  const summary = {
    attemptCount: selected.length,
    paperCount: new Set(selected.map((attempt) => attempt.paperId)).size,
    answered: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    accuracy: null,
    vocabularyCount: words.length,
    repeatedMistakeCount: 0,
    telemetryAttempts: 0,
    level: 'empty',
  };
  const habits = {
    telemetryAttempts: 0,
    answerChanges: 0,
    correctToWrong: 0,
    wrongToCorrect: 0,
    sectionSwitches: 0,
    lateChanges: 0,
    autoSubmitted: 0,
    notes: [],
  };
  const errorCounts = new Map();
  const independentAnswered = new Set();
  let unavailableKeys = 0;

  for (const attempt of selected) {
    const paper = paperMap.get(attempt.paperId);
    const questionMap = new Map();
    const local = { answered: 0, correct: 0, wrong: 0, skipped: 0 };
    for (const section of paper.sections) {
      const spent = attempt.sectionSpent?.[section.id];
      if (finiteSeconds(spent)) {
        const row = sectionRows.get(section.id) || {
          sectionId: section.id,
          title: section.title,
          totalSeconds: 0,
          recommendedSeconds: 0,
          overBudgetCount: 0,
          attemptCount: 0,
        };
        const recommended = finiteSeconds(section.durationMinutes)
          ? section.durationMinutes * 60
          : 0;
        row.totalSeconds += spent;
        row.recommendedSeconds += recommended;
        row.overBudgetCount += Number(recommended > 0 && spent > recommended);
        row.attemptCount += 1;
        sectionRows.set(section.id, row);
      }
      for (const group of section.groups || []) {
        for (const question of group.questions || []) {
          if (question.type !== 'choice') continue;
          if (question.grading === 'manual') {
            unavailableKeys += 1;
            continue;
          }
          if (typeof question.answer !== 'string' || !question.answer.trim()) {
            unavailableKeys += 1;
            continue;
          }
          questionMap.set(question.id, question);
          const key = JSON.stringify([paper.id, question.id]);
          const type = questionType(section, group, question);
          const row = typeRows.get(type.id) || {
            ...type,
            answered: 0,
            correct: 0,
            wrong: 0,
            skipped: 0,
            lostPoints: 0,
            attemptIds: new Set(),
            questionKeys: new Set(),
            answeredKeys: new Set(),
            paperIds: new Set(),
          };
          row.attemptIds.add(attempt.id);
          row.questionKeys.add(key);
          row.paperIds.add(paper.id);
          const answer = attempt.answers?.[question.id];
          const answered = typeof answer === 'string' && answer.trim().length > 0;
          const outcome = !answered ? 'skipped' : answer === question.answer ? 'correct' : 'wrong';
          for (const counter of [row, summary, local]) {
            counter[outcome] += 1;
            counter.answered += Number(answered);
          }
          if (answered) {
            row.answeredKeys.add(key);
            independentAnswered.add(key);
          }
          if (outcome !== 'correct' && finiteSeconds(question.weight))
            row.lostPoints += question.weight;
          typeRows.set(type.id, row);
          const history = questionRows.get(key) || {
            paperId: paper.id,
            questionId: question.id,
            questionNumber: question.number,
            paperTitle: paper.title,
            typeLabel: type.label,
            prompt: clip(question.prompt),
            explanation: clip(question.explanation, 1200),
            observations: [],
          };
          const reason = attempt.errorReasons?.[question.id];
          history.observations.push({
            outcome,
            attemptId: attempt.id,
            reason,
            date: attempt.submittedAt,
            contrast:
              outcome === 'wrong'
                ? {
                    selected: clip(
                      `${answer}: ${(question.options || []).find((option) => option.id === answer)?.text || '选项文本缺失'}`,
                      120,
                    ),
                    expected: clip(
                      `${question.answer}: ${(question.options || []).find((option) => option.id === question.answer)?.text || '选项文本缺失'}`,
                      120,
                    ),
                  }
                : undefined,
          });
          questionRows.set(key, history);
          if (outcome === 'wrong') {
            if (ownValue(ERROR_LABELS, reason))
              errorCounts.set(reason, (errorCounts.get(reason) || 0) + 1);
            mistakes.push({
              paperId: paper.id,
              attemptId: attempt.id,
              questionId: question.id,
              text: [
                group.passage,
                group.transcript,
                question.prompt,
                ...(question.options || []).map((option) => option.text),
              ]
                .filter(Boolean)
                .join('\n'),
            });
          }
        }
      }
    }
    recentAttempts.push({
      id: attempt.id,
      title: paper.title,
      date: attempt.submittedAt,
      accuracy: percentage(local.correct, local.answered),
      wrong: local.wrong,
      skipped: local.skipped,
    });
    habits.autoSubmitted += Number(attempt.autoSubmitted === true);
    if (attempt.telemetry?.version !== 1) continue;
    habits.telemetryAttempts += 1;
    const started = timestamp(attempt.startedAt);
    const deadline = timestamp(attempt.deadlineAt);
    const submittedAt = timestamp(attempt.submittedAt);
    for (const change of attempt.telemetry.answerChanges || []) {
      const question = questionMap.get(change.questionId);
      if (
        !question ||
        typeof change.from !== 'string' ||
        typeof change.to !== 'string' ||
        change.from === change.to
      )
        continue;
      if (!change.from.trim() || !change.to.trim()) continue;
      habits.answerChanges += 1;
      habits.correctToWrong += Number(
        change.from === question.answer && change.to !== question.answer,
      );
      habits.wrongToCorrect += Number(
        change.from !== question.answer && change.to === question.answer,
      );
      const at = timestamp(change.at);
      if (
        deadline > started &&
        at >= started + (deadline - started) * 0.9 &&
        at <= Math.min(deadline, submittedAt)
      )
        habits.lateChanges += 1;
    }
    const sectionIds = new Set(paper.sections.map((section) => section.id));
    habits.sectionSwitches += (attempt.telemetry.sectionSwitches || []).filter(
      (event) => event.from !== event.to && sectionIds.has(event.from) && sectionIds.has(event.to),
    ).length;
  }

  summary.accuracy = percentage(summary.correct, summary.answered);
  summary.telemetryAttempts = habits.telemetryAttempts;
  summary.level = !summary.answered
    ? 'empty'
    : selected.length >= 3 && independentAnswered.size >= 30 && summary.paperCount >= 2
      ? 'developing'
      : 'limited';
  const questionTypes = [...typeRows.values()]
    .map((row) => {
      const { attemptIds, questionKeys, answeredKeys, paperIds, ...values } = row;
      const confidence =
        answeredKeys.size >= 30 && attemptIds.size >= 5 && paperIds.size >= 3
          ? 'high'
          : answeredKeys.size >= 15 && attemptIds.size >= 3 && paperIds.size >= 2
            ? 'medium'
            : 'low';
      return {
        ...values,
        attempts: attemptIds.size,
        uniqueQuestions: answeredKeys.size,
        accuracy: percentage(row.correct, row.answered),
        errorRate: percentage(row.wrong, row.answered),
        lostPoints: rounded(row.lostPoints),
        confidence,
      };
    })
    .sort(
      (a, b) =>
        (b.errorRate ?? -1) - (a.errorRate ?? -1) || b.wrong - a.wrong || a.id.localeCompare(b.id),
    );
  const sections = [...sectionRows.values()]
    .map((row) => ({
      ...row,
      totalSeconds: rounded(row.totalSeconds),
      averageSeconds: rounded(row.totalSeconds / row.attemptCount),
      recommendedSeconds: rounded(row.recommendedSeconds / row.attemptCount),
    }))
    .sort((a, b) => a.sectionId.localeCompare(b.sectionId));
  const repeatedMistakes = [...questionRows.values()]
    .flatMap((history) => {
      const wrong = history.observations.filter((item) => item.outcome === 'wrong');
      if (wrong.length < 2) return [];
      const last = history.observations.at(-1);
      const reasons = new Map();
      for (const item of wrong)
        if (ownValue(ERROR_LABELS, item.reason))
          reasons.set(item.reason, (reasons.get(item.reason) || 0) + 1);
      const { observations, ...values } = history;
      return [
        {
          ...values,
          wrongCount: wrong.length,
          seenCount: observations.length,
          lastAttemptId: last.attemptId,
          lastOutcome: last.outcome,
          reason: reasons.size
            ? [...reasons]
                .map(([id, count]) => `${ERROR_LABELS[id]}（自行标记 ${count} 次）`)
                .join('；')
            : '尚未标记原因，重复答错本身不能确定成因。',
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(a.lastOutcome === 'correct') - Number(b.lastOutcome === 'correct') ||
        b.wrongCount - a.wrongCount ||
        stableId(a.paperId, a.questionId).localeCompare(stableId(b.paperId, b.questionId)),
    );
  summary.repeatedMistakeCount = repeatedMistakes.length;

  if (habits.telemetryAttempts) {
    habits.notes.push({
      title: '改答记录',
      evidence: `${habits.telemetryAttempts} 次练习记录到 ${habits.answerChanges} 次已保存的非空选项改答，其中对改错 ${habits.correctToWrong} 次、错改对 ${habits.wrongToCorrect} 次。`,
      interpretation:
        '这些是连续改答过程中的转换次数，同一道题可能计入多次；不能据此认定犹豫或粗心。',
      action: habits.correctToWrong
        ? '回看对改错的题目，写下改答依据，再与原文证据比较。'
        : '继续保留改答记录，并在复盘时核对每次修改的证据。',
    });
    if (habits.lateChanges)
      habits.notes.push({
        title: '临近截止的改答',
        evidence: `考试总时长最后 10% 内记录到 ${habits.lateChanges} 次改答。`,
        interpretation: '接近截止时间的修改不一定由时间压力导致，也可能是正常检查。',
        action: '复盘这些修改时标记是否因时间不足，下一套练习留出固定检查时间作比较。',
      });
  } else {
    habits.notes.push({
      title: '改答轨迹尚不足',
      evidence: '所选期间没有带新版行为记录的已交卷练习。',
      interpretation: '不能从旧记录还原改答次数、题目停留时间或阅读顺序。',
      action: '完成新练习后再查看改答与切换统计。',
    });
  }
  if (habits.autoSubmitted)
    habits.notes.push({
      title: '到时交卷',
      evidence: `${selected.length} 次练习中有 ${habits.autoSubmitted} 次到时自动交卷。`,
      interpretation: '自动交卷可能包含离开页面后的截止，不足以单独判断做题速度。',
      action: '结合未答题和自己标记的“时间不够”原因，检查下一次练习的分项时间安排。',
    });

  const vocabularyWords = [...words]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((word) => {
      const encounters = Array.isArray(word.encounters)
        ? word.encounters.filter((event) => inRange(event.at))
        : inRange(word.createdAt)
          ? [{ at: word.createdAt, context: word.context }]
          : [];
      const reviews = (word.reviewHistory || []).filter(
        (review) => inRange(review.at) && ['remembered', 'forgotten'].includes(review.rating),
      );
      const matches = wordMatcher(word.word);
      const linkedMistakes = mistakes.filter((mistake) => matches(mistake.text)).length;
      return classifyWord(word, encounters, reviews, linkedMistakes);
    })
    .sort(
      (a, b) =>
        b.forgotCount - a.forgotCount ||
        b.linkedMistakes - a.linkedMistakes ||
        a.word.localeCompare(b.word),
    );
  const vocabulary = {
    reasonCounts: Object.entries(REASON_LABELS).map(([id, label]) => ({
      id,
      label,
      count: vocabularyWords.filter((word) => word.reason === id).length,
    })),
    words: vocabularyWords,
  };
  const priorities = [];
  for (const type of questionTypes.filter((type) => type.wrong > 0).slice(0, 2))
    priorities.push({
      title: `复盘${type.label}`,
      evidence: `已答 ${type.answered} 题次，答错 ${type.wrong} 题次，错误率 ${type.errorRate}%；涉及 ${type.uniqueQuestions} 道独立已答题、${type.attempts} 次练习。`,
      interpretation:
        type.confidence === 'low'
          ? '当前样本较少或重复练习较集中，只作为下一步复习线索。'
          : '该类题目前存在可见失分，可通过新的同类题检验是否改善。',
      action: type.recommendation,
    });
  const unresolved = repeatedMistakes.filter((item) => item.lastOutcome !== 'correct');
  if (unresolved.length)
    priorities.push({
      title: '重做反复出错的题',
      evidence: `${repeatedMistakes.length} 道题至少答错两次，其中 ${unresolved.length} 道最近一次仍答错或未答。`,
      interpretation: '重复错误提示这些原题尚未稳定掌握；熟悉原题后的正确率不能直接代表迁移能力。',
      action: '先不看答案重做，再写出证据句与干扰项区别；随后完成一组未做过的同类题。',
    });
  if (summary.skipped)
    priorities.push({
      title: '核对未作答的题',
      evidence: `所选期间有 ${summary.skipped} 道客观题次未作答，未计入错误率分母。`,
      interpretation: '未答可能来自跳题、未完成或时间不足，当前结果无法单独确定原因。',
      action: '回到未答题补做，并记录当时是不会做、计划跳过还是时间不足。',
    });
  const strugglingWords = vocabularyWords.filter((word) => word.forgotCount > 0);
  if (strugglingWords.length)
    priorities.push({
      title: '复习仍难回忆的词',
      evidence: `所选期间有 ${strugglingWords.length} 个词在复习时被自行标记“没记住”。`,
      interpretation:
        '这是你自报的复习结果，尚未经实际回忆测验验证，也不能单独解释最初不认识的原因。',
      action: `先复习 ${strugglingWords
        .slice(0, 4)
        .map((word) => word.word)
        .join('、')}，遮住释义回忆并记录结果，再放回原句核对。`,
    });
  const overBudget = sections.filter((section) => section.overBudgetCount > 0);
  if (overBudget.length && priorities.length < 6)
    priorities.push({
      title: '检查分项时间安排',
      evidence:
        overBudget
          .map(
            (section) =>
              `${section.title}有 ${section.overBudgetCount}/${section.attemptCount} 次计时超过建议时长`,
          )
          .join('；') + '。',
      interpretation: '分项计时包含页面离开或后台停留，不能等同于实际专注时长。',
      action: '下一次练习记录中途离开的情况，再比较完整完成各部分所需的时间。',
    });
  if (!summary.answered)
    priorities.unshift({
      title: '补充可分析的作答',
      evidence: `所选期间有 ${selected.length} 次可读取的已交卷练习，客观题实际作答 ${summary.answered} 题次。`,
      interpretation: '目前不能判断哪个题型是你的弱项。',
      action: selected.length
        ? '选择未答的部分完成一次练习，交卷后标记错误原因。'
        : '先完成并提交一套练习；复盘时为错题和生词选择符合实际的原因。',
    });
  if (!priorities.length && selected.length)
    priorities.push({
      title: '用新题检验掌握情况',
      evidence: `所选期间已答 ${summary.answered} 题次，未记录客观题错误。`,
      interpretation: '当前结果不能证明所有题型均已掌握，仍需考虑题目覆盖与重复练习影响。',
      action: '完成一套未做过的试卷，并继续记录分项用时和生词。',
    });

  const limitations = [
    '仅分析按交卷时间落在所选期间内的已交卷练习；未交卷练习不参与统计。',
    '正确率与错误率以实际作答的客观题次为分母，未答单列；作文、翻译和自评分不用于客观题弱项判断。',
    '同一原题重复练习会提高熟悉度；样本把握度综合不同题目、试卷与练习次数，不是统计置信区间。',
    '分项用时为墙钟时间，可能包含离开页面或后台停留；没有逐题专注时长数据。',
    '词汇列表与原因分布覆盖当前完整单词本；收录 / 查询、复习次数和错题关联按所选期间统计，不代表实际接触该词的总次数。旧词仅能以首次收藏日期作为一次记录。',
    '词汇关联使用错题所在材料、题干和选项的完整词匹配，不进行词形归并；共现不代表词汇导致答错。',
    '不认识单词和答错的原因，只有主动标记与复习反馈提供直接线索；其余解释均需验证。',
    '失分按原卷客观题权重累计，包含未答；不同试卷难度与分值未等值校准，不预测正式六级成绩。',
  ];
  if (selected.some((attempt) => paperMap.get(attempt.paperId).kind === 'practice'))
    limitations.push('本期包含原创练习，篇幅与难度未经历年真题等值校准。');
  if (selected.length > habits.telemetryAttempts)
    limitations.push(
      `${selected.length - habits.telemetryAttempts} 次旧练习没有新版行为记录；改答与切换统计仅覆盖其余 ${habits.telemetryAttempts} 次，不能把缺失当作零次。`,
    );
  if (submitted.length > selected.length)
    limitations.push(
      `${submitted.length - selected.length} 次已交卷记录因原卷内容不可用而未参与统计。`,
    );
  if (unavailableKeys)
    limitations.push(`${unavailableKeys} 个客观题次缺少答案键，未参与正确率和错题统计。`);

  addEvidence(
    'summary:attempts',
    `${summary.attemptCount} 次已交卷练习，${summary.paperCount} 套卷；客观题已答 ${summary.answered} 题次，答对 ${summary.correct}，答错 ${summary.wrong}，未答 ${summary.skipped}；正确率 ${summary.accuracy === null ? '无数据' : `${summary.accuracy}%`}。`,
  );
  for (const type of questionTypes)
    addEvidence(
      `type:${type.id}`,
      `${type.label}：已答 ${type.answered}，答对 ${type.correct}，答错 ${type.wrong}，未答 ${type.skipped}；独立已答题 ${type.uniqueQuestions} 道、练习 ${type.attempts} 次。错误率 ${type.errorRate === null ? '无数据' : `${type.errorRate}%`}；样本把握度 ${type.confidence}。`,
    );
  for (const section of sections)
    addEvidence(
      `section:${section.sectionId}`,
      `${section.title}：${section.attemptCount} 次记录，墙钟累计 ${section.totalSeconds} 秒，平均 ${section.averageSeconds} 秒；平均建议 ${section.recommendedSeconds} 秒，超建议 ${section.overBudgetCount} 次。包含后台停留，不等于专注时间。`,
    );
  addEvidence(
    'habit:changes',
    `${habits.telemetryAttempts} 次带行为记录的练习：保存的非空改答 ${habits.answerChanges} 次，对改错 ${habits.correctToWrong} 次，错改对 ${habits.wrongToCorrect} 次，最后 10% 时段改答 ${habits.lateChanges} 次。旧练习不在此分母内。`,
  );
  addEvidence(
    'habit:switches',
    `${habits.telemetryAttempts} 次带行为记录的练习记录 ${habits.sectionSwitches} 次大题切换。没有逐题用时或注意力记录。`,
  );
  addEvidence(
    'habit:submission',
    `${selected.length} 次练习中 ${habits.autoSubmitted} 次到时自动交卷；不能单独推断速度或时间压力。`,
  );
  for (const [reason, count] of [...errorCounts].sort(([a], [b]) => a.localeCompare(b)))
    addEvidence(
      `error:${reason}`,
      `在 ${count} 条答错记录中，你自行标记原因为“${ERROR_LABELS[reason]}”；该统计是自述，未自动验证因果。`,
    );
  for (const row of repeatedMistakes) {
    const contrast = questionRows
      .get(JSON.stringify([row.paperId, row.questionId]))
      .observations.findLast((item) => item.outcome === 'wrong').contrast;
    addEvidence(
      `repeated:${stableId(row.paperId, row.questionId)}`,
      `${clip(row.paperTitle, 100)}第 ${clip(row.questionNumber, 30)} 题：作答记录 ${row.seenCount} 次，答错 ${row.wrongCount} 次；最近一次${{ wrong: '答错', correct: '答对', skipped: '未答' }[row.lastOutcome]}。最近一次答错时误选“${contrast.selected}”；正确选项“${contrast.expected}”。${clip(row.reason, 160)} 题干：${clip(row.prompt, 200)}`,
    );
  }
  for (const word of vocabularyWords)
    addEvidence(
      `word:${word.id}`,
      `${word.word}：原因标记“${word.reasonLabel}”；期间收录 / 查询 ${word.encounterCount} 次，复习 ${word.reviewCount} 次、其中自报没记住 ${word.forgotCount} 次；在 ${word.linkedMistakes} 条答错记录的材料中出现。${word.hypothesis} 原句：${clip(word.context, 250)}`,
    );
  const report = {
    rangeDays,
    summary,
    questionTypes,
    sections,
    repeatedMistakes,
    habits,
    vocabulary,
    priorities,
    limitations,
    evidence,
    recentAttempts: recentAttempts.reverse().slice(0, 20),
  };
  const fingerprintInput = {
    report,
    attempts: selected.map(
      ({
        id,
        paperId,
        submittedAt,
        answers,
        sectionSpent,
        telemetry,
        errorReasons,
        autoSubmitted,
      }) => ({
        id,
        paperId,
        submittedAt,
        answers,
        sectionSpent,
        telemetry,
        errorReasons,
        autoSubmitted,
      }),
    ),
    papers: [...new Set(selected.map((attempt) => attempt.paperId))]
      .sort()
      .map((id) => paperMap.get(id)),
    words: [...words].sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(canonical(fingerprintInput)))
    .digest('hex');
  return { generatedAt: new Date(current).toISOString(), fingerprint, ...report };
}
