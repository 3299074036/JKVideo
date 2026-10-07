import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

/**
 * 监听软键盘高度。输入条用 translateY(-kb) 贴到键盘上沿，
 * 不依赖窗口是否被压缩（用户真机上 adjustResize 未生效，输入条会被键盘盖住）。
 */
export function useKeyboardHeight(): number {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKb(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return kb;
}
