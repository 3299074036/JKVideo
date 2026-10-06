import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTheme } from '../utils/theme';
import { useCheckUpdate } from '../hooks/useCheckUpdate';
import { getImageCacheSize, clearImageCache, formatBytes } from '../utils/cache';

export default function SettingsScreen() {
  const router = useRouter();
  const { isLoggedIn, logout } = useAuthStore();
  const { darkMode, setDarkMode, trafficSaving, setTrafficSaving } = useSettingsStore();
  const theme = useTheme();
  const { currentVersion, isChecking, downloadProgress, checkUpdate } = useCheckUpdate();
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  const refreshCacheSize = useCallback(async () => {
    const size = await getImageCacheSize();
    setCacheSize(size);
  }, []);

  useEffect(() => {
    refreshCacheSize();
  }, []);

  const handleClearCache = async () => {
    Alert.alert('清除缓存', '确定要清除所有缓存吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清除',
        style: 'destructive',
        onPress: async () => {
          setClearingCache(true);
          await clearImageCache();
          setClearingCache(false);
          setCacheSize(0);
          Alert.alert('已完成', '缓存已清除');
        },
      },
    ]);
  };

  const handleLogout = async () => {
    await logout();
    router.back();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <View style={[styles.topBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: theme.text }]}>设置</Text>
        <View style={styles.spacer} />
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionLabel, { color: theme.textSub }]}>版本信息</Text>
        <View style={styles.versionRow}>
          <Text style={[styles.versionLabel, { color: theme.text }]}>当前版本</Text>
          <Text style={[styles.versionValue, { color: theme.textSub }]}>v{currentVersion}</Text>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionLabel, { color: theme.textSub }]}>更新</Text>
        <TouchableOpacity
          style={styles.updateBtn}
          onPress={checkUpdate}
          activeOpacity={0.7}
          disabled={isChecking || downloadProgress !== null}
        >
          {isChecking ? (
            <>
              <ActivityIndicator size="small" color="#00AEEC" style={{ marginRight: 8 }} />
              <Text style={styles.updateBtnText}>检查中...</Text>
            </>
          ) : downloadProgress !== null ? (
            <Text style={styles.updateBtnText}>下载中 {downloadProgress}%</Text>
          ) : (
            <Text style={styles.updateBtnText}>检查更新</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionLabel, { color: theme.textSub }]}>外观</Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.option, { backgroundColor: theme.inputBg }, !darkMode && styles.optionActive]}
            onPress={() => setDarkMode(false)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, { color: theme.text }, !darkMode && styles.optionTextActive]}>浅色</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.option, { backgroundColor: theme.inputBg }, darkMode && styles.optionActive]}
            onPress={() => setDarkMode(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, { color: theme.text }, darkMode && styles.optionTextActive]}>深色</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionLabel, { color: theme.textSub }]}>流量</Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.option, { backgroundColor: theme.inputBg }, !trafficSaving && styles.optionActive]}
            onPress={() => setTrafficSaving(false)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, { color: theme.text }, !trafficSaving && styles.optionTextActive]}>标准</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.option, { backgroundColor: theme.inputBg }, trafficSaving && styles.optionActive]}
            onPress={() => setTrafficSaving(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, { color: theme.text }, trafficSaving && styles.optionTextActive]}>节流</Text>
          </TouchableOpacity>
        </View>
        {trafficSaving && (
          <Text style={[styles.hint, { color: theme.textSub }]}>
            封面低画质 · 首页视频不自动播放 · 视频默认 360p
          </Text>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionLabel, { color: theme.textSub }]}>存储</Text>
        <View style={styles.cacheRow}>
          <View>
            <Text style={[styles.cacheLabel, { color: theme.text }]}>缓存大小</Text>
            <Text style={[styles.cacheValue, { color: theme.textSub }]}>
              {cacheSize === null ? '计算中...' : formatBytes(cacheSize)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.clearBtn, clearingCache && { opacity: 0.5 }]}
            onPress={handleClearCache}
            disabled={clearingCache}
            activeOpacity={0.7}
          >
            {clearingCache
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.clearBtnText}>清除缓存</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      {isLoggedIn && (
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: theme.danger }]} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={[styles.logoutText, { color: theme.danger }]}>退出登录</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4, width: 32 },
  spacer: { width: 32 },
  topTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: { fontSize: 13, marginBottom: 10 },
  optionRow: { flexDirection: 'row', gap: 10 },
  option: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 16,
  },
  optionActive: { backgroundColor: '#00AEEC' },
  optionText: { fontSize: 13, fontWeight: '500' },
  optionTextActive: { color: '#fff', fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 8 },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionLabel: { fontSize: 14 },
  versionValue: { fontSize: 14 },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  updateBtnText: { fontSize: 14, color: '#00AEEC', fontWeight: '600' },
  cacheRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cacheLabel: { fontSize: 14 },
  cacheValue: { fontSize: 12, marginTop: 2 },
  clearBtn: {
    backgroundColor: '#00AEEC',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 80,
    alignItems: 'center',
  },
  clearBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  logoutBtn: {
    margin: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  logoutText: { fontSize: 15, fontWeight: '600' },
});
