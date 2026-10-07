import { useState, useCallback, useRef, useEffect } from 'react';
import { getComments } from '../services/bilibili';
import type { Comment } from '../services/types';

export function useComments(aid: number, sort: number) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const sortRef = useRef(sort);
  const aidRef = useRef(aid);
  const cursorRef = useRef(''); // empty = first page
  const loadSeqRef = useRef(0); // BUG-M-25: 请求序号，旧请求 resolve 后丢弃

  // 重置评论列表（sort / aid 变化时）：作废在途请求，清空游标与列表
  const resetComments = () => {
    loadSeqRef.current += 1;
    loadingRef.current = false;
    setLoading(false);
    cursorRef.current = '';
    hasMoreRef.current = true;
    setComments([]);
    setHasMore(true);
  };

  useEffect(() => {
    if (sortRef.current === sort) return;
    sortRef.current = sort;
    resetComments();
  }, [sort]);

  // BUG-H-05: aid 变化时做与 sort 同样的重置，避免两视频评论混杂
  useEffect(() => {
    if (aidRef.current === aid) return;
    aidRef.current = aid;
    resetComments();
  }, [aid]);

  const load = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current || !aidRef.current) return;
    loadingRef.current = true;
    loadSeqRef.current += 1;
    const seq = loadSeqRef.current;
    setLoading(true);
    try {
      const isFirstPage = cursorRef.current === '';
      const { replies, nextCursor, isEnd } = await getComments(aidRef.current, cursorRef.current, sortRef.current);
      if (seq !== loadSeqRef.current) return; // BUG-M-25: 已被重置/取代，丢弃旧响应
      cursorRef.current = nextCursor;
      setComments(prev => isFirstPage ? replies : [...prev, ...replies]);
      if (isEnd || replies.length === 0) {
        hasMoreRef.current = false;
        setHasMore(false);
      }
    } catch (e) {
      console.error('Failed to load comments', e);
    } finally {
      // 只有最新请求才释放锁；被作废的旧请求不碰共享状态
      if (seq === loadSeqRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  /** 发表评论后插到列表顶部（乐观插入，rpid 为服务端返回） */
  const prependComment = useCallback((c: Comment) => {
    loadSeqRef.current += 1; // 作废在途分页，避免把旧页追加到新评论前面
    cursorRef.current = '';
    hasMoreRef.current = true;
    setHasMore(true);
    setComments((prev) => [c, ...prev.filter((x) => x.rpid !== c.rpid)]);
  }, []);

  /** 局部更新一条评论（如点赞数/点赞态），不触发重拉 */
  const updateComment = useCallback((rpid: number, patch: Partial<Comment>) => {
    setComments((prev) => prev.map((c) => (c.rpid === rpid ? { ...c, ...patch } : c)));
  }, []);

  return { comments, loading, hasMore, load, prependComment, updateComment };
}
