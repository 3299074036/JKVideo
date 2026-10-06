/** Web shim for @dr.pogodin/react-native-static-server - no-op for web */
export default class StaticServer {
  constructor(_port?: number, _root?: string, _options?: unknown) {}
  start(): Promise<string> { return Promise.resolve(''); }
  stop(): Promise<void> { return Promise.resolve(); }
  isRunning(): boolean { return false; }
  get origin(): string { return ''; }
}
