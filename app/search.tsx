import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VideoCard } from '../components/VideoCard';
import { useSearch, SearchSort } from '../hooks/useSearch';
import { useTheme } from '../utils/theme';
import type { VideoItem } from '../services/types';

const SORT_OPTIONS: { key: SearchSort; label: string }[] = [
  { key: 'default', label: '综合排序' },
  { key: 'pubdate', label: '最新发布' },
  { key: 'view', label: '最多播放' },
];

export default function SearchScreen() {
  const router = useRouter();
  const {
    keyword, setKeyword,
    results, loading, hasMore,
    search, loadMore,
    sort, changeSort,
    history, removeFromHistory, clearHistory,
    suggestions,
    hotSearches,
  } = useSearch();
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const hasResults = results.length > 0;
  const hasSearched = hasResults || (loading && results.length === 0);

  const handleSearch = useCallback((kw?: string) => {
    const term = (kw ?? keyword).trim();
    if (term) {
      if (kw) setKeyword(kw);
      Keyboard.dismiss();
      search(kw ?? keyword, true);
    }
  }, [keyword, search, setKeyword]);

  const handleSuggestionPress = useCallback((value: string) => {
    setKeyword(value);
    Keyboard.dismiss();
    search(value, true);
  }, [search, setKeyword]);

  const renderItem = useCallback(
    ({ item, index }: { item: VideoItem; index: number }) => {
      if (index % 2 !== 0) return null;
      const right = results[index + 1];
      return (
        <View style={styles.row}>
          <View style={styles.leftCol}>
            <VideoCard
              item={item}
              onPress={() => router.push(`/video/${item.bvid}` as any)}
            />
          </View>
          {right ? (
            <View style={styles.rightCol}>
              <VideoCard
                item={right}
                onPress={() => router.push(`/video/${right.bvid}` as any)}
              />
            </View>
          ) : (
            <View style={styles.rightCol} />
          )}
        </View>
      );
    },
    [results, router],
  );

  const keyExtractor = useCallback(
    (_: VideoItem, index: number) => String(index),
    [],
  );

  // Show pre-search panel (history + hot searches + suggestions)
  const showPreSearch = !hasSearched && !loading;
  const showSuggestions = suggestions.length > 0 && keyword.trim().length > 0 && !hasResults;

  const ListHeaderComponent = useCallback(() => {
    if (!hasResults) return null;
    return (
      <View style={[styles.sortBar, { backgroundColor: theme.card }]}>
        {SORT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.sortBtn, sort === opt.key && styles.sortBtnActive]}
            onPress={() => changeSort(opt.key)}
            activeOpacity={0.85}
          >
            <Text style={[styles.sortBtnText, sort === opt.key && styles.sortBtnTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }, [hasResults, sort, changeSort, theme.card]);

  const ListEmptyComponent = () => {
    if (loading) return (
      <View style={styles.emptyBox}>
        <ActivityIndicator color="#00AEEC" size="large" />
      </View>
    );
    if (!keyword.trim()) return null;
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="search-outline" size={48} color="#ddd" />
        <Text style={[styles.emptyText, { color: theme.textSub }]}>没有找到相关视频</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
      {/* Search header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={[styles.inputWrap, { backgroundColor: theme.inputBg }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.text }]}
            placeholder="搜索视频、UP主..."
            placeholderTextColor="#999"
            value={keyword}
            onChangeText={setKeyword}
            onSubmitEditing={() => handleSearch()}
            returnKeyType="search"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {keyword.length > 0 && (
            <TouchableOpacity onPress={() => setKeyword('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={16} color="#bbb" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearch()} activeOpacity={0.85}>
          <Text style={styles.searchBtnText}>搜索</Text>
        </TouchableOpacity>
      </View>

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <View style={[styles.suggestPanel, { backgroundColor: theme.card }]}>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={`${s.value}-${i}`}
              style={[styles.suggestItem, { borderBottomColor: theme.border }]}
              onPress={() => handleSuggestionPress(s.value)}
              activeOpacity={0.85}
            >
              <Ionicons name="search-outline" size={14} color="#bbb" style={styles.suggestIcon} />
              <Text style={[styles.suggestText, { color: theme.text }]} numberOfLines={1}>{s.value}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Pre-search: history + hot searches */}
      {showPreSearch && !showSuggestions ? (
        <ScrollView style={styles.preSearch} keyboardShouldPersistTaps="handled">
          {/* Search history */}
          {history.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>搜索历史</Text>
                <TouchableOpacity onPress={clearHistory} activeOpacity={0.85}>
                  <Ionicons name="trash-outline" size={16} color={theme.textSub} />
                </TouchableOpacity>
              </View>
              <View style={styles.tagWrap}>
                {history.map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.tag, { backgroundColor: theme.inputBg }]}
                    onPress={() => handleSearch(h)}
                    onLongPress={() => removeFromHistory(h)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.tagText, { color: theme.text }]} numberOfLines={1}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Hot searches */}
          {hotSearches.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>热搜榜</Text>
              {hotSearches.map((item, idx) => (
                <TouchableOpacity
                  key={item.keyword}
                  style={[styles.hotItem, { borderBottomColor: theme.border }]}
                  onPress={() => handleSearch(item.keyword)}
                  activeOpacity={0.85}
                >
                  <Text style={[
                    styles.hotIndex,
                    idx < 3 && styles.hotIndexTop,
                  ]}>
                    {idx + 1}
                  </Text>
                  <Text style={[styles.hotText, { color: theme.text }]} numberOfLines={1}>
                    {item.show_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {history.length === 0 && hotSearches.length === 0 && (
            <View style={styles.emptyBox}>
              <Ionicons name="search-outline" size={48} color="#ddd" />
              <Text style={[styles.emptyText, { color: theme.textSub }]}>输入关键词搜索</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        /* Results list */
        <FlatList
          data={results}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<ListHeaderComponent />}
          ListEmptyComponent={<ListEmptyComponent />}
          ListFooterComponent={
            loading && results.length > 0 ? (
              <View style={styles.footer}>
                <ActivityIndicator color="#00AEEC" />
              </View>
            ) : null
          }
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f4f4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 6,
  },
  backBtn: { padding: 4 },
  inputWrap: {
    flex: 1,
    height: 34,
    backgroundColor: '#f0f0f0',
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#212121',
    padding: 0,
  },
  clearBtn: { paddingLeft: 4 },
  searchBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchBtnText: { fontSize: 14, color: '#00AEEC', fontWeight: '600' },

  // Sort bar
  sortBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  sortBtnActive: {
    backgroundColor: '#00AEEC',
  },
  sortBtnText: {
    fontSize: 12,
    color: '#999',
  },
  sortBtnTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  // Suggestions
  suggestPanel: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  suggestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  suggestIcon: { marginRight: 8 },
  suggestText: { fontSize: 14, flex: 1 },

  // Pre-search
  preSearch: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 2 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    maxWidth: '45%',
  },
  tagText: { fontSize: 13, color: '#212121' },

  // Hot search list
  hotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  hotIndex: {
    width: 22,
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    textAlign: 'center',
    marginRight: 10,
  },
  hotIndexTop: { color: '#00AEEC' },
  hotText: { fontSize: 14, flex: 1 },

  // Results
  listContent: { paddingTop: 0, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 1,
    justifyContent: 'flex-start',
  },
  leftCol: { flex: 1, marginLeft: 4, marginRight: 2 },
  rightCol: { flex: 1, marginLeft: 2, marginRight: 4 },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: { fontSize: 14, color: '#bbb' },
  footer: { height: 48, alignItems: 'center', justifyContent: 'center' },
});
