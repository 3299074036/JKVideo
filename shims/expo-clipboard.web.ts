/** Web shim for expo-clipboard - use native browser clipboard API */
export async function setStringAsync(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); } catch {}
}
export async function getStringAsync(): Promise<string> {
  try { return await navigator.clipboard.readText(); } catch { return ''; }
}
