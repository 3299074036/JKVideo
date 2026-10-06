import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

/**
 * 控制底部 Sheet 的"挂载 + 滑入 / 滑出 + 卸载"时序。
 *
 * 用法：
 *   const { rendered, slideAnim } = useSheetTransition(visible, sheetH);
 *   if (!rendered) return null;
 *   <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>…</Animated.View>
 *
 * 关键行为：
 * - visible=true 时立刻 rendered=true 并触发"由下往上"滑入
 * - visible=false 时先反向滑出 240ms，结束才把 rendered 置 false（卸载 Modal）
 * - 中途反复切换 visible 不会错乱：被打断的 timing.start() 回调拿到的 finished=false，
 *   所以 rendered 不会在动画未完成时意外清掉。
 */
export function useSheetTransition(visible: boolean, sheetH: number) {
  const [rendered, setRendered] = useState(visible);
  const slideAnim = useRef(new Animated.Value(visible ? 0 : sheetH)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: sheetH,
        duration: 240,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible, sheetH]);

  return { rendered, slideAnim };
}
