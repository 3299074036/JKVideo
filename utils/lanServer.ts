import StaticServer from '@dr.pogodin/react-native-static-server';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';

const PORT = 18080;
const SHARE_DIR_NAME = 'lan_share_tmp';
let server: StaticServer | null = null;

function randomToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * 启动局域网分享：只把待分享的单个文件拷到独立临时目录再 serve，
 * 对外 URL 带随机 token（不可猜），不再暴露整个 documentDirectory。
 * @returns 可直接分享的完整 URL
 */
export async function startLanServer(srcFileUri: string, fileName: string): Promise<string> {
  await stopLanServer();
  const docDir = FileSystem.documentDirectory!;
  const shareDir = `${docDir}${SHARE_DIR_NAME}/`;
  // 清理旧分享残留，重建隔离目录
  await FileSystem.deleteAsync(shareDir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(shareDir, { intermediates: true });
  const servedName = `${randomToken()}_${fileName}`;
  await FileSystem.copyAsync({ from: srcFileUri, to: shareDir + servedName });
  const root = shareDir.replace('file://', '');
  server = new StaticServer({ fileDir: root, port: PORT, nonLocal: true });
  await server.start();
  const ip = await Network.getIpAddressAsync();
  return `http://${ip}:${PORT}/${servedName}`;
}

export async function stopLanServer(): Promise<void> {
  if (server) {
    try {
      await server.stop();
    } catch {}
    server = null;
  }
  // 分享结束即删除临时目录，不留文件
  const shareDir = `${FileSystem.documentDirectory!}${SHARE_DIR_NAME}/`;
  try {
    await FileSystem.deleteAsync(shareDir, { idempotent: true });
  } catch {}
}
