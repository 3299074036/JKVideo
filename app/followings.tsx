import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { getFollowings } from '../services/bilibili';
import type { FollowUser } from '../services/types';
import { useTheme } from '../utils/theme';
import { proxyImageUrl } from '../utils/imageUrl';

const PAGE_SIZE = 20;

export default function FollowingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.uid);

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);

  const load = useCallback(async (pn: number, reset = false) => {
    if (!uid || loadingRef.current) return;
    loadingRef.current = true;
    if (reset) setRefreshing(true); else setLoading(true);
    try {
      const r = await getFollowings(Number(uid), pn, PAGE_SIZE);
      setUsers((prev) => (reset ? r.items : [...prev, ...r.items]));
      setTotal(r.total);
      setPage(pn);
    } catch {}
    finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid]);

  useEffect(() => {
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const renderItem = useCallback(({ item }: { item: FollowUser }) => (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: theme.card }]}
      onPress={() => router.push(`/creator/${item.mid}` as any)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: proxyImageUrl(item.face) }}
        style={styles.avatar}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {item.uname}
        </Text>
        {item.sign ? (
          <Text style={[styles.sign, { color: theme.textSub }]} numberOfLines={1}>
            {item.sign}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.iconDefault} />
    </TouchableOpacity>
  ), [router, theme]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['left', 'right']}>
      <View style={[styles.topBar, { paddingTop: insets.top, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: theme.text }]}>
          我的关注{total > 0 ? `（${total}）` : ''}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={users}
        keyExtractor={(u) => String(u.mid)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(1, true)} />
        }
        onEndReached={() => {
          if (users.length < total) load(page + 1);
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading ? (
            <View style={styles.footer}>
              <ActivityIndicator color="#00AEEC" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading && !refreshing ? (
            <View style={styles.empty}>
              <Ionicons name="heart-outline" size={48} color={theme.iconDefault} />
              <Text style={[styles.emptyText, { color: theme.textSub }]}>还没有关注任何 UP 主</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '600' },
  list: { padding: 12, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee' },
  info: { flex: 1, marginLeft: 12, gap: 4 },
  name: { fontSize: 15, fontWeight: '600' },
  sign: { fontSize: 12 },
  empty: { alignItems: 'center', paddingTop: 120, gap: 12 },
  emptyText: { fontSize: 14 },
  footer: { paddingVertical: 16, alignItems: 'center' },
});
