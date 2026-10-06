import { useRef } from 'react';
import { Animated, Dimensions, PanResponder } from 'react-native';

interface Options {
  width: number;
  height: number;
  /** 命中"关闭按钮"区域的判定（locationX, locationY）→ true 时调 onClose，否则调 onTap */
  hitClose?: (locationX: number, locationY: number) => boolean;
  onTap: () => void;
  onClose?: () => void;
}

/**
 * 全局浮动小窗的拖拽 + 吸边 + 点击/关闭分发。
 * 返回 panHandlers 直接展开到容器，transform 应用 pan.getTranslateTransform()。
 */
export function useMiniDrag({ width, height, hitClose, onTap, onClose }: Options) {
  const pan = useRef(new Animated.ValueXY()).current;
  const isDragging = useRef(false);
  // 用 ref 保持最新回调，避免 PanResponder 闭包过期
  const cbRef = useRef({ onTap, onClose, hitClose });
  cbRef.current = { onTap, onClose, hitClose };
  // BUG-L-31: width/height 同样放进 ref 保鲜，避免 release 里读到过期闭包
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDragging.current = false;
        // BUG-L-32: 用 __getValue() 读取当前值，不访问私有字段 _value
        pan.setOffset({ x: (pan.x as any).__getValue(), y: (pan.y as any).__getValue() });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5) {
          isDragging.current = true;
        }
        pan.x.setValue(gs.dx);
        pan.y.setValue(gs.dy);
      },
      onPanResponderRelease: (evt) => {
        pan.flattenOffset();
        if (!isDragging.current) {
          const { locationX, locationY } = evt.nativeEvent;
          const cb = cbRef.current;
          if (cb.hitClose?.(locationX, locationY) && cb.onClose) {
            cb.onClose();
          } else {
            cb.onTap();
          }
          return;
        }
        const { width: sw, height: sh } = Dimensions.get('window');
        const { width: w, height: h } = sizeRef.current;
        const curX = (pan.x as any).__getValue();
        const curY = (pan.y as any).__getValue();
        const snapRight = 0;
        const snapLeft = -(sw - w - 24);
        const snapX = curX < snapLeft / 2 ? snapLeft : snapRight;
        const clampedY = Math.max(-sh + h + 60, Math.min(60, curY));
        Animated.spring(pan, {
          toValue: { x: snapX, y: clampedY },
          useNativeDriver: false,
          tension: 120,
          friction: 10,
        }).start();
      },
      onPanResponderTerminate: () => { pan.flattenOffset(); },
    }),
  ).current;

  return { pan, panHandlers: panResponder.panHandlers };
}
