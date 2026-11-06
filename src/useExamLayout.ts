import { useEffect, useState } from 'react';
export type DisplayMode = 'auto' | 'desktop' | 'tablet' | 'phone';
export function useExamLayout(userId: string) {
  const key = `shici-display:${userId}`;
  const [preference, setPreference] = useState<DisplayMode>(() => {
    try {
      const saved = localStorage.getItem(key);
      return ['auto', 'desktop', 'tablet', 'phone'].includes(saved || '')
        ? (saved as DisplayMode)
        : 'auto';
    } catch {
      return 'auto';
    }
  });
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    touch: window.matchMedia('(pointer: coarse)').matches,
  });
  useEffect(() => {
    const update = () =>
      setViewport({
        width: window.innerWidth,
        height:
          window.visualViewport?.scale === 1 ? window.visualViewport.height : window.innerHeight,
        touch: window.matchMedia('(pointer: coarse)').matches,
      });
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  const mode =
    viewport.width < 700 || preference === 'phone'
      ? 'phone'
      : preference === 'auto'
        ? viewport.touch
          ? 'tablet'
          : 'desktop'
        : preference;
  return {
    mode,
    preference,
    height: viewport.height,
    setPreference: (value: DisplayMode) => {
      setPreference(value);
      try {
        localStorage.setItem(key, value);
      } catch {
        /* Layout still works if preferences cannot persist. */
      }
    },
  };
}
