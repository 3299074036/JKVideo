import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchVideos, getSearchSuggest, getHotSearch } from '../services/bilibili';
import type { VideoItem, SearchSuggestItem, HotSearchItem } from '../services/types';

const HISTORY_KEY = 'search_history';
const MAX_HISTORY = 20;

export type SearchSort = 'default' | 'pubdate' | 'view';

async function loadHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveHistory(history: string[]) {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function useSearch() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sort, setSort] = useState<SearchSort>('default');
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestItem[]>([]);
  const [hotSearches, setHotSearches] = useState<HotSearchItem[]>([]);
  const loadingRef = useRef(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestSeqRef = useRef(0); // BUG-L-26: 联想请求序号，旧请求 resolve 后丢弃
  const currentSort = useRef<SearchSort>('default');

  // Load history & hot searches on mount
  useEffect(() => {
    loadHistory().then(setHistory);
    getHotSearch().then(setHotSearches);
  }, []);

  // Debounced suggestions
  useEffect(() => {
    suggestSeqRef.current += 1; // BUG-L-26: 新关键词使之前在途的联想请求作废
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!keyword.trim() || keyword.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      const seq = suggestSeqRef.current;
      const items = await getSearchSuggest(keyword.trim());
      if (seq !== suggestSeqRef.current) return; // 旧关键词的联想结果：丢弃
      setSuggestions(items);
    }, 300);
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [keyword]);

  const addToHistory = useCallback(async (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    setHistory(prev => {
      const filtered = prev.filter(h => h !== trimmed);
      const next = [trimmed, ...filtered].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const removeFromHistory = useCallback(async (kw: string) => {
    setHistory(prev => {
      const next = prev.filter(h => h !== kw);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await AsyncStorage.removeItem(HISTORY_KEY);
  }, []);

  // 返回是否真正发起了请求：有在途请求时被拦截返回 false（调用方可据此回滚状态）
  const search = useCallback(async (kw: string, reset = false, sortOverride?: SearchSort): Promise<boolean> => {
    if (!kw.trim() || loadingRef.current) return false;
    loadingRef.current = true;
    setLoading(true);
    setSuggestions([]);
    const activeSort = sortOverride ?? currentSort.current;
    const currentPage = reset ? 1 : page;
    const orderParam = activeSort === 'pubdate' ? 'pubdate' : activeSort === 'view' ? 'click' : '';
    try {
      const items = await searchVideos(kw, currentPage, orderParam);
      if (reset) {
        setResults(items);
        setPage(2);
        addToHistory(kw);
      } else {
        setResults(prev => [...prev, ...items]);
        setPage(p => p + 1);
      }
      setHasMore(items.length >= 20);
    } catch {
      // BUG-L-27: 出错时不改 hasMore（保持原值），允许用户重试翻页
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
    return true;
  }, [page, addToHistory]);

  const changeSort = useCallback((newSort: SearchSort) => {
    const prevSort = currentSort.current;
    setSort(newSort);
    currentSort.current = newSort;
    if (keyword.trim()) {
      // BUG-M-20: search 可能被在途请求拦截（返回 false），此时回滚排序状态，
      // 避免排序按钮高亮与列表实际排序错位
      search(keyword, true, newSort).then(started => {
        if (!started) {
          setSort(prevSort);
          currentSort.current = prevSort;
        }
      });
    }
  }, [keyword, search]);

  const loadMore = useCallback(() => {
    if (!keyword.trim() || loadingRef.current || !hasMore) return;
    search(keyword, false);
  }, [keyword, hasMore, search]);

  return {
    keyword, setKeyword,
    results, loading, hasMore,
    search, loadMore,
    sort, changeSort,
    history, removeFromHistory, clearHistory,
    suggestions,
    hotSearches,
  };
}
