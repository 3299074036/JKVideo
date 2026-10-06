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
import { LinearGradient } from 'expo-linear-gradient';
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
  { key: 'followings', label: '我的关注', icon: 'heart-outline', route: '/followings', needLogin: true },
  { key: 'history', label: '观看历史', icon: 'time-outline', route: '/history', needLogin: false },
  { key: 'favorites', label: '我的收藏', icon: 'star-outline', route: '/favorites', needLogin: true },
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 顶部渐变头图 + 个人信息 */}
        <LinearGradient
          colors={['#E3F4FD', theme.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 28 }]}
        >
          <TouchableOpacity
            onPress={() => { if (!isLoggedIn) setShowLogin(true); }}
            activeOpacity={isLoggedIn ? 1 : 0.7}
            style={styles.profileCenter}
          >
            {isLoggedIn && face ? (
              <Image
                source={{ uri: proxyImageUrl(face) }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.inputBg }]}>
                <Ionicons name="person" size={40} color={theme.iconDefault} />
              </View>
            )}
            <Text style={[styles.nickname, { color: theme.text }]}>
              {isLoggedIn ? username || 'B站用户' : '点击登录'}
            </Text>
            <Text style={[styles.uid, { color: theme.textSub }]}>
              {isLoggedIn && uid ? `UID: ${uid}` : '登录后同步观看历史与收藏'}
            </Text>
          </TouchableOpacity>
        </LinearGradient>

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
              <View style={[styles.menuIconWrap, { backgroundColor: '#E8F7FE' }]}>
                <Ionicons name={m.icon} size={20} color="#00AEEC" />
              </View>
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
  content: { paddingBottom: 24 },
  header: {
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  profileCenter: {
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#eee',
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  nickname: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  uid: { fontSize: 13 },
  menuGroup: {
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  logoutBtn: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
  },
  logoutText: { fontSize: 15, fontWeight: '600' },
});
