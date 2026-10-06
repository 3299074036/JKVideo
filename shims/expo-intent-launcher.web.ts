/** Web shim for expo-intent-launcher - no-op for web */
export async function startActivityAsync(_activity: string, _params?: unknown): Promise<unknown> {
  return {};
}
export const ActivityAction = {};
