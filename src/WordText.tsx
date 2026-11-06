import { Fragment, memo } from 'react';

export type SaveWord = (word: string, context: string) => Promise<unknown>;
export default memo(function WordText({
  text,
  onWord,
  context,
}: {
  text: string;
  onWord: SaveWord;
  context?: string;
}) {
  let offset = 0;
  return (
    <>
      {text.split(/([A-Za-z]+(?:['-][A-Za-z]+)*)/g).map((part, index) => {
        const position = offset;
        offset += part.length;
        if (!/^[A-Za-z]/.test(part)) return <Fragment key={index}>{part}</Fragment>;
        return (
          <button
            className="ex-word"
            type="button"
            key={index}
            title={`加入单词本：${part}`}
            aria-label={`收藏单词 ${part}`}
            onClick={() => {
              const windowStart = Math.max(0, position - 400);
              const previous = [...text.slice(windowStart, position).matchAll(/[.!?\n。！？]/g)].at(
                -1,
              );
              const start = windowStart + (previous ? (previous.index ?? 0) + 1 : 0);
              const wordEnd = position + part.length;
              const boundary = text.slice(wordEnd, start + 1000).search(/[.!?\n。！？]/);
              const end = boundary < 0 ? start + 1000 : wordEnd + boundary + 1;
              void onWord(part, (context || text.slice(start, end)).trim().slice(0, 1000)).catch(
                () => {},
              );
            }}
          >
            {part}
          </button>
        );
      })}
    </>
  );
});
