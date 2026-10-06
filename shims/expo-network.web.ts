/** Web shim for expo-network */
export enum NetworkStateType {
  NONE = 0, UNKNOWN = 1, CELLULAR = 2, WIFI = 3, BLUETOOTH = 4,
  ETHERNET = 5, WIMAX = 6, VPN = 7, OTHER = 8,
}
export async function getNetworkStateAsync() {
  return { isConnected: navigator.onLine, isInternetReachable: navigator.onLine, type: NetworkStateType.UNKNOWN };
}
export async function getIpAddressAsync(): Promise<string> { return '0.0.0.0'; }
export async function isAirplaneModeEnabledAsync(): Promise<boolean> { return false; }
