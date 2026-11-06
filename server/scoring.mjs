export function allQuestions(paper) {
  return paper.sections.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.questions.map((question) => ({ ...question, sectionId: section.id })),
    ),
  );
}

const rounded = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function gradeAttempt(paper, answers, selfScores = {}) {
  const items = allQuestions(paper).map((question) => {
    const answer = Object.hasOwn(answers, question.id) ? answers[question.id] : '';
    if (question.type === 'choice' && question.grading !== 'manual') {
      const correct = answer === question.answer;
      return {
        questionId: question.id,
        number: question.number,
        sectionId: question.sectionId,
        correct,
        answer,
        expected: question.answer,
        score: correct ? question.weight : 0,
        maxScore: question.weight,
        explanation: question.explanation || '',
      };
    }
    const wordCount = (answer.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || []).length;
    const score = Object.hasOwn(selfScores, question.id) ? selfScores[question.id] : null;
    return {
      questionId: question.id,
      number: question.number,
      sectionId: question.sectionId,
      correct: null,
      answer,
      expected: question.type === 'choice' ? question.answer || '' : '',
      score,
      maxScore: question.weight,
      explanation: question.explanation || '',
      referenceAnswer: question.referenceAnswer || '',
      feedback:
        question.type === 'choice'
          ? '此题采用人工评分，不计入自动判分与错题率；请核对原题后自行评分。'
          : !question.referenceAnswer?.trim()
            ? '原题未提供参考答案。作答已保留，请人工核对后评分。'
            : answer.trim()
              ? `已输入 ${wordCount} 个英文单词。请对照参考答案，从内容、结构、语言准确性三个方面自行评分。`
              : '此题未作答，请结合参考答案复习，并自行评分。',
      wordCount,
    };
  });
  const objective = items.filter((item) => item.correct !== null);
  const subjective = items.filter((item) => item.correct === null);
  const objectiveScore = rounded(objective.reduce((sum, item) => sum + item.score, 0));
  const objectiveMax = rounded(objective.reduce((sum, item) => sum + item.maxScore, 0));
  const subjectiveComplete = subjective.every((item) => item.score !== null);
  const subjectiveScore = subjectiveComplete
    ? rounded(subjective.reduce((sum, item) => sum + item.score, 0))
    : null;
  const totalScore = subjectiveComplete ? rounded(objectiveScore + subjectiveScore) : null;
  return {
    objectiveScore,
    objectiveMax,
    subjectiveScore,
    subjectiveMax: rounded(subjective.reduce((sum, item) => sum + item.maxScore, 0)),
    totalScore,
    estimated710: totalScore === null ? null : Math.round(totalScore * 7.1),
    correctCount: objective.filter((item) => item.correct).length,
    questionCount: objective.length,
    totalQuestionCount: items.length,
    items,
  };
}

export function sanitizePaper(paper) {
  const copy = structuredClone(paper);
  for (const section of copy.sections) {
    for (const group of section.groups) {
      for (const question of group.questions) {
        delete question.answer;
        delete question.explanation;
        delete question.referenceAnswer;
        delete question.keywords;
      }
    }
  }
  return copy;
}
