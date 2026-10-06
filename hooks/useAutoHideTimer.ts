import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * 控制栏自动隐藏 hook：show() 后 delayMs 内无交互即隐藏。
 * keep() 用于"按住进度条不让消失"等场景：返回 true 时计时器会被推迟。
 */
export function useAutoHideTimer(delayMs = 3000, keep?: () => boolean) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // BUG-L-30: ref 持有当前 visible，toggle/show/hide/reset 的超时回调里同步维护；
  // 判断逻辑移到 setState updater 之外，updater 保持纯函数（无副作用）
  const visibleRef = useRef(true);

  const setVisibleSync = (v: boolean) => {
    visibleRef.current = v;
    setVisible(v);
  };

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (keep?.()) return;
    timerRef.current = setTimeout(() => {
      visibleRef.current = false;
      setVisible(false);
    }, delayMs);
  }, [delayMs, keep]);

  const show = useCallback(() => {
    setVisibleSync(true);
    reset();
  }, [reset]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisibleSync(false);
  }, []);

  const toggle = useCallback(() => {
    if (visibleRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisibleSync(false);
    } else {
      setVisibleSync(true);
      reset();
    }
  }, [reset]);

  useEffect(() => {
    reset();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { visible, show, hide, toggle, reset };
}
