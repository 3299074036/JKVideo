/** Web shim for expo-file-system */
export const documentDirectory = '';
export const cacheDirectory = '';
export async function getInfoAsync(_uri: string) { return { exists: false, isDirectory: false }; }
export async function readAsStringAsync(_uri: string) { return ''; }
export async function writeAsStringAsync(_uri: string, _contents: string) {}
export async function deleteAsync(_uri: string) {}
export async function moveAsync(_opts: any) {}
export async function copyAsync(_opts: any) {}
export async function makeDirectoryAsync(_uri: string) {}
export async function getContentUriAsync(_uri: string) { return ''; }
export function createDownloadResumable(_url: string, _fileUri: string, _opts?: any, _cb?: any) {
  return { downloadAsync: async () => ({}) };
}
