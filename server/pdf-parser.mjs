const names = { writing: '写作', listening: '听力理解', reading: '阅读理解', translation: '翻译' };
const normalize = (value) =>
  value
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u0000\u00ad]/g, '')
    .trim();

function part(line) {
  if (line.length > 100) return null;
  const prefix = /^(?:part\s+[IVXL\d]+\s*[:.、-]?\s*|[一二三四五六IVXL\d]+[、.．]\s*)?/i;
  const value = line.replace(prefix, '');
  if (/^(?:writing|写作|作文)(?:\b|\s|[（(:：]|$)/i.test(value)) return 'writing';
  if (/^(?:listening(?:\s+comprehension)?|听力(?:理解)?)(?:\b|\s|[（(:：]|$)/i.test(value))
    return 'listening';
  if (/^(?:reading(?:\s+comprehension)?|阅读(?:理解)?)(?:\b|\s|[（(:：]|$)/i.test(value))
    return 'reading';
  if (/^(?:translation|翻译)(?:\b|\s|[（(:：]|$)/i.test(value)) return 'translation';
  return null;
}

function optionsIn(line) {
  const pattern = /(?:^|\s+)(?:\[([A-O])\]|\(([A-O])\)|([A-O])[).、．])\s*/g;
  const matches = [...line.matchAll(pattern)];
  return matches.map((match, index) => ({
    id: match[1] || match[2] || match[3],
    index: match.index,
    text: line
      .slice(match.index + match[0].length, matches[index + 1]?.index ?? line.length)
      .trim(),
  }));
}

function answerKeys(lines) {
  const keys = new Map();
  for (const { text } of lines) {
    for (const match of text.matchAll(
      /(?:^|[\s,，;；])([0-9]{1,3})\s*[.、．):：-]?\s*([A-O])(?=$|[\s,，;；.。])/g,
    )) {
      const number = Number(match[1]);
      if (keys.has(number) && keys.get(number) !== match[2]) keys.set(number, null);
      else if (!keys.has(number)) keys.set(number, match[2]);
    }
  }
  return keys;
}

function parseBlock(block, keys, warnings) {
  const leading = [],
    rawQuestions = [];
  let current = null,
    explaining = false,
    referencing = false;
  const addContent = (text) => {
    if (!text) return;
    const options = optionsIn(text);
    if (options.length && (options[0].index === 0 || options[0].id === 'A')) {
      const prefix = text.slice(0, options[0].index).trim();
      if (prefix) current.prompt.push(prefix);
      for (const option of options) current.options.push({ id: option.id, text: option.text });
    } else if (current.options.length) current.options.at(-1).text += '\n' + text;
    else current.prompt.push(text);
  };
  for (const line of block.lines) {
    const match =
      line.text.match(/^(?:Question\s+)?([0-9]{1,3})\s*[.)、．]\s*(.*)$/i) ||
      line.text.match(/^Question\s+([0-9]{1,3})\s*[:：]?\s*(.*)$/i);
    if (match) {
      current = {
        number: Number(match[1]),
        page: line.page,
        prompt: [],
        options: [],
        explanation: [],
        referenceAnswer: '',
      };
      rawQuestions.push(current);
      explaining = false;
      referencing = false;
      addContent(match[2]);
      continue;
    }
    if (!current) {
      leading.push(line);
      continue;
    }
    const answer = line.text.match(
      /^(?:参考)?(?:答案|正确答案|Answer|Correct answer)\s*[:：]\s*([A-O])(?:[.。\s]|$)(.*)$/i,
    );
    if (answer) {
      current.answer = answer[1].toUpperCase();
      if (answer[2]) current.explanation.push(answer[2]);
      explaining = false;
      referencing = false;
      continue;
    }
    const reference = line.text.match(
      /^(?:参考答案|参考译文|参考范文|Answer|Sample answer|Reference answer)\s*[:：]\s*(.*)$/i,
    );
    if (reference) {
      current.referenceAnswer = reference[1];
      referencing = true;
      explaining = false;
      continue;
    }
    const explanation = line.text.match(/^(?:解析|Explanation)\s*[:：]\s*(.*)$/i);
    if (explanation) {
      current.explanation.push(explanation[1]);
      explaining = true;
      referencing = false;
      continue;
    }
    if (referencing) current.referenceAnswer += '\n' + line.text;
    else if (explaining) current.explanation.push(line.text);
    else addContent(line.text);
  }
  const bank = leading.flatMap((line) => optionsIn(line.text)).filter((option) => option.text);
  const uniqueBank =
    bank.length >= 4 && new Set(bank.map((option) => option.id)).size === bank.length;
  const passage = leading
    .map((line) => line.text)
    .join('\n')
    .trim();
  if (!rawQuestions.length && uniqueBank) {
    const blanks = [...passage.matchAll(/(?:\(|\b)([0-9]{1,3})\)?\s*_{2,}/g)];
    for (const number of new Set(blanks.map((match) => Number(match[1]))))
      rawQuestions.push({
        number,
        page: block.page,
        prompt: [`第 ${number} 空`],
        options: [],
        explanation: [],
      });
  }
  if (
    !rawQuestions.length &&
    ['writing', 'translation'].includes(block.section) &&
    passage.length > 20
  ) {
    const reference = passage.match(
      /(?:^|\n)(?:参考范文|参考译文|参考答案|Sample answer|Reference answer)(?:\s*[:：]\s*|\s*\n)([\s\S]*)/i,
    );
    rawQuestions.push({
      number: null,
      page: block.page,
      prompt: [reference ? passage.slice(0, reference.index).trim() : passage],
      options: [],
      explanation: [],
      referenceAnswer: reference?.[1]?.trim() || '',
    });
  }
  const questions = rawQuestions.map((raw) => {
    if (!raw.options.length && uniqueBank && !['writing', 'translation'].includes(block.section)) {
      const shortBank = bank.every((option) => option.text.length <= 100);
      raw.options = bank.map((option) => ({
        id: option.id,
        text: shortBank ? option.text : `段落 ${option.id}`,
      }));
    }
    const validOptions =
      raw.options.length >= 2 &&
      raw.options.every((option) => option.text.trim()) &&
      new Set(raw.options.map((option) => option.id)).size === raw.options.length;
    const type = validOptions ? 'choice' : 'text';
    let prompt =
      raw.prompt.join('\n').trim() || `第 ${raw.number || rawQuestions.indexOf(raw) + 1} 题`;
    if (!validOptions && raw.options.length) {
      prompt += '\n' + raw.options.map((option) => `${option.id}. ${option.text}`).join('\n');
      warnings.push(`第 ${raw.number || '?'} 题选项不完整，暂按人工评分题保留。`);
    }
    const key = raw.answer || keys.get(raw.number);
    const answer =
      validOptions && raw.options.some((option) => option.id === key) ? key : undefined;
    if (key && validOptions && !answer)
      warnings.push(`第 ${raw.number} 题答案 ${key} 不在识别到的选项中，请核对。`);
    return {
      id: '',
      number: raw.number,
      type,
      prompt,
      options: validOptions
        ? raw.options.map((option) => ({ ...option, text: option.text.trim() }))
        : [],
      ...(answer ? { answer } : {}),
      grading: type === 'choice' && answer ? 'auto' : 'manual',
      referenceAnswer: raw.referenceAnswer || (type === 'text' ? raw.answer || '' : ''),
      explanation: raw.explanation.join('\n').trim(),
      weight: 1,
      sourcePage: raw.page,
    };
  });
  return {
    title: block.title,
    passage:
      ['writing', 'translation'].includes(block.section) && rawQuestions.length === 1
        ? ''
        : passage,
    questions,
    sourcePage: block.page,
  };
}

export function parsePdfQuestions(pages, { id, filename, now = Date.now() } = {}) {
  const warnings = [];
  const lines = pages
    .flatMap((page) =>
      page.text.split(/\r?\n/).map((text) => ({ text: normalize(text), page: page.number })),
    )
    .filter(
      (line) =>
        line.text &&
        !/^(?:Page\s+\d+(?:\s+of\s+\d+)?|第\s*\d+\s*页(?:\s*共\s*\d+\s*页)?|[-–]\s*\d+\s*[-–])$/i.test(
          line.text,
        ),
    );
  const keyIndex = lines.findIndex(
    (line, index) =>
      /^(?:参考答案(?:[与及]解析)?|答案(?:[与及]?解析)?|Answers?(?:\s*Key|\s+Sheet)?|Keys?\s+to\s+.+)\s*[:：]?$/i.test(
        line.text,
      ) && answerKeys(lines.slice(index + 1)).size > 0,
  );
  const keys = answerKeys(keyIndex < 0 ? [] : lines.slice(keyIndex + 1));
  const body = keyIndex < 0 ? lines : lines.slice(0, keyIndex);
  const blocks = [];
  let block = { section: 'reading', title: 'PDF 题目', page: 1, lines: [] };
  const flush = () => {
    if (block.lines.length) blocks.push(block);
  };
  for (const line of body) {
    const section = part(line.text);
    if (section) {
      flush();
      block = { section, title: names[section], page: line.page, lines: [] };
      continue;
    }
    if (
      /^(?:Section\s+[A-C]\b|Passage\s+(?:One|Two|Three|\d+)\b|Text\s+\d+\b|Questions?\s+\d+\s*(?:to|[-–])\s*\d+.*(?:based|refer)|阅读[一二三四\d])/i.test(
        line.text,
      ) &&
      line.text.length < 200
    ) {
      flush();
      block = {
        section: block.section,
        title: line.text.slice(0, 150),
        page: line.page,
        lines: [],
      };
      continue;
    }
    block.lines.push(line);
  }
  flush();
  const sections = [];
  for (const [index, value] of blocks.entries()) {
    const group = parseBlock(value, keys, warnings);
    if (!group.questions.length) continue;
    let section = sections.find((section) => section.id === value.section);
    if (!section) {
      section = { id: value.section, title: names[value.section], durationMinutes: 1, groups: [] };
      sections.push(section);
    }
    for (let offset = 0; offset < group.questions.length; offset += 100) {
      section.groups.push({
        ...group,
        id: `pdf-group-${index + 1}-${offset / 100 + 1}`,
        questions: group.questions.slice(offset, offset + 100),
      });
    }
    if (section.groups.length > 30)
      throw Object.assign(new Error('同一大题超过 30 个题组，请拆分 PDF 后导入。'), {
        status: 400,
      });
  }
  const all = sections.flatMap((section) => section.groups.flatMap((group) => group.questions));
  if (all.length > 500)
    throw Object.assign(new Error('PDF 识别到的题目超过 500 道，请拆分文件。'), { status: 400 });
  const used = new Set();
  let next = 1;
  for (const [index, question] of all.entries()) {
    question.id = `pdf-question-${index + 1}`;
    if (!question.number || question.number > 500 || used.has(question.number)) {
      if (question.number) question.originalNumber = String(question.number);
      while (
        used.has(next) ||
        all.some((other) => other !== question && other.number === next && !used.has(next))
      )
        next++;
      question.number = next;
    }
    used.add(question.number);
    question.weight = (Math.floor(10000 / all.length) + Number(index < 10000 % all.length)) / 100;
  }
  for (const section of sections) {
    const count = section.groups.reduce((sum, group) => sum + group.questions.length, 0);
    section.durationMinutes =
      section.id === 'writing'
        ? 30
        : section.id === 'translation'
          ? 30
          : Math.min(60, Math.max(5, Math.ceil(count * 1.5)));
  }
  const manual = all.filter((question) => question.grading === 'manual').length;
  if (manual) warnings.push(`初始识别有 ${manual} 道题缺少可自动核验的答案，已先设为人工评分。`);
  if (sections.some((section) => section.id === 'listening'))
    warnings.push('PDF 未包含可播放的听力音频，听力题需补充音频或配合原始录音。');
  if (!all.length) warnings.push('没有识别到完整题目。原文和 PDF 已保留，可在校对页新增题目。');
  const date = new Date(now);
  const namedDate = filename.match(/(19[89][0-9]|20[0-9]{2})(?:[年 ._-]?([01]?[0-9])月?)?/);
  const namedMonth = Number(namedDate?.[2]);
  return {
    draft: {
      id,
      title: filename.replace(/\.pdf$/i, '').slice(0, 300) || 'PDF 试卷',
      subtitle: 'PDF 导入',
      kind: 'practice',
      year: namedDate ? Number(namedDate[1]) : date.getUTCFullYear(),
      month: namedMonth >= 1 && namedMonth <= 12 ? namedMonth : date.getUTCMonth() + 1,
      set: 1,
      available: true,
      durationMinutes: Math.max(
        5,
        sections.reduce((sum, section) => sum + section.durationMinutes, 0),
      ),
      source: { label: filename.slice(0, 500), url: '' },
      sections,
    },
    warnings: [...new Set(warnings)].slice(0, 20),
    stats: { questionCount: all.length, manualGraded: manual, autoGraded: all.length - manual },
  };
}
