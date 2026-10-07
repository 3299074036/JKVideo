import { useCallback } from "react";
import { sendDanmaku } from "../services/bilibili";
import { useAuthStore } from "../store/authStore";
import { toast } from "../utils/toast";

/**
 * 发弹幕：统一处理未登录 / 无 csrf 的提示。
 * 成功 resolve；失败 throw（NOT_LOGGED_IN / NO_CSRF 已 toast，调用方不再重复提示）。
 */
export function useDanmakuSender() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return useCallback(
    async (cid: number, bvid: string, msg: string, progressMs: number): Promise<void> => {
      if (!cid || !bvid) throw new Error("视频信息缺失");
      if (!isLoggedIn) {
        toast("请先登录后再发弹幕");
        throw new Error("NOT_LOGGED_IN");
      }
      try {
        await sendDanmaku(cid, bvid, msg, progressMs);
      } catch (e: any) {
        if (e?.message === "NO_CSRF") toast("请重新登录后再发弹幕");
        throw e;
      }
    },
    [isLoggedIn],
  );
}
