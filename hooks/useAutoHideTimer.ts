import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * 控制栏自动隐藏 hook：show() 后 delayMs 内无交互即隐藏。
 * keep() 用于"按住进度条不让消失"等场景：返回 true 时计时器会被推迟。
 */
export function useAutoHideTimer(delayMs = 3000, keep?: () => boolean) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (keep?.()) return;
    timerRef.current = setTimeout(() => setVisible(false), delayMs);
  }, [delayMs, keep]);

  const show = useCallback(() => {
    setVisible(true);
    reset();
  }, [reset]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  const toggle = useCallback(() => {
    setVisible(prev => {
      if (!prev) {
        reset();
        return true;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      return false;
    });
  }, [reset]);

  useEffect(() => {
    reset();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { visible, show, hide, toggle, reset };
}
