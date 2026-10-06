import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getUploaderInfo, getUploaderVideos } from '../../services/bilibili';
import type { VideoItem } from '../../services/types';
import { useTheme } from '../../utils/theme';
import { formatCount, formatDuration, formatTime } from '../../utils/format';
import { proxyImageUrl, coverImageUrl } from '../../utils/imageUrl';
import { useSettingsStore } from '../../store/settingsStore';
import { useFollow } from '../../hooks/useFollow';
import { FollowTagSheet } from '../../components/FollowTagSheet';

const PAGE_SIZE = 20;
const TOPBAR_HEIGHT = 44;
const FADE_START = 80;
const FADE_END = 160;

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<VideoItem>);

export default function CreatorScreen() {
  const { mid: midStr } = useLocalSearchParams<{ mid: string }>();
  const mid = Number(midStr);
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const trafficSaving = useSettingsStore(s => s.trafficSaving);

  const [info, setInfo] = useState<{
    name: string; face: string; sign: string; follower: number; archiveCount: number;
  } | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [infoLoading, setInfoLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const { following, loading: followLoading, toggle: toggleFollow, followToTags } = useFollow(mid);
  const [tagSheetVisible, setTagSheetVisible] = useState(false);
  const handleFollowPress = useCallback(() => {
    if (following) toggleFollow();
    else setTagSheetVisible(true);
  }, [following, toggleFollow]);

  const topBarOpacity = scrollY.interpolate({
    inputRange: [FADE_START, FADE_END],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    getUploaderInfo(mid)
      .then(setInfo)
      .catch(() => {})
      .finally(() => setInfoLoading(false));
    loadVideos(1, true);
  }, [mid]);

  const loadVideos = useCallback(async (pn: number, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const { videos: newVideos, total: t } = await getUploaderVideos(mid, pn, PAGE_SIZE);
      setTotal(t);
      setVideos(prev => reset ? newVideos : [...prev, ...newVideos]);
      setPage(pn);
    } catch {}
    finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [mid]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [infoData, { videos: newVideos, total: t }] = await Promise.all([
        getUploaderInfo(mid),
        getUploaderVideos(mid, 1, PAGE_SIZE),
      ]);
      setInfo(infoData);
      setTotal(t);
      setVideos(newVideos);
      setPage(1);
    } catch {}
    finally {
      setRefreshing(false);
    }
  }, [mid]);

  const hasMore = videos.length < total;

  const HeroHeader = (
    <View style={[styles.hero, { borderBottomColor: theme.border }]}>
      {info ? (
        <>
          <Image
            source={{ uri: proxyImageUrl(info.face) }}
            style={styles.heroBg}
            contentFit="cover"
            blurRadius={20}
          />
          <View style={[styles.heroOverlay, { backgroundColor: theme.card }]} />
        </>
      ) : (
        <View style={[styles.heroBg, { backgroundColor: theme.card }]} />
      )}
      {infoLoading ? (
        <View style={[styles.profileContent, { paddingTop: TOPBAR_HEIGHT + 24 }]}>
          <ActivityIndicator color="#00AEEC" />
        </View>
      ) : info ? (
        <View style={[styles.profileContent, { paddingTop: TOPBAR_HEIGHT + 12 }]}>
          <Image
            source={{ uri: proxyImageUrl(info.face) }}
            style={styles.avatar}
            contentFit="cover"
            recyclingKey={String(mid)}
          />
          <Text style={[styles.name, { color: theme.text }]}>{info.name}</Text>
          {info.sign ? (
            <Text style={[styles.sign, { color: theme.textSub }]} numberOfLines={2}>{info.sign}</Text>
          ) : null}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: theme.text }]}>{formatCount(info.follower)}</Text>
              <Text style={[styles.statLabel, { color: theme.textSub }]}>粉丝</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: theme.text }]}>{formatCount(info.archiveCount)}</Text>
              <Text style={[styles.statLabel, { color: theme.textSub }]}>视频</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.followBtn, following && styles.followBtnActive]}
            activeOpacity={0.85}
            onPress={handleFollowPress}
            disabled={followLoading}
          >
            <Text style={[styles.followBtnText, following && { color: theme.textSub }]}>
              {following ? '已关注' : '+ 关注'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.videoListHeader, { color: theme.textSub }]}>
            全部视频（{total}）
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.card }]}
      edges={['top', 'left', 'right']}
    >
      <AnimatedFlatList
        data={videos}
        keyExtractor={item => item.bvid}
        showsVerticalScrollIndicator={false}
        onEndReached={() => { if (hasMore && !loading) loadVideos(page + 1); }}
        onEndReachedThreshold={0.3}
        windowSize={7}
        maxToRenderPerBatch={6}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#00AEEC"
            colors={["#00AEEC"]}
            progressViewOffset={insets.top + TOPBAR_HEIGHT}
          />
        }
        ListHeaderComponent={HeroHeader}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.videoRow, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
            onPress={() => router.push(`/video/${item.bvid}` as any)}
            activeOpacity={0.85}
          >
            <View style={styles.thumbWrap}>
              <Image
                source={{ uri: coverImageUrl(item.pic, trafficSaving ? 'normal' : 'hd') }}
                style={styles.thumb}
                contentFit="cover"
                recyclingKey={item.bvid}
                transition={200}
              />
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
              </View>
            </View>
            <View style={styles.videoInfo}>
              <Text style={[styles.videoTitle, { color: theme.text }]} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.videoMeta}>
                <Ionicons name="play" size={11} color={theme.textSub} />
                <Text style={[styles.metaText, { color: theme.textSub }]}>{formatCount(item.stat?.view ?? 0)}</Text>
                {!!item.pubdate && (
                  <Text style={[styles.metaText, { color: theme.textSub }]}>· {formatTime(item.pubdate)}</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading && !infoLoading ? (
            <Text style={[styles.emptyTxt, { color: theme.textSub }]}>暂无视频</Text>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {loading && <ActivityIndicator color="#00AEEC" />}
          </View>
        }
      />

      {/* 浮动 topBar：背景透明 → 不透明，跟随滚动 */}
      <View
        style={[styles.topBarFloat, { height: TOPBAR_HEIGHT, top: insets.top }]}
        pointerEvents="box-none"
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: theme.card, opacity: topBarOpacity },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.topBarBorder,
            { backgroundColor: theme.border, opacity: topBarOpacity },
          ]}
        />
        <View style={styles.topBarContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Animated.Text
            style={[styles.topTitle, { color: theme.text, opacity: topBarOpacity }]}
            numberOfLines={1}
          >
            {info?.name ?? 'UP主主页'}
          </Animated.Text>
          <View style={styles.backBtn} />
        </View>
      </View>
      <FollowTagSheet
        visible={tagSheetVisible}
        onClose={() => setTagSheetVisible(false)}
        onConfirm={(tagids) => followToTags(tagids)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  hero: {
    overflow: 'hidden',
    position: 'relative',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heroBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.82,
  },
  topBarFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  topBarBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  topBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  backBtn: { padding: 4, width: 32 },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  profileContent: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 10 },
  name: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  sign: { fontSize: 13, textAlign: 'center', paddingHorizontal: 24, marginBottom: 12, lineHeight: 19 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statItem: { alignItems: 'center', paddingHorizontal: 24 },
  statNum: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 28 },
  followBtn: {
    backgroundColor: '#00AEEC',
    borderRadius: 20,
    paddingHorizontal: 40,
    paddingVertical: 9,
    marginBottom: 14,
  },
  followBtnActive: { backgroundColor: 'rgba(128,128,128,0.18)' },
  followBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  videoListHeader: { alignSelf: 'flex-start', paddingHorizontal: 14, fontSize: 13, paddingBottom: 4 },
  videoRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  thumbWrap: { width: 120, height: 68, borderRadius: 4, overflow: 'hidden', flexShrink: 0, position: 'relative' },
  thumb: { width: 120, height: 68 },
  durationBadge: {
    position: 'absolute', bottom: 3, right: 3,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1,
  },
  durationText: { color: '#fff', fontSize: 10 },
  videoInfo: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  videoTitle: { fontSize: 13, lineHeight: 18 },
  videoMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  emptyTxt: { textAlign: 'center', padding: 40 },
  footer: { height: 48, justifyContent: 'center', alignItems: 'center' },
});
