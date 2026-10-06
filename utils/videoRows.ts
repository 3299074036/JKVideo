import type { VideoItem } from '../services/types';

export interface NormalRow {
  type: 'pair';
  left: VideoItem;
  right: VideoItem | null;
}

export interface BigRow {
  type: 'big';
  item: VideoItem;
}

export type ListRow = NormalRow | BigRow;

export function toListRows(pages: VideoItem[][]): ListRow[] {
  const rows: ListRow[] = [];

  for (const chunk of pages) {
    if (chunk.length === 0) continue;

    let bigIdx = 0;
    let maxView = chunk[0].stat?.view ?? 0;
    for (let i = 1; i < chunk.length; i++) {
      const v = chunk[i].stat?.view ?? 0;
      if (v > maxView) { maxView = v; bigIdx = i; }
    }

    const bigItem = chunk[bigIdx];
    const rest = chunk.filter((_, i) => i !== bigIdx);

    const pairs: NormalRow[] = [];
    for (let i = 0; i < rest.length; i += 2) {
      if (rest[i + 1]) {
        pairs.push({ type: 'pair', left: rest[i], right: rest[i + 1] ?? null });
      }
    }

    if (rows.length < 20) {
      rows.push({ type: 'big', item: bigItem }, ...pairs);
    } else {
      rows.push(...pairs, { type: 'big', item: bigItem });
    }
  }
  return rows;
}
