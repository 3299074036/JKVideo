import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useDownloadStore } from '../store/downloadStore';
import { useSettingsStore } from '../store/settingsStore';
import { usePlayProgressStore } from '../store/playProgressStore';
import { initMiniExclusion } from '../store/miniExclusion';
import { useTheme } from '../utils/theme';
import { MiniPlayer } from '../components/MiniPlayer';
import { LiveMiniPlayer } from '../components/LiveMiniPlayer';
import * as Sentry from '@sentry/react-native';
import { ErrorBoundary } from '@sentry/react-native';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: !__DEV__,
    tracesSampleRate: 0.05,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'production',
  });
}

function RootLayout() {
  const restore = useAuthStore(s => s.restore);
  const loadDownloads = useDownloadStore(s => s.loadFromStorage);
  const restoreSettings = useSettingsStore(s => s.restore);
  const darkMode = useSettingsStore(s => s.darkMode);

  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    restore();
    loadDownloads();
    restoreSettings();
    usePlayProgressStore.getState().hydrate();
    initMiniExclusion();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        <ErrorBoundary fallback={<Text style={{ padding: 32, textAlign: 'center' }}>发生错误，请重启 App</Text>}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="video"
              options={{
                animation: "slide_from_right",
                gestureEnabled: true,
                gestureDirection: "horizontal",
              }}
            />
            <Stack.Screen
              name="live"
              options={{
                animation: "slide_from_right",
                gestureEnabled: true,
                gestureDirection: "horizontal",
              }}
            />
            <Stack.Screen
              name="search"
              options={{
                animation: "slide_from_right",
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="downloads"
              options={{
                animation: "slide_from_right",
                gestureEnabled: true,
                gestureDirection: "horizontal",
              }}
            />
            <Stack.Screen
              name="settings"
              options={{
                animation: "slide_from_right",
                gestureEnabled: true,
                gestureDirection: "horizontal",
              }}
            />
            <Stack.Screen
              name="history"
              options={{
                animation: "slide_from_right",
                gestureEnabled: true,
                gestureDirection: "horizontal",
              }}
            />
            <Stack.Screen
              name="favorites"
              options={{
                animation: "slide_from_right",
                gestureEnabled: true,
                gestureDirection: "horizontal",
              }}
            />
            <Stack.Screen
              name="followings"
              options={{
                animation: "slide_from_right",
                gestureEnabled: true,
                gestureDirection: "horizontal",
              }}
            />
            <Stack.Screen
              name="creator"
              options={{
                animation: "slide_from_right",
                gestureEnabled: true,
                gestureDirection: "horizontal",
              }}
            />
          </Stack>
        </ErrorBoundary>
        <MiniPlayer />
        <LiveMiniPlayer />
      </View>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
