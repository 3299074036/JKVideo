export function formatCount(n: number): string {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + '亿';
  if (n >= 10_000) return (n / 10_000).toFixed(1) + '万';
  
  return String(n);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

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
