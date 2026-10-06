import { useCallback, useEffect, useRef, useState } from "react";
import { ensureBiliJct, getRelation, modifyRelation, moveFollowToTags } from "../services/bilibili";
import { useAuthStore } from "../store/authStore";
import { toast } from "../utils/toast";

/**
 * 关注 / 取消关注 UP 主。
 * - 未登录：toggle 时 toast 提示，按钮 disabled=false 仍允许点击
 * - 已登录但无 bili_jct：先尝试从原生 Cookie 存储自愈补回，补不上才 toast 提示重登
 * - 正常路径：乐观更新 UI，请求失败回滚
 */
export function useFollow(mid: number | undefined) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const inflightRef = useRef(false);

  // 首次拉取 / mid 切换时刷新关注状态
  useEffect(() => {
    if (!mid || !isLoggedIn) {
      setFollowing(false);
      return;
    }
    let cancelled = false;
    getRelation(mid)
      .then((r) => {
        if (!cancelled) setFollowing(r.following);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mid, isLoggedIn]);

  const toggle = useCallback(async () => {
    if (!mid) return;
    if (!isLoggedIn) {
      toast("请先登录后再关注");
      return;
    }
    // BUG-M-27: 同步先置防重锁（在 await 之前），避免快速双击并发两次请求
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    try {
      const biliJct = await ensureBiliJct();
      if (!biliJct) {
        toast("请重新登录后再使用关注功能");
        return;
      }
      const next = !following;
      setFollowing(next); // 乐观更新
      try {
        await modifyRelation(mid, next ? 1 : 2);
      } catch (e: any) {
        setFollowing(!next); // 失败回滚
        if (e?.message === "NO_CSRF") {
          toast("请重新登录后再使用关注功能");
        } else {
          toast(`操作失败：${e?.message || "未知错误"}`);
        }
      }
    } finally {
      inflightRef.current = false;
      setLoading(false);
    }
  }, [mid, isLoggedIn, following]);

  /** 关注并移入指定分组（tagids 为空 = 默认分组）。已关注时调用无效果 */
  const followToTags = useCallback(async (tagids: number[]) => {
    if (!mid || following) return;
    if (!isLoggedIn) {
      toast("请先登录后再关注");
      return;
    }
    // BUG-M-27: 同步先置防重锁（在 await 之前），finally 释放
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    try {
      const biliJct = await ensureBiliJct();
      if (!biliJct) {
        toast("请重新登录后再使用关注功能");
        return;
      }
      setFollowing(true); // 乐观更新
      try {
        await modifyRelation(mid, 1);
      } catch (e: any) {
        setFollowing(false); // 关注失败才回滚
        toast(`操作失败：${e?.message || "未知错误"}`);
        return;
      }
      // BUG-L-25: 关注已成功——分组失败不再回滚关注态，如实提示
      try {
        await moveFollowToTags(mid, tagids);
        toast(tagids.length ? "已关注并移入分组" : "关注成功");
      } catch (e: any) {
        toast(`已关注，但移入分组失败：${e?.message || "未知错误"}`);
      }
    } finally {
      inflightRef.current = false;
      setLoading(false);
    }
  }, [mid, isLoggedIn, following]);

  return { following, loading, toggle, followToTags };
}
