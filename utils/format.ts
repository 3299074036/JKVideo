export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + '亿';
  if (n >= 10_000) return (n / 10_000).toFixed(1) + '万';

  return String(Math.round(n));
}

/**
 * 解析 B 站接口返回的播放量：可能是数字，也可能是 "257.4万" / "1.2亿" / "3812" 这样的字符串。
 * 解析失败返回 0。
 */
export function parseCount(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v.trim().replace(/,/g, '');
    const num = parseFloat(s);
    if (Number.isNaN(num)) return 0;
    if (s.includes('亿')) return Math.round(num * 100_000_000);
    if (s.includes('万')) return Math.round(num * 10_000);
    return Math.round(num);
  }
  return 0;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  if (h > 0) {
    const hh = String(h).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } else {
    return `${mm}:${ss}`;
  }
}

export function formatTime(ctime: number): string {
  const d = new Date(ctime * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
