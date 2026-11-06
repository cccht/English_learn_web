import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getStroke } from 'perfect-freehand';
import {
  Check,
  Cloud,
  Download,
  Eraser,
  Hand,
  Highlighter,
  PenLine,
  Redo2,
  RefreshCw,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/noto-sans-sc/400.css';
import { useAnnotation } from './useAnnotation';
import {
  NOTE_COLORS,
  PAGE_WIDTH,
  type InkPoint,
  type InkStroke,
  type NotebookHandle,
} from './note-types';
import WordText, { type SaveWord } from './WordText';
import './notebook.css';

type Tool = 'pan' | 'pen' | 'highlighter' | 'eraser';
type Props = {
  userId: string;
  attemptId: string;
  groupId: string;
  text: string;
  title: string;
  onWord: SaveWord;
  notify: (message: string) => void;
};
const uid = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function strokePath(stroke: InkStroke, complete = true) {
  const points = getStroke(stroke.points, {
    size: stroke.size,
    thinning: stroke.tool === 'highlighter' ? 0 : 0.55,
    smoothing: 0.65,
    streamline: 0.45,
    simulatePressure: !stroke.pressure,
    last: complete,
  });
  return points.length
    ? `M${points.map((point) => `${point[0].toFixed(2)},${point[1].toFixed(2)}`).join('L')}Z`
    : '';
}
const Stroke = memo(function Stroke({ stroke }: { stroke: InkStroke }) {
  const path = useMemo(() => strokePath(stroke), [stroke]);
  return (
    <path
      data-stroke-id={stroke.id}
      d={path}
      fill={stroke.color}
      opacity={stroke.tool === 'highlighter' ? 0.3 : 1}
    />
  );
});

const Notebook = memo(
  forwardRef<NotebookHandle, Props>(function Notebook(
    { userId, attemptId, groupId, text, title, onWord, notify },
    ref,
  ) {
    const notes = useAnnotation(userId, attemptId, groupId);
    const [tool, setTool] = useState<Tool>('pan');
    const [penColor, setPenColor] = useState<string>(NOTE_COLORS[0]);
    const [highlightColor, setHighlightColor] = useState<string>(NOTE_COLORS[4]);
    const [size, setSize] = useState(4);
    const [fingerDraw, setFingerDraw] = useState(false);
    const [settings, setSettings] = useState(false);
    const [typed, setTyped] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [width, setWidth] = useState(360);
    const [height, setHeight] = useState(700);
    const [fontReady, setFontReady] = useState(false);
    const [drawing, setDrawing] = useState(false);
    const [undo, setUndo] = useState<InkStroke[][]>([]);
    const [redo, setRedo] = useState<InkStroke[][]>([]);
    const scroll = useRef<HTMLDivElement>(null);
    const paper = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const overlay = useRef<SVGSVGElement>(null);
    const live = useRef<SVGPathElement>(null);
    const active = useRef<{ id: number; stroke: InkStroke } | null>(null);
    const pan = useRef<{
      id: number;
      x: number;
      y: number;
      left: number;
      top: number;
      moved: boolean;
    } | null>(null);
    const touches = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef<{ distance: number; zoom: number; x: number; y: number } | null>(null);
    const eraseBefore = useRef<InkStroke[] | null>(null);
    const eraserPointer = useRef<number | null>(null);
    const data = useRef(notes.annotation);
    const raf = useRef(0);
    const suppressClick = useRef(false);
    data.current = notes.annotation;
    const scale = Math.max(0.1, (width - 24) / PAGE_WIDTH) * zoom;
    const chosenColor = tool === 'highlighter' ? highlightColor : penColor;
    const ready = notes.loaded && fontReady;
    useImperativeHandle(ref, () => ({ flush: notes.flush }), [notes.flush]);

    useEffect(() => {
      let alive = true;
      Promise.all([
        document.fonts.load('30px "Source Serif 4"'),
        /[\u3400-\u9fff]/.test(text)
          ? document.fonts.load('30px "Noto Sans SC"', text)
          : Promise.resolve(),
      ])
        .then(() => {
          if (alive) setFontReady(true);
        })
        .catch(() => {
          if (alive) notify('文章字体暂未加载，批注工具将在字体就绪后启用。');
        });
      const observer = new ResizeObserver(() => {
        if (scroll.current?.clientWidth) setWidth(scroll.current.clientWidth);
        if (content.current)
          setHeight(Math.max(650, Math.ceil(content.current.scrollHeight) + 210));
      });
      if (scroll.current) observer.observe(scroll.current);
      if (content.current) observer.observe(content.current);
      return () => {
        alive = false;
        observer.disconnect();
        cancelAnimationFrame(raf.current);
      };
    }, [text, notify]);
    useEffect(() => {
      setUndo([]);
      setRedo([]);
    }, [notes.generation]);

    const commit = (strokes: InkStroke[], record = true) => {
      const previous = data.current.strokes;
      if (record) {
        setUndo((old) => [...old.slice(-59), previous]);
        setRedo([]);
      }
      data.current = { ...data.current, strokes };
      notes.change({ strokes, textNote: data.current.textNote });
    };
    const undoStroke = () => {
      const previous = undo.at(-1);
      if (!previous) return;
      const snapshot = data.current.strokes;
      setRedo((old) => [...old, snapshot]);
      setUndo((old) => old.slice(0, -1));
      commit(previous, false);
    };
    const redoStroke = () => {
      const next = redo.at(-1);
      if (!next) return;
      const snapshot = data.current.strokes;
      setUndo((old) => [...old, snapshot]);
      setRedo((old) => old.slice(0, -1));
      commit(next, false);
    };
    const pointAt = (event: PointerEvent | ReactPointerEvent): InkPoint => {
      const rect = paper.current!.getBoundingClientRect();
      return [
        Math.round(
          Math.max(
            0,
            Math.min(PAGE_WIDTH, ((event.clientX - rect.left) * PAGE_WIDTH) / rect.width),
          ) * 100,
        ) / 100,
        Math.round(
          Math.max(0, Math.min(200000, ((event.clientY - rect.top) * height) / rect.height)) * 100,
        ) / 100,
        Math.round((event.pressure > 0 ? Math.min(1, event.pressure) : 0.5) * 1000) / 1000,
      ];
    };
    const renderLive = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        if (active.current && live.current)
          live.current.setAttribute('d', strokePath(active.current.stroke, false));
      });
    };
    const erase = (point: InkPoint) => {
      const hit = new Set<string>();
      overlay.current?.querySelectorAll<SVGPathElement>('[data-stroke-id]').forEach((path) => {
        if (path.isPointInFill(new DOMPoint(point[0], point[1]))) hit.add(path.dataset.strokeId!);
      });
      if (hit.size)
        commit(
          data.current.strokes.filter((stroke) => !hit.has(stroke.id)),
          false,
        );
    };
    const capture = (id: number) => {
      try {
        paper.current?.setPointerCapture(id);
      } catch {
        /* Synthetic test events may not own an active pointer. */
      }
    };
    const down = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      if (active.current || eraserPointer.current !== null) return;
      if (event.pointerType === 'pen') {
        touches.current.clear();
        pinch.current = null;
      }
      if (event.pointerType === 'touch' && !fingerDraw) {
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        capture(event.pointerId);
        if (touches.current.size === 2) {
          const [a, b] = [...touches.current.values()];
          const rect = paper.current!.getBoundingClientRect();
          pinch.current = {
            distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            zoom,
            x: ((a.x + b.x) / 2 - rect.left) / scale,
            y: ((a.y + b.y) / 2 - rect.top) / scale,
          };
          pan.current = null;
          suppressClick.current = true;
          event.preventDefault();
          return;
        }
        if (touches.current.size > 2) return;
      }
      const ink =
        event.pointerType === 'pen' ||
        (tool !== 'pan' && (event.pointerType !== 'touch' || fingerDraw));
      if (!ink) {
        pan.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: scroll.current!.scrollLeft,
          top: scroll.current!.scrollTop,
          moved: false,
        };
        return;
      }
      if (!ready) return;
      event.preventDefault();
      capture(event.pointerId);
      paper.current?.focus({ preventScroll: true });
      pan.current = null;
      suppressClick.current = true;
      if (tool === 'eraser') {
        eraserPointer.current = event.pointerId;
        eraseBefore.current = data.current.strokes;
        erase(pointAt(event));
        return;
      }
      if (
        data.current.strokes.length >= 1500 ||
        data.current.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) >= 150000
      ) {
        notify('本篇笔迹已到容量上限，请先导出批注。');
        return;
      }
      const selected = tool === 'pan' ? 'pen' : tool;
      if (tool === 'pan') setTool('pen');
      active.current = {
        id: event.pointerId,
        stroke: {
          id: uid(),
          tool: selected as 'pen' | 'highlighter',
          color: selected === 'highlighter' ? highlightColor : penColor,
          size: selected === 'highlighter' ? 22 : size,
          pressure: event.pointerType === 'pen',
          points: [pointAt(event)],
        },
      };
      live.current?.setAttribute('fill', active.current.stroke.color);
      live.current?.setAttribute('opacity', selected === 'highlighter' ? '0.3' : '1');
      setDrawing(true);
      renderLive();
    };
    const move = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (touches.current.has(event.pointerId))
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch.current && touches.current.size >= 2) {
        event.preventDefault();
        const [a, b] = [...touches.current.values()],
          anchor = pinch.current;
        const nextZoom = Math.min(
          2.5,
          Math.max(1, (anchor.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / anchor.distance),
        );
        const nextScale = Math.max(0.1, (width - 24) / PAGE_WIDTH) * nextZoom;
        setZoom(nextZoom);
        requestAnimationFrame(() => {
          if (!paper.current || !scroll.current) return;
          const rect = paper.current.getBoundingClientRect();
          scroll.current.scrollLeft += rect.left + anchor.x * nextScale - (a.x + b.x) / 2;
          scroll.current.scrollTop += rect.top + anchor.y * nextScale - (a.y + b.y) / 2;
        });
        return;
      }
      if (eraserPointer.current !== null) {
        if (eraserPointer.current === event.pointerId) {
          event.preventDefault();
          erase(pointAt(event));
        }
        return;
      }
      if (active.current) {
        if (active.current.id !== event.pointerId) return;
        event.preventDefault();
        const events = event.nativeEvent.getCoalescedEvents?.() || [];
        const available = Math.min(
          5000,
          150000 - data.current.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0),
        );
        for (const sample of events.length ? events : [event.nativeEvent]) {
          const point = pointAt(sample);
          const last = active.current.stroke.points.at(-1)!;
          if (
            active.current.stroke.points.length < available &&
            Math.hypot(point[0] - last[0], point[1] - last[1]) >= 0.45
          )
            active.current.stroke.points.push(point);
        }
        renderLive();
        return;
      }
      if (pan.current?.id === event.pointerId) {
        const dx = event.clientX - pan.current.x,
          dy = event.clientY - pan.current.y;
        if (Math.hypot(dx, dy) > 4 || pan.current.moved) {
          event.preventDefault();
          capture(event.pointerId);
          pan.current.moved = true;
          suppressClick.current = true;
          scroll.current!.scrollLeft = pan.current.left - dx;
          scroll.current!.scrollTop = pan.current.top - dy;
        }
      }
    };
    const end = (event: ReactPointerEvent<HTMLDivElement>, cancel = false) => {
      touches.current.delete(event.pointerId);
      if (pinch.current) {
        if (touches.current.size < 2) pinch.current = null;
        setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        return;
      }
      if (
        active.current?.id !== event.pointerId &&
        eraserPointer.current !== event.pointerId &&
        pan.current?.id !== event.pointerId
      )
        return;
      if (active.current?.id === event.pointerId) {
        cancelAnimationFrame(raf.current);
        if (!cancel) commit([...data.current.strokes, active.current.stroke]);
        active.current = null;
        live.current?.setAttribute('d', '');
        setDrawing(false);
      }
      if (eraserPointer.current === event.pointerId && eraseBefore.current) {
        const before = eraseBefore.current;
        if (before !== data.current.strokes) {
          setUndo((old) => [...old.slice(-59), before]);
          setRedo([]);
        }
        eraseBefore.current = null;
        eraserPointer.current = null;
      }
      if (pan.current?.id === event.pointerId) pan.current = null;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    };
    const download = () => {
      const blob = new Blob(
        [
          JSON.stringify(
            { title, text, annotation: data.current, exportedAt: new Date().toISOString() },
            null,
            2,
          ),
        ],
        { type: 'application/json;charset=utf-8' },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `shici-notes-${groupId}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const statusText = !fontReady
      ? '排版中'
      : {
          loading: '载入批注',
          saved: '批注已保存',
          saving: '同步批注',
          local: '本机草稿',
          error: '载入失败',
          conflict: '版本冲突',
        }[notes.status];
    return (
      <div
        className="nk-root"
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'z' &&
            !(event.target instanceof HTMLInputElement) &&
            !(event.target instanceof HTMLTextAreaElement)
          ) {
            event.preventDefault();
            if (event.shiftKey) redoStroke();
            else undoStroke();
          }
        }}
      >
        <div className="nk-tools-wrap">
          <div className="nk-toolbar" role="toolbar" aria-label="文章批注工具">
            {(
              [
                { id: 'pan', title: '滚动与查词', icon: Hand },
                { id: 'pen', title: '钢笔', icon: PenLine },
                { id: 'highlighter', title: '荧光笔', icon: Highlighter },
                { id: 'eraser', title: '橡皮擦（整笔）', icon: Eraser },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-label={item.title}
                title={item.title}
                aria-pressed={tool === item.id}
                className={tool === item.id ? 'selected' : ''}
                disabled={drawing}
                onClick={() => setTool(item.id)}
              >
                <item.icon size={19} />
              </button>
            ))}
            <button
              aria-label="撤销笔迹"
              title="撤销笔迹"
              disabled={!undo.length || drawing}
              onClick={undoStroke}
            >
              <Undo2 size={18} />
            </button>
            <button
              aria-label="重做笔迹"
              title="重做笔迹"
              disabled={!redo.length || drawing}
              onClick={redoStroke}
            >
              <Redo2 size={18} />
            </button>
            <button
              aria-label="批注设置"
              title="颜色、笔宽与文字备注"
              aria-expanded={settings}
              className={settings ? 'selected' : ''}
              onClick={() => setSettings((value) => !value)}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
          {settings && (
            <div className="nk-settings">
              <div className="nk-settings-heading">
                <strong>批注设置</strong>
                <button aria-label="关闭批注设置" onClick={() => setSettings(false)}>
                  <X size={17} />
                </button>
              </div>
              <div className="nk-swatches" aria-label="墨迹颜色">
                {NOTE_COLORS.map((color) => (
                  <button
                    key={color}
                    title={color}
                    aria-label={`墨迹颜色 ${color}`}
                    aria-pressed={chosenColor === color}
                    onClick={() =>
                      tool === 'highlighter' ? setHighlightColor(color) : setPenColor(color)
                    }
                  >
                    <span style={{ background: color }}>
                      {chosenColor === color && <Check size={14} />}
                    </span>
                  </button>
                ))}
              </div>
              <label className="nk-width">
                钢笔宽度{' '}
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={size}
                  onChange={(event) => setSize(Number(event.target.value))}
                />
                <span>{size}</span>
              </label>
              <label className="nk-check">
                <input
                  type="checkbox"
                  checked={fingerDraw}
                  onChange={(event) => setFingerDraw(event.target.checked)}
                />
                手指书写
              </label>
              <label className="nk-check">
                <input
                  type="checkbox"
                  checked={typed}
                  onChange={(event) => setTyped(event.target.checked)}
                />
                文字备注
              </label>
              <div className="nk-zoom">
                <button
                  aria-label="缩小文章"
                  disabled={zoom <= 1}
                  onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
                >
                  <ZoomOut size={18} />
                </button>
                <button title="适合宽度" onClick={() => setZoom(1)}>
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  aria-label="放大文章"
                  disabled={zoom >= 2.5}
                  onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))}
                >
                  <ZoomIn size={18} />
                </button>
              </div>
              <div className="nk-setting-actions">
                <button onClick={download}>
                  <Download size={15} />
                  导出批注
                </button>
                <button
                  disabled={!notes.annotation.strokes.length}
                  onClick={() => {
                    if (window.confirm('清空本篇手写笔迹？清空后仍可撤销。')) commit([]);
                  }}
                >
                  <Trash2 size={15} />
                  清空笔迹
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="nk-status" role="status">
          <Cloud size={12} />
          <span>{statusText}</span>
          <small>{notes.annotation.strokes.length} 笔</small>
          {['local', 'error'].includes(notes.status) && (
            <button aria-label="重试批注同步" title="重试同步" onClick={() => void notes.retry()}>
              <RefreshCw size={13} />
            </button>
          )}
        </div>
        {(notes.error || notes.localError) && (
          <div className="nk-warning" role="alert">
            <span>{notes.localError || notes.error}</span>
            {notes.conflict && (
              <div>
                <button onClick={download}>下载本机副本</button>
                <button
                  onClick={() => {
                    if (window.confirm('使用服务器版本？本机当前批注会先保留为备份。'))
                      void notes.resolve(false);
                  }}
                >
                  使用服务器版本
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('以本机批注替换服务器版本？两个版本都会先保留到本机备份。'))
                      void notes.resolve(true);
                  }}
                >
                  以本机为准
                </button>
              </div>
            )}
          </div>
        )}
        <div ref={scroll} className="nk-scroll" aria-label="文章滚动区">
          <div
            className="nk-page-space"
            style={{ width: PAGE_WIDTH * scale, height: height * scale }}
          >
            <div
              ref={paper}
              className={`nk-page tool-${tool}`}
              tabIndex={0}
              style={{ width: PAGE_WIDTH, height, transform: `scale(${scale})` }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={(event) => end(event)}
              onPointerCancel={(event) => end(event, true)}
              onClickCapture={(event) => {
                if (suppressClick.current) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              <div ref={content} className="nk-article">
                <WordText text={text} onWord={onWord} />
              </div>
              <svg
                ref={overlay}
                className="nk-ink"
                viewBox={`0 0 ${PAGE_WIDTH} ${height}`}
                aria-label={`手写批注，${notes.annotation.strokes.length} 笔`}
              >
                <g>
                  {notes.annotation.strokes.map((stroke) => (
                    <Stroke key={stroke.id} stroke={stroke} />
                  ))}
                </g>
                <path ref={live} />
              </svg>
            </div>
          </div>
        </div>
        {typed && (
          <div className="nk-typed">
            <div>
              <label htmlFor={`note-${groupId}`}>
                <StickyNote size={14} />
                文字备注
              </label>
              <button aria-label="关闭文字备注" onClick={() => setTyped(false)}>
                <X size={17} />
              </button>
            </div>
            <textarea
              id={`note-${groupId}`}
              value={notes.annotation.textNote}
              maxLength={10000}
              placeholder="写下翻译、思路或疑问…"
              disabled={!notes.loaded}
              onChange={(event) =>
                notes.change({ strokes: data.current.strokes, textNote: event.target.value })
              }
            />
          </div>
        )}
      </div>
    );
  }),
);
export default Notebook;
