import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { LoginModal } from '../../components/LoginModal';
import { useTheme } from '../../utils/theme';
import { proxyImageUrl } from '../../utils/imageUrl';

interface MenuEntry {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  needLogin: boolean;
}

const MENUS: MenuEntry[] = [
  { key: 'history', label: '观看历史', icon: 'time-outline', route: '/history', needLogin: false },
  { key: 'favorites', label: '我的收藏', icon: 'star-outline', route: '/favorites', needLogin: true },
  { key: 'followings', label: '我的关注', icon: 'heart-outline', route: '/followings', needLogin: true },
  { key: 'downloads', label: '下载管理', icon: 'download-outline', route: '/downloads', needLogin: false },
  { key: 'settings', label: '设置', icon: 'settings-outline', route: '/settings', needLogin: false },
];

export default function MineScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isLoggedIn, face, username, uid, logout } = useAuthStore();
  const [showLogin, setShowLogin] = useState(false);

  const handleMenu = (m: MenuEntry) => {
    if (m.needLogin && !isLoggedIn) {
      setShowLogin(true);
      return;
    }
    router.push(m.route as any);
  };

  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出当前账号吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['left', 'right']}>
      <View style={[styles.topBar, { height: 44 + insets.top, paddingTop: insets.top, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Text style={[styles.topTitle, { color: theme.text }]}>我的</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 个人信息区：头像 / 昵称 / UID */}
        <TouchableOpacity
          style={[styles.profile, { backgroundColor: theme.card }]}
          onPress={() => { if (!isLoggedIn) setShowLogin(true); }}
          activeOpacity={isLoggedIn ? 1 : 0.7}
        >
          {isLoggedIn && face ? (
            <Image
              source={{ uri: proxyImageUrl(face) }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.inputBg }]}>
              <Ionicons name="person" size={36} color={theme.iconDefault} />
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={[styles.nickname, { color: theme.text }]}>
              {isLoggedIn ? username || 'B站用户' : '点击登录'}
            </Text>
            {isLoggedIn && uid ? (
              <Text style={[styles.uid, { color: theme.textSub }]}>UID: {uid}</Text>
            ) : (
              <Text style={[styles.uid, { color: theme.textSub }]}>登录后同步观看历史与收藏</Text>
            )}
          </View>
          {!isLoggedIn && (
            <Ionicons name="chevron-forward" size={20} color={theme.iconDefault} />
          )}
        </TouchableOpacity>

        {/* 功能入口 */}
        <View style={[styles.menuGroup, { backgroundColor: theme.card }]}>
          {MENUS.map((m, i) => (
            <TouchableOpacity
              key={m.key}
              style={[
                styles.menuRow,
                i < MENUS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
              ]}
              onPress={() => handleMenu(m)}
              activeOpacity={0.7}
            >
              <Ionicons name={m.icon} size={22} color="#00AEEC" style={styles.menuIcon} />
              <Text style={[styles.menuLabel, { color: theme.text }]}>{m.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.iconDefault} />
            </TouchableOpacity>
          ))}
        </View>

        {/* 退出登录 */}
        {isLoggedIn && (
          <TouchableOpacity
            style={[styles.logoutBtn, { backgroundColor: theme.card }]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Text style={[styles.logoutText, { color: theme.danger }]}>退出登录</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <LoginModal visible={showLogin} onClose={() => setShowLogin(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '600' },
  content: { padding: 12, gap: 12 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eee' },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  profileInfo: { flex: 1, marginLeft: 14, gap: 4 },
  nickname: { fontSize: 18, fontWeight: '600' },
  uid: { fontSize: 13 },
  menuGroup: { borderRadius: 12, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuIcon: { marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 15 },
  logoutBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { fontSize: 15, fontWeight: '500' },
});
