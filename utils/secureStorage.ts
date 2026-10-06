import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// expo-secure-store is only available on native platforms
let SecureStore: typeof import('expo-secure-store') | null = null;
if (Platform.OS !== 'web') {
  try { SecureStore = require('expo-secure-store'); } catch {}
}

/** Read a sensitive value from SecureStore (native) or AsyncStorage (web fallback). */
export async function getSecure(key: string): Promise<string | null> {
  if (SecureStore) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
}

export async function setSecure(key: string, value: string): Promise<void> {
  if (SecureStore) {
    await SecureStore.setItemAsync(key, value);
  } else {
    await AsyncStorage.setItem(key, value);
  }
}

export async function deleteSecure(key: string): Promise<void> {
  if (SecureStore) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
}
