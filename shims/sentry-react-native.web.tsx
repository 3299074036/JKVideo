/** Web shim for @sentry/react-native - no-op stubs for web platform */
import React from 'react';

export const init = (_options?: unknown) => {};
export const wrap = <T>(component: T): T => component;
export const captureException = (_error: unknown, _hint?: unknown) => '';
export const captureMessage = (_message: string, _level?: unknown) => '';
export const setUser = (_user: unknown) => {};
export const setTag = (_key: string, _value: unknown) => {};
export const setExtra = (_key: string, _extra: unknown) => {};
export const addBreadcrumb = (_breadcrumb: unknown) => {};
export const configureScope = (_callback: unknown) => {};
export const withScope = (_callback: unknown) => {};
export const getCurrentHub = () => ({ getClient: () => undefined });
export const ReactNativeTracing = class {};
export const ReactNavigationInstrumentation = class {};
export const TouchEventBoundary = ({ children }: { children: React.ReactNode }) => children;

export class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export default { init, wrap, captureException, captureMessage, setUser, setTag, setExtra };
