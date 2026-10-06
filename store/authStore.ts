import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserInfo } from '../services/bilibili';
import { getSecure, setSecure, deleteSecure } from '../utils/secureStorage';

interface AuthState {
  sessdata: string | null;
  /** B 站 CSRF token（bili_jct cookie 值）。写操作（关注/点赞/投币 etc）必填 */
  biliJct: string | null;
  uid: string | null;
  username: string | null;
  face: string | null;
  isLoggedIn: boolean;
  login: (sessdata: string, uid: string, username?: string, biliJct?: string) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  setProfile: (face: string, username: string, uid: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  sessdata: null,
  biliJct: null,
  uid: null,
  username: null,
  face: null,
  isLoggedIn: false,

  login: async (sessdata, uid, username, biliJct) => {
    await setSecure('SESSDATA', sessdata);
    if (biliJct) await setSecure('bili_jct', biliJct);
    // Migrate: remove SESSDATA from AsyncStorage if it was there before
    await AsyncStorage.removeItem('SESSDATA').catch(() => { });
    set({
      sessdata,
      biliJct: biliJct ?? null,
      uid: uid || null,
      username: username || null,
      isLoggedIn: true,
    });
    getUserInfo().then(async (info) => {
      await AsyncStorage.multiSet([
        ['UID', String(info.mid)],
        ['USERNAME', info.uname],
        ['FACE', info.face],
      ]).catch(() => { });
      set({ face: info.face, username: info.uname, uid: String(info.mid) });
    }).catch(() => { });
  },

  logout: async () => {
    await deleteSecure('SESSDATA');
    await deleteSecure('bili_jct');
    await AsyncStorage.multiRemove(['UID', 'USERNAME', 'FACE']);
    set({ sessdata: null, biliJct: null, uid: null, username: null, face: null, isLoggedIn: false });
  },

  restore: async () => {
    // Try SecureStore first, fallback to AsyncStorage for migration
    let sessdata = await getSecure('SESSDATA');
    if (!sessdata) {
      sessdata = await AsyncStorage.getItem('SESSDATA');
      if (sessdata) {
        // Migrate from AsyncStorage to SecureStore
        await setSecure('SESSDATA', sessdata);
        await AsyncStorage.removeItem('SESSDATA');
      }
    }
    const biliJct = await getSecure('bili_jct');
    if (sessdata) {
      set({ sessdata, biliJct, isLoggedIn: true });
      try {
        const info = await getUserInfo();
        await AsyncStorage.setItem('FACE', info.face);
        set({ face: info.face, username: info.uname, uid: String(info.mid) });
      } catch { }
    }
  },

  setProfile: (face, username, uid) => set({ face, username, uid }),
}));
