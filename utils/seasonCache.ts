import type { VideoItem } from "../services/types";

export type Season = NonNullable<VideoItem["ugc_season"]>;

/**
 * 合集数据缓存：视频详情页点"合集 · 标题"时先把 season 对象塞进来，
 * 再跳 /season/[id]，合集页直接读缓存，不用多一次网络请求。
 */
const cache = new Map<number, Season>();

export function setCachedSeason(season: Season): void {
  cache.set(season.id, season);
  // 只留最近 10 个，防止常驻内存膨胀
  if (cache.size > 10) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
}

export function getCachedSeason(id: number): Season | undefined {
  return cache.get(id);
}
