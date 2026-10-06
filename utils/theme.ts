import { useSettingsStore } from '../store/settingsStore';

export type ThemeColors = {
  bg: string;           // 页面/列表背景
  card: string;         // 卡片/section 背景
  text: string;         // 主文字
  textSub: string;      // 次要文字
  border: string;       // 分割线
  inputBg: string;      // 输入框背景
  sheetBg: string;      // 底部弹出面板背景
  modalBg: string;      // 弹窗/面板背景
  modalText: string;    // 弹窗主文字
  modalTextSub: string; // 弹窗次要文字
  modalBorder: string;  // 弹窗分割线
  placeholder: string;  // 占位背景（图片加载中）
  iconDefault: string;  // 默认图标色
  danger: string;       // 危险操作色
};

const light: ThemeColors = {
  bg: '#f4f4f4',
  card: '#fff',
  text: '#212121',
  textSub: '#999',
  border: '#eee',
  inputBg: '#f0f0f0',
  sheetBg: '#fff',
  modalBg: '#fff',
  modalText: '#212121',
  modalTextSub: '#555',
  modalBorder: '#eee',
  placeholder: '#ddd',
  iconDefault: '#999',
  danger: '#ff4757',
};

const dark: ThemeColors = {
  bg: '#0f0f0f',
  card: '#1a1a1a',
  text: '#e0e0e0',
  textSub: '#666',
  border: '#2a2a2a',
  inputBg: '#2a2a2a',
  sheetBg: '#222',
  modalBg: '#2a2a2a',
  modalText: '#e0e0e0',
  modalTextSub: '#888',
  modalBorder: '#3a3a3a',
  placeholder: '#333',
  iconDefault: '#777',
  danger: '#ff6b81',
};

export function useTheme(): ThemeColors {
  const darkMode = useSettingsStore(s => s.darkMode);
  return darkMode ? dark : light;
}
