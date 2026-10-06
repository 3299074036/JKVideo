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
  const currentSort = useRef<SearchSort>('default');

  // Load history & hot searches on mount
  useEffect(() => {
    loadHistory().then(setHistory);
    getHotSearch().then(setHotSearches);
  }, []);

  // Debounced suggestions
  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!keyword.trim() || keyword.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      const items = await getSearchSuggest(keyword.trim());
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

  const search = useCallback(async (kw: string, reset = false, sortOverride?: SearchSort) => {
    if (!kw.trim() || loadingRef.current) return;
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
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [page, addToHistory]);

  const changeSort = useCallback((newSort: SearchSort) => {
    setSort(newSort);
    currentSort.current = newSort;
    if (keyword.trim()) {
      search(keyword, true, newSort);
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
