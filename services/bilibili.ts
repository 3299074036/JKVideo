import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import pako from 'pako';
import type { VideoItem, Comment, PlayUrlResponse, QRCodeInfo, VideoShotData, DanmakuItem, LiveRoom, LiveRoomDetail, LiveAnchorInfo, LiveStreamInfo, SearchSuggestItem, HotSearchItem, FollowTag, DynamicItem } from './types';
import { signWbi } from '../utils/wbi';
import { parseDanmakuXml } from '../utils/danmaku';
import { parseCount } from '../utils/format';
import { getSecure, setSecure } from '../utils/secureStorage';

// @react-native-cookies/cookies 只在原生端可用；web 走代理头，这里懒加载避免 web 构建引入原生代码。
// 注意：该库运行时只有具名导出（get/set/clearAll…），没有 .default，直接 require 整个模块。
let CookieManager: {
  get(url: string): Promise<Record<string, { value?: string }>>;
} | null = null;
if (Platform.OS !== 'web') {
  try { CookieManager = require('@react-native-cookies/cookies'); } catch {}
}

const isWeb = Platform.OS === 'web';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE = isWeb ? 'http://localhost:3001/bilibili-api' : 'https://api.bilibili.com';
const PASSPORT = isWeb ? 'http://localhost:3001/bilibili-passport' : 'https://passport.bilibili.com';
const COMMENT_BASE = isWeb
  ? 'http://localhost:3001/bilibili-comment'
  : 'https://comment.bilibili.com';

function generateBuvid3(): string {
  const h = () => Math.floor(Math.random() * 16).toString(16);
  const s = (n: number) => Array.from({ length: n }, h).join('');
  return `${s(8)}-${s(4)}-${s(4)}-${s(4)}-${s(12)}infoc`;
}

async function getBuvid3(): Promise<string> {
  let buvid3 = await AsyncStorage.getItem('buvid3');
  if (!buvid3) {
    buvid3 = generateBuvid3();
    await AsyncStorage.setItem('buvid3', buvid3);
  }
  return buvid3;
}

const api = axios.create({
  baseURL: BASE,
  timeout: 10000,
  headers: isWeb ? {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  } : {
    'User-Agent': UA,
    'Referer': 'https://www.bilibili.com',
    'Origin': 'https://www.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  },
});

api.interceptors.request.use(async (config) => {
  const [sessdata, biliJct, buvid3] = await Promise.all([
    getSecure('SESSDATA'),
    getSecure('bili_jct'),
    getBuvid3(),
  ]);
  if (isWeb) {
    // Browsers block Cookie/Referer/Origin headers; relay via custom headers to proxy
    if (buvid3) config.headers['X-Buvid3'] = buvid3;
    if (sessdata) config.headers['X-Sessdata'] = sessdata;
    if (biliJct) config.headers['X-Bili-Jct'] = biliJct;
  } else {
    const cookies: string[] = [`buvid3=${buvid3}`];
    if (sessdata) cookies.push(`SESSDATA=${sessdata}`);
    if (biliJct) cookies.push(`bili_jct=${biliJct}`);
    config.headers['Cookie'] = cookies.join('; ');
  }
  return config;
});

// 被动累积：任何响应 Set-Cookie 里出现 bili_jct 都顺手存下来。覆盖老用户没有 CSRF 的情况。
api.interceptors.response.use(async (response) => {
  if (isWeb) return response;
  const { biliJct } = extractLoginCookies(response.headers?.['set-cookie']);
  if (biliJct) await setSecure('bili_jct', biliJct);
  return response;
});

/** 从 Set-Cookie 响应头（string | string[]，兼容 RN 各种合并形态）里提取 SESSDATA / bili_jct。 */
function extractLoginCookies(setCookie: unknown): { sessdata?: string; biliJct?: string } {
  const out: { sessdata?: string; biliJct?: string } = {};
  const list = Array.isArray(setCookie)
    ? setCookie
    : typeof setCookie === 'string'
      ? [setCookie]
      : [];
  for (const c of list) {
    if (typeof c !== 'string') continue;
    // RN 常把多条 Set-Cookie 用 ", " 合并成一个字符串；先按 ", " 切分出单条。
    // 前瞻要求逗号后出现 cookie 名（含 =），避免把 Expires=Wed, 21 Oct ... 里
    // 的日期逗号误切（日期段里逗号后没有 "名=" 结构）。
    const singles = c.split(/,(?=[^;,]+?=)/);
    for (const single of singles) {
      for (const rawPart of single.split(';')) {
        const p = rawPart.trim();
        if (!out.sessdata && p.startsWith('SESSDATA=')) {
          const v = p.slice('SESSDATA='.length);
          if (v) out.sessdata = v;
        } else if (!out.biliJct && p.startsWith('bili_jct=')) {
          const v = p.slice('bili_jct='.length);
          if (v) out.biliJct = v;
        }
      }
    }
    if (out.sessdata && out.biliJct) break;
  }
  return out;
}

/**
 * 从原生 Cookie 存储读 B 站登录 cookie。
 * 背景：扫码登录成功后，原生网络栈一定会把 Set-Cookie 写入系统 Cookie 存储；
 * 但 JS 层不一定能从 XHR 响应头里读到完整的 Set-Cookie（各端 RN 实现有差异），
 * 之前因此出现过"已登录但 bili_jct 缺失，关注/收藏等写操作不可用"的问题，这里做兜底。
 */
async function getNativeLoginCookies(): Promise<{ sessdata?: string; biliJct?: string }> {
  const out: { sessdata?: string; biliJct?: string } = {};
  if (!CookieManager) return out;
  for (const url of ['https://passport.bilibili.com', 'https://www.bilibili.com']) {
    try {
      const cookies = await CookieManager.get(url);
      const sess = cookies?.['SESSDATA']?.value;
      const jct = cookies?.['bili_jct']?.value;
      if (sess && !out.sessdata) out.sessdata = sess;
      if (jct && !out.biliJct) out.biliJct = jct;
      if (out.sessdata && out.biliJct) break;
    } catch {
      // 忽略，继续试下一个域名
    }
  }
  return out;
}

/**
 * 确保有 bili_jct 可用：secure 存储里没有时，尝试从原生 Cookie 存储补一次并存下。
 * 用于修复"已登录但 bili_jct 缺失"的状态，避免用户被迫重新扫码登录。
 */
export async function ensureBiliJct(): Promise<string | null> {
  const existing = await getSecure('bili_jct');
  if (existing) return existing;
  if (isWeb) return null;
  const { biliJct } = await getNativeLoginCookies();
  if (biliJct) await setSecure('bili_jct', biliJct);
  return biliJct ?? null;
}

// ─── Request deduplication ──────────────────────────────────────────────────
// Prevents identical concurrent requests (same URL + params) from hitting the network twice.
const inflightRequests = new Map<string, Promise<any>>();

function dedupeKey(url: string, params?: Record<string, any>): string {
  return params ? `${url}?${JSON.stringify(params)}` : url;
}

/** Wraps an async API call so that concurrent calls with the same key share one promise. */
function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => { inflightRequests.delete(key); });
  inflightRequests.set(key, promise);
  return promise;
}

/**
 * 指数退避重试包装。仅对网络层面错误（无 response、5xx、超时）重试；
 * 业务错误（如 401/403/-352）直接抛出，不重试。
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  backoff = [500, 1500],
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      const isNetwork = !e?.response || e?.code === 'ECONNABORTED';
      const is5xx = typeof status === 'number' && status >= 500;
      if (!isNetwork && !is5xx) throw e;
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, backoff[attempt] ?? backoff[backoff.length - 1]));
    }
  }
  throw lastErr;
}

// WBI key cache (rotates ~daily)
let wbiKeys: { imgKey: string; subKey: string } | null = null;
let wbiKeysTimestamp = 0;
const WBI_KEYS_TTL = 12 * 60 * 60 * 1000; // 12 hours

async function getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  if (wbiKeys && Date.now() - wbiKeysTimestamp < WBI_KEYS_TTL) return wbiKeys;
  try {
    const res = await api.get('/x/web-interface/nav');
    const wbiImg = res.data?.data?.wbi_img;
    if (!wbiImg?.img_url || !wbiImg?.sub_url) {
      if (wbiKeys) return wbiKeys; // fallback to stale cache
      throw new Error('Failed to get WBI keys: missing wbi_img data');
    }
    const extract = (url: string) => url.split('/').pop()!.replace(/\.\w+$/, '');
    wbiKeys = { imgKey: extract(wbiImg.img_url), subKey: extract(wbiImg.sub_url) };
    wbiKeysTimestamp = Date.now();
    return wbiKeys;
  } catch (e) {
    if (wbiKeys) return wbiKeys; // fallback to stale cache on network error
    throw e;
  }
}

export async function getRecommendFeed(freshIdx = 0): Promise<VideoItem[]> {
  const { imgKey, subKey } = await getWbiKeys();
  const signed = signWbi(
    { fresh_type: 3, fresh_idx: freshIdx, fresh_idx_1h: freshIdx, ps: 21, feed_version: 'V8' },
    imgKey,
    subKey,
  );
  const res = await api.get('/x/web-interface/wbi/index/top/feed/rcmd', { params: signed });
  const items: any[] = res.data.data?.item ?? [];
  return items
    .filter(item => item.goto === 'av' && item.bvid && item.title)
    .map(item => ({
      ...item,
      aid: item.id ?? item.aid,
      pic: item.pic ?? item.cover,
      owner: item.owner ?? { mid: 0, name: item.owner_info?.name ?? '', face: item.owner_info?.face ?? '' },
    } as VideoItem));
}

export async function getPopularVideos(pn = 1): Promise<VideoItem[]> {
  const res = await api.get('/x/web-interface/popular', { params: { pn, ps: 20 } });
  return (res.data?.data?.list ?? []) as VideoItem[];
}

export function getVideoDetail(bvid: string): Promise<VideoItem> {
  return dedupe(dedupeKey('/x/web-interface/view', { bvid }), () =>
    withRetry(async () => {
      const res = await api.get('/x/web-interface/view', { params: { bvid } });
      if (res.data?.code !== 0) {
        throw new Error(`API ${res.data?.code}: ${res.data?.message ?? '获取视频详情失败'}`);
      }
      return res.data.data as VideoItem;
    }),
  );
}

export async function getVideoRelated(bvid: string): Promise<VideoItem[]> {
  const res = await api.get('/x/web-interface/archive/related', { params: { bvid } });
  const items: any[] = res.data.data ?? [];
  return items as VideoItem[];
}

export function getPlayUrl(bvid: string, cid: number, qn = 64): Promise<PlayUrlResponse> {
  const isAndroid = Platform.OS === 'android';
  // 1488 = 16(DASH)|64(HDR)|128(4K)|256(杜比全景声)|1024(杜比视界)
  const FNVAL_ANDROID = 16 | 64 | 128 | 256 | 1024;
  const params = isAndroid
    ? { bvid, cid, qn, fnval: FNVAL_ANDROID, fourk: 1 }
    : { bvid, cid, qn, fnval: 0, platform: 'html5', fourk: 1 };
  return dedupe(dedupeKey('/x/player/playurl', params), () =>
    withRetry(async () => {
      const res = await api.get('/x/player/playurl', { params });
      if (res.data?.code !== 0) {
        throw new Error(`API ${res.data?.code}: ${res.data?.message ?? '获取播放地址失败'}`);
      }
      return res.data.data as PlayUrlResponse;
    }),
  );
}

export async function getPlayUrlForDownload(
  bvid: string,
  cid: number,
  qn = 64,
): Promise<string> {
  const res = await api.get('/x/player/playurl', {
    params: { bvid, cid, qn, fnval: 0, platform: 'html5' },
  });
  if (res.data?.code !== 0) {
    throw new Error(`API ${res.data?.code}: ${res.data?.message ?? '请求失败'}`);
  }
  const durlItem = res.data?.data?.durl?.[0];
  // 优先用主 URL，主 URL 失效时退到 backup_url
  const url: string | undefined = durlItem?.url || (durlItem?.backup_url as string[] | undefined)?.[0];
  if (!url) throw new Error('无法获取下载地址（durl 为空）');
  return url;
}

export async function getUploaderStat(mid: number): Promise<{ follower: number; archiveCount: number }> {
  const res = await api.get('/x/web-interface/card', { params: { mid } });
  const data = res.data.data ?? {};
  return {
    follower: data.follower ?? 0,
    archiveCount: data.archive_count ?? 0,
  };
}

export async function getUploaderInfo(mid: number): Promise<{ name: string; face: string; sign: string; follower: number; archiveCount: number }> {
  const res = await api.get('/x/web-interface/card', { params: { mid } });
  const data = res.data.data ?? {};
  return {
    name: data.card?.name ?? '',
    face: data.card?.face ?? '',
    sign: data.card?.sign ?? '',
    follower: data.follower ?? 0,
    archiveCount: data.archive_count ?? 0,
  };
}

export async function getUploaderVideos(mid: number, pn = 1, ps = 20): Promise<{ videos: VideoItem[]; total: number }> {
  const { imgKey, subKey } = await getWbiKeys();
  const signed = signWbi({ mid, pn, ps, order: 'pubdate', platform: 'web' }, imgKey, subKey);
  const res = await api.get('/x/space/wbi/arc/search', { params: signed });
  const vlist: any[] = res.data?.data?.list?.vlist ?? [];
  const total: number = res.data?.data?.page?.count ?? 0;
  const videos: VideoItem[] = vlist.map((v: any) => ({
    bvid: v.bvid,
    aid: v.aid ?? 0,
    title: v.title,
    pic: v.pic ? (v.pic.startsWith('//') ? `https:${v.pic}` : v.pic) : '',
    owner: { mid, name: v.author ?? '', face: '' },
    stat: {
      view: v.play ?? 0,
      danmaku: v.video_review ?? 0,
      reply: v.comment ?? 0,
      like: 0,
      coin: 0,
      favorite: 0,
    },
    duration: v.length ? parseDuration(v.length) : 0,
    desc: v.description ?? '',
    cid: v.cid ?? 0,
    pages: [],
    ugc_season: undefined,
  }));
  return { videos, total };
}

export async function getUserInfo(): Promise<{ face: string; uname: string; mid: number }> {
  const res = await api.get('/x/web-interface/nav');
  // 未登录时接口返回 code:-101 且 data 为 null，直接解构会抛 TypeError
  const data = res.data?.data ?? {};
  const { face, uname, mid } = data;
  return { face: face ?? '', uname: uname ?? '', mid: mid ?? 0 };
}

export async function getComments(
  aid: number,
  cursor = '',
  sort = 2,
): Promise<{ replies: Comment[]; nextCursor: string; isEnd: boolean }> {
  const mode = sort === 2 ? 3 : 2; // 3=hot, 2=time
  const res = await api.get('/x/v2/reply/main', {
    params: {
      oid: aid,
      type: 1,
      mode,
      plat: 1,
      pagination_str: JSON.stringify({ offset: cursor }),
    },
  });
  const data = res.data.data;
  const replies = (data?.replies ?? []) as Comment[];
  const nextCursor: string = data?.cursor?.next ?? '';
  const isEnd: boolean = data?.cursor?.is_end ?? true;
  return { replies, nextCursor, isEnd };
}

export async function getVideoShot(bvid: string, cid: number): Promise<VideoShotData | null> {
  try {
    const res = await api.get('/x/player/videoshot', {
      params: { bvid, cid, index: 1 },
    });
    return res.data.data as VideoShotData;
  } catch { return null; }
}

export async function generateQRCode(): Promise<QRCodeInfo> {
  const headers = isWeb
    ? {}
    : { 'Referer': 'https://www.bilibili.com' };
  const res = await axios.get(`${PASSPORT}/x/passport-login/web/qrcode/generate`, { headers, timeout: 10000 });
  return res.data.data as QRCodeInfo;
}

export async function pollQRCode(qrcode_key: string): Promise<{ code: number; cookie?: string; csrf?: string }> {
  const headers = isWeb
    ? {}
    : { 'Referer': 'https://www.bilibili.com' };
  const res = await axios.get(`${PASSPORT}/x/passport-login/web/qrcode/poll`, {
    params: { qrcode_key },
    headers,
    timeout: 10000,
  });
  const { code } = res.data.data;
  let cookie: string | undefined;
  let csrf: string | undefined;
  if (code === 0) {
    if (isWeb) {
      // Proxy relays SESSDATA via custom response header
      cookie = res.headers['x-sessdata'] as string | undefined;
      csrf = res.headers['x-bili-jct'] as string | undefined;
    } else {
      const fromHeaders = extractLoginCookies(res.headers?.['set-cookie']);
      cookie = fromHeaders.sessdata;
      csrf = fromHeaders.biliJct;
      // 兜底：响应头拿不全时，从原生 Cookie 存储补（原生网络栈一定写了 Set-Cookie）
      if (!cookie || !csrf) {
        const fromNative = await getNativeLoginCookies();
        cookie = cookie || fromNative.sessdata;
        csrf = csrf || fromNative.biliJct;
      }
    }
  }
  return { code, cookie, csrf };
}

// 查关注状态（attribute: 0=未关注, 2=关注, 6=互相关注）
export async function getRelation(mid: number): Promise<{ following: boolean; mutual: boolean }> {
  try {
    const res = await api.get('/x/relation', { params: { fid: mid } });
    const attribute = res.data?.data?.attribute ?? 0;
    return {
      following: attribute === 2 || attribute === 6,
      mutual: attribute === 6,
    };
  } catch {
    return { following: false, mutual: false };
  }
}

/** 修改与 UP 主的关系：act=1 关注，act=2 取消关注。失败抛错（消息文本来自 B 站 code/message） */
export async function modifyRelation(mid: number, act: 1 | 2): Promise<void> {
  const biliJct = await ensureBiliJct();
  if (!biliJct) throw new Error('NO_CSRF');
  // application/x-www-form-urlencoded body
  const body =
    `fid=${encodeURIComponent(String(mid))}` +
    `&act=${act}` +
    `&re_src=11` +
    `&csrf=${encodeURIComponent(biliJct)}`;
  const res = await api.post('/x/relation/modify', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const code = res.data?.code;
  if (code !== 0) {
    throw new Error(res.data?.message || `code=${code}`);
  }
}


const LIVE_BASE = isWeb ? 'http://localhost:3001/bilibili-live' : 'https://api.live.bilibili.com';

export async function getLiveList(page = 1, parentAreaId = 0): Promise<LiveRoom[]> {
  if (parentAreaId === 0) {
    // 推荐：使用原有接口
    const res = await api.get(`${LIVE_BASE}/xlive/web-interface/v1/webMain/getMoreRecList`, {
      params: { platform: 'web', page, page_size: 20 },
    });
    const list: any[] = res.data.data?.recommend_room_list ?? [];
    return list.map(item => ({
      roomid: item.roomid,
      uid: item.uid,
      title: item.title,
      uname: item.uname,
      face: item.face,
      cover: item.cover ?? item.user_cover ?? item.keyframe,
      online: item.online,
      area_name: item.area_v2_name ?? '',
      parent_area_name: item.area_v2_parent_name ?? '',
    }));
  }
  // 分区筛选：使用 getRoomList 接口
  const res = await api.get(`${LIVE_BASE}/room/v1/area/getRoomList`, {
    params: {
      parent_area_id: parentAreaId,
      area_id: 0,
      page,
      page_size: 20,
      sort_type: 'online',
      platform: 'web',
    },
  });
  const list: any[] = res.data.data ?? [];
  return list.map(item => ({
    roomid: item.roomid,
    uid: item.uid,
    title: item.title,
    uname: item.uname,
    face: item.face,
    cover: item.cover ?? item.user_cover ?? item.keyframe,
    online: item.online,
    area_name: item.area_v2_name ?? item.areaName ?? '',
    parent_area_name: item.area_v2_parent_name ?? item.parentAreaName ?? '',
  }));
}

export async function getLiveRoomDetail(roomId: number): Promise<LiveRoomDetail> {
  const res = await api.get(`${LIVE_BASE}/room/v1/Room/get_info`, {
    params: { room_id: roomId },
  });
  return res.data.data as LiveRoomDetail;
}

export async function getLiveAnchorInfo(roomId: number): Promise<LiveAnchorInfo> {
  const res = await api.get(`${LIVE_BASE}/live_user/v1/UserInfo/get_anchor_in_room`, {
    params: { roomid: roomId },
  });
  const info = res.data.data?.info ?? {};
  return { uid: info.uid, uname: info.uname, face: info.face } as LiveAnchorInfo;
}

export async function getLiveStreamUrl(roomId: number, qn = 10000): Promise<LiveStreamInfo> {
  try {
    const res = await api.get(`${LIVE_BASE}/xlive/web-room/v2/index/getRoomPlayInfo`, {
      params: { room_id: roomId, protocol: '0,1', format: '0,1,2', codec: '0', qn, platform: 'android' },
    });
    const playurl = res.data?.data?.playurl_info?.playurl;
    const streams: any[] = playurl?.stream ?? [];
    const gQnDesc: any[] = playurl?.g_qn_desc ?? [];
    const qualities = gQnDesc
      .map((q: any) => ({ qn: q.qn as number, desc: q.desc as string }))
      .filter(q => q.qn <= 10000);

    let hlsUrl = '';
    let flvUrl = '';
    let currentQn = 0;

    const hlsStream = streams.find(s => s.protocol_name === 'http_hls');
    if (hlsStream) {
      const fmt = hlsStream.format?.find((f: any) => f.format_name === 'fmp4') ?? hlsStream.format?.[0];
      const codec = fmt?.codec?.find((c: any) => c.codec_name === 'avc') ?? fmt?.codec?.[0];
      const urlInfo = codec?.url_info?.[0];
      if (urlInfo) {
        hlsUrl = urlInfo.host + codec.base_url + (urlInfo.extra ?? '');
        currentQn = codec.current_qn ?? 0;
      }
    }

    const flvStream = streams.find(s => s.protocol_name === 'http_stream');
    if (flvStream) {
      const fmt = flvStream.format?.[0];
      const codec = fmt?.codec?.find((c: any) => c.codec_name === 'avc') ?? fmt?.codec?.[0];
      const urlInfo = codec?.url_info?.[0];
      if (urlInfo) {
        flvUrl = urlInfo.host + codec.base_url + (urlInfo.extra ?? '');
      }
    }

    return { hlsUrl, flvUrl, qn: currentQn, qualities };
  } catch {
    return { hlsUrl: '', flvUrl: '', qn: 0, qualities: [] };
  }
}

function parseDuration(s: string): number {
  const parts = s.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export async function searchVideos(keyword: string, page = 1, order = ''): Promise<VideoItem[]> {
  const { imgKey, subKey } = await getWbiKeys();
  const params: Record<string, any> = { keyword, search_type: 'video', page, page_size: 20 };
  if (order) params.order = order;
  const signed = signWbi(
    params,
    imgKey,
    subKey,
  );
  const res = await api.get('/x/web-interface/wbi/search/type', { params: signed });
  const results: any[] = res.data.data?.result ?? [];
  return results
    .filter((item: any) => item.bvid && item.title)
    .map((item: any) => ({
      bvid: item.bvid,
      aid: item.aid ?? 0,
      title: item.title.replace(/<[^>]+>/g, ''),
      pic: item.pic ? (item.pic.startsWith('//') ? `https:${item.pic}` : item.pic) : '',
      owner: { mid: item.mid ?? 0, name: item.author ?? '', face: '' },
      stat: {
        view: item.play ?? 0,
        danmaku: item.video_review ?? 0,
        reply: item.review ?? 0,
        like: 0,
        coin: 0,
        favorite: 0,
      },
      duration: item.duration ? parseDuration(item.duration) : 0,
      desc: item.description ?? '',
      cid: 0,
      pages: [],
      ugc_season: undefined,
    } as VideoItem));
}

export async function getLiveDanmakuHistory(roomId: number): Promise<{
  danmakus: DanmakuItem[];
  adminMsgs: string[];
}> {
  // gethistory 默认返回 ~10 条；尝试带 count 参数拉更多，B 站不支持时会自动忽略
  const res = await api.get(`${LIVE_BASE}/xlive/web-room/v1/dM/gethistory`, {
    params: { roomid: roomId, room_id: roomId, count: 30 },
  });

  const room: any[] = res.data?.data?.room ?? [];
  const admin: any[] = res.data?.data?.admin ?? [];
  const adminMsgs = admin.map((a: any) => a.text ?? '').filter(Boolean);
  const danmakus = room.map((m: any) => ({
    time: 0,
    mode: 1 as const,
    fontSize: 25,
    color: m.text_color ? parseInt(m.text_color.replace('#', ''), 16) : 0xffffff,
    text: m.text ?? '',
    uname: m.nickname ?? m.uname,
    isAdmin: m.isadmin === 1,
    guardLevel: m.guard_level ?? 0,
    medalLevel: Array.isArray(m.medal) && m.medal.length > 0 ? m.medal[0] as number : undefined,
    medalName: Array.isArray(m.medal) && m.medal.length > 1 ? m.medal[1] as string : undefined,
    timeline: m.timeline as string | undefined,
  }));
  return { danmakus, adminMsgs };
}

/** 当前分 P 的在线观看人数（/x/player/online/total），失败返回 0。
 * 注意：接口返回的 total 是字符串（如 "114"），必须用 parseCount 转数字，
 * 否则 formatCount 会因 Number.isFinite 校验失败而永远显示 0。 */
export async function getOnlineCount(bvid: string, cid: number): Promise<number> {
  try {
    const res = await api.get('/x/player/online/total', { params: { bvid, cid } });
    return parseCount(res.data?.data?.total);
  } catch {
    return 0;
  }
}

export async function getDanmaku(cid: number): Promise<DanmakuItem[]> {
  return withRetry(async () => {
    if (isWeb) {
      // web 走代理，代理已解压，直接拿文本
      const res = await axios.get(`${COMMENT_BASE}/${cid}.xml`, {
        headers: {},
        responseType: 'text',
        timeout: 10000,
      });
      return parseDanmakuXml(res.data);
    }

    // Native：arraybuffer + 逐一尝试解压（服务器强制压缩，无法避免）
    const res = await axios.get(`${COMMENT_BASE}/${cid}.xml`, {
      headers: { Referer: 'https://www.bilibili.com', 'User-Agent': UA },
      responseType: 'arraybuffer',
      timeout: 10000,
    });

    const bytes = new Uint8Array(res.data as ArrayBuffer);
    let xmlText: string | undefined;

    // 依次尝试：inflate (gzip/zlib) → inflateRaw (raw deflate)
    for (const fn of [pako.inflate, pako.inflateRaw] as Array<(input: Uint8Array, opts: pako.InflateOptions) => string>) {
      try {
        xmlText = fn(bytes, { to: 'string' });
        if (xmlText.includes('<d ')) break;
        xmlText = undefined;
      } catch { /* 继续尝试下一种 */ }
    }

    if (!xmlText) {
      // 最后尝试当作明文
      xmlText = new TextDecoder('utf-8').decode(bytes);
    }

    return parseDanmakuXml(xmlText);
  }).catch((e) => {
    // 只打印 message：完整 error 对象里 config.headers 带有 Cookie（SESSDATA/bili_jct），不能进 logcat
    console.warn('getDanmaku failed:', (e as Error)?.message ?? 'unknown error');
    return [] as DanmakuItem[];
  });
}

export async function getFollowedLiveRooms(): Promise<LiveRoom[]> {
  const res = await api.get(`${LIVE_BASE}/xlive/web-ucenter/v1/xfetter/FeedList`, {
    params: { page: 1, page_size: 10, platform: 'web' },
  });
  if (res.data?.code !== 0) {
    console.warn('getFollowedLiveRooms error:', res.data?.code, res.data?.message);
    return [];
  }
  // B站不同版本接口返回字段可能为 list 或 rooms
  const list: any[] = res.data?.data?.list ?? res.data?.data?.rooms ?? [];
  return list.map((r: any) => ({
    roomid: r.room_id ?? r.roomid,
    uid: r.uid,
    title: r.title,
    uname: r.uname,
    face: r.face,
    cover: r.cover || r.keyframe || '',
    online: r.online ?? 0,
    area_name: r.area_v2_name ?? '',
    parent_area_name: r.area_v2_parent_name ?? '',
  }));
}

export async function getSearchSuggest(term: string): Promise<SearchSuggestItem[]> {
  try {
    const res = await api.get('/x/web-interface/search/suggest', {
      params: { term, main_ver: 'v1', highlight: '' },
    });
    const tags: any[] = res.data?.data?.tag ?? [];
    return tags.map((t: any) => ({ value: t.value ?? '', ref: t.ref ?? 0 }));
  } catch {
    return [];
  }
}

export async function getHotSearch(): Promise<HotSearchItem[]> {
  try {
    const res = await api.get('/x/web-interface/wbi/search/square', {
      params: { limit: 10 },
    });
    const trending: any[] = res.data?.data?.trending?.list ?? [];
    return trending.map((t: any) => ({
      keyword: t.keyword ?? '',
      show_name: t.show_name ?? t.keyword ?? '',
      icon: t.icon,
    }));
  } catch {
    return [];
  }
}

// ─── 用户页：历史 / 收藏 / 关注 ─────────────────────────────────────────────

/** 云端观看历史。max/viewAt 为上一页返回的 cursor，首次传 0。 */
export async function getHistoryList(
  max = 0,
  viewAt = 0,
): Promise<{ items: HistoryItem[]; max: number; viewAt: number }> {
  const res = await api.get('/x/web-interface/history/cursor', {
    params: { type: 'all', ps: 20, max, view_at: viewAt },
  });
  if (res.data?.code !== 0) {
    throw new Error(res.data?.message || `code=${res.data?.code}`);
  }
  const data = res.data?.data ?? {};
  const list: any[] = data.list ?? [];
  const cursor = data.cursor ?? {};
  return {
    items: list
      .filter((it: any) => it.history?.bvid || it.bvid)
      .map((it: any) => ({
        kid: String(it.kid ?? it.history?.bvid ?? it.bvid ?? ''),
        bvid: it.history?.bvid ?? it.bvid,
        title: it.title ?? '',
        pic: it.cover ?? '',
        owner: {
          mid: it.author_mid ?? 0,
          name: it.author_name ?? '',
          face: it.author_face ?? '',
        },
        viewAt: it.view_at ?? 0,
        progress: it.progress ?? -1,
        duration: it.duration ?? 0,
        business: it.business ?? 'archive',
      })),
    max: cursor.max ?? 0,
    viewAt: cursor.view_at ?? 0,
  };
}

/** 删除单条历史，kid 取自 getHistoryList 返回项。 */
export async function deleteHistoryItem(kid: string): Promise<void> {
  const biliJct = await ensureBiliJct();
  if (!biliJct) throw new Error('NO_CSRF');
  const body =
    `kid=${encodeURIComponent(kid)}` +
    `&jsonp=jsonp` +
    `&csrf=${encodeURIComponent(biliJct)}`;
  const res = await api.post('/x/v2/history/delete', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (res.data?.code !== 0) {
    throw new Error(res.data?.message || `code=${res.data?.code}`);
  }
}

/** 清空全部历史。 */
export async function clearHistory(): Promise<void> {
  const biliJct = await ensureBiliJct();
  if (!biliJct) throw new Error('NO_CSRF');
  const body = `jsonp=jsonp&csrf=${encodeURIComponent(biliJct)}`;
  const res = await api.post('/x/web-interface/history/clear', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (res.data?.code !== 0) {
    throw new Error(res.data?.message || `code=${res.data?.code}`);
  }
}

/** 自己的收藏夹列表。uid 可选，用于 list-all 为空时的 fallback。 */
export async function getFavFolders(uid?: number): Promise<FavFolder[]> {
  const parse = (d: any): FavFolder[] => {
    const list: any[] = d?.data?.list ?? [];
    return list.map((f: any) => ({
      id: f.id,
      title: f.title ?? '',
      mediaCount: f.media_count ?? 0,
      cover: f.cover ?? '',
    }));
  };
  // list-all 必须带 up_mid，否则 B 站返回 code -400「请求错误」
  const res = await api.get('/x/v3/fav/folder/created/list-all', {
    params: uid ? { up_mid: uid } : {},
  });
  if (res.data?.code !== 0) throw new Error(res.data?.message || `code=${res.data?.code}`);
  let folders = parse(res.data);
  if (folders.length === 0 && uid) {
    // list-all 为空时，用标准的用户收藏夹接口再试一次
    const res2 = await api.get('/x/v3/fav/folder/created/list', {
      params: { up_mid: uid, pn: 1, ps: 100 },
    });
    if (res2.data?.code !== 0) throw new Error(res2.data?.message || `code=${res2.data?.code}`);
    folders = parse(res2.data);
  }
  return folders;
}

/** 收藏夹内的视频。 */
export async function getFavResources(
  mediaId: number,
  pn = 1,
  ps = 20,
): Promise<{ items: FavResource[]; hasMore: boolean }> {
  const res = await api.get('/x/v3/fav/resource/list', {
    params: {
      media_id: mediaId, pn, ps,
      keyword: '', order: 'mtime', type: 0, tid: 0, platform: 'web',
    },
  });
  if (res.data?.code !== 0) return { items: [], hasMore: false };
  const data = res.data?.data ?? {};
  const medias: any[] = data.medias ?? [];
  return {
    items: medias
      .filter((m: any) => m.bvid)
      .map((m: any) => ({
        bvid: m.bvid,
        aid: m.id ?? 0,
        title: m.title ?? '',
        pic: m.cover ?? '',
        duration: m.duration ?? 0,
        owner: {
          mid: m.upper?.mid ?? 0,
          name: m.upper?.name ?? '',
          face: '',
        },
      })),
    hasMore: data.has_more ?? false,
  };
}

/** 指定关注分组下的 UP 主列表（tagid=0 为默认分组）。data 直接是数组。 */
export async function getTagFollowings(
  tagid: number,
  pn = 1,
  ps = 20,
): Promise<{ items: FollowUser[]; hasMore: boolean }> {
  const res = await api.get('/x/relation/tag', {
    params: { tagid, pn, ps },
  });
  if (res.data?.code !== 0) return { items: [], hasMore: false };
  const list: any[] = Array.isArray(res.data?.data) ? res.data.data : [];
  return {
    items: list.map((u: any) => ({
      mid: u.mid,
      uname: u.uname ?? '',
      face: u.face ?? '',
      sign: u.sign ?? '',
    })),
    hasMore: list.length >= ps,
  };
}

/** 关注的 UP 主列表。 */
export async function getFollowings(
  vmid: number,
  pn = 1,
  ps = 20,
): Promise<{ items: FollowUser[]; total: number }> {
  const res = await api.get('/x/relation/followings', {
    params: { vmid, pn, ps, order: 'desc', order_type: 'attention' },
  });
  if (res.data?.code !== 0) return { items: [], total: 0 };
  const data = res.data?.data ?? {};
  const list: any[] = data.list ?? [];
  return {
    items: list.map((u: any) => ({
      mid: u.mid,
      uname: u.uname ?? '',
      face: u.face ?? '',
      sign: u.sign ?? '',
    })),
    total: data.total ?? 0,
  };
}

/** form 表单 POST（写操作统一走这个，自动带 csrf） */
async function formPost(
  url: string,
  params: Record<string, string | number>,
  biliJct: string,
) {
  const body =
    Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&') + `&csrf=${encodeURIComponent(biliJct)}`;
  const res = await api.post(url, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const code = res.data?.code;
  if (code !== 0) throw new Error(res.data?.message || `code=${code}`);
  return res.data?.data;
}

/** 关注分组列表（需登录） */
export async function getFollowTags(): Promise<FollowTag[]> {
  const res = await api.get('/x/relation/tags');
  if (res.data?.code !== 0) throw new Error(res.data?.message || '获取分组失败');
  const list = res.data?.data;
  if (!Array.isArray(list)) return [];
  return list.map((t: any) => ({
    tagid: Number(t.tagid),
    name: String(t.name ?? ''),
    count: Number(t.count ?? 0),
  }));
}

/** 新建关注分组，返回 tagid（需登录） */
export async function createFollowTag(name: string): Promise<number> {
  const biliJct = await ensureBiliJct();
  if (!biliJct) throw new Error('NO_CSRF');
  const data = await formPost('/x/relation/tag', { tag: name.trim() }, biliJct);
  return Number(data?.tagid);
}

/** 把已关注用户移入指定分组（tagids 为空则不动，需登录） */
export async function moveFollowToTags(mid: number, tagids: number[]): Promise<void> {
  if (!tagids.length) return;
  const biliJct = await ensureBiliJct();
  if (!biliJct) throw new Error('NO_CSRF');
  await formPost(
    '/x/relation/tags/addUsers',
    { fids: mid, tagids: tagids.join(',') },
    biliJct,
  );
}

/** 排行榜。rid=0 全站，常用分区见 RANK_REGIONS（需与 VideoItem 字段兼容） */
export async function getRanking(rid = 0): Promise<VideoItem[]> {
  const res = await api.get('/x/web-interface/ranking/v2', {
    params: { rid, type: 'all' },
  });
  const list = res.data?.data?.list;
  return Array.isArray(list) ? (list as VideoItem[]) : [];
}

/** 排行榜分区分组 */
export const RANK_REGIONS: { rid: number; name: string }[] = [
  { rid: 0, name: '全站' },
  { rid: 1, name: '动画' },
  { rid: 3, name: '音乐' },
  { rid: 129, name: '舞蹈' },
  { rid: 4, name: '游戏' },
  { rid: 36, name: '知识' },
  { rid: 188, name: '数码' },
  { rid: 160, name: '生活' },
  { rid: 119, name: '鬼畜' },
  { rid: 211, name: '影视' },
];

/** 分区推荐流（官方当前分区接口，WBI 签名）。from_region 用新版分区 ID，display_id 翻页 */
export async function getRegionFeed(feedRid: number, displayId = 1): Promise<VideoItem[]> {
  const { imgKey, subKey } = await getWbiKeys();
  const signed = signWbi(
    { from_region: feedRid, display_id: displayId, request_cnt: 20, device: 'web', plat: 30, web_location: '333.40138' },
    imgKey,
    subKey,
  );
  const res = await api.get('/x/web-interface/region/feed/rcmd', { params: signed });
  const items: any[] = res.data?.data?.archives ?? [];
  if (items.length === 0 && feedRid === 1007 && displayId === 1) {
    // 鬼畜推荐流暂无数据，首屏回退到分区排行榜兜底
    return getRanking(119);
  }
  return items
    .filter(item => item.bvid && item.title)
    .map(item => ({
      ...item,
      pic: item.pic ?? item.cover,
      owner: item.owner ?? { mid: 0, name: item.author ?? '', face: '' },
    } as VideoItem));
}

/** 分区 tab 的分区分组（新版分区 ID；鬼畜 1007 暂无数据，已剔除） */
export const REGION_FEED_CHANNELS: { rid: number; name: string }[] = [
  { rid: 1005, name: '动画' },
  { rid: 1003, name: '音乐' },
  { rid: 1004, name: '舞蹈' },
  { rid: 1008, name: '游戏' },
  { rid: 1007, name: '鬼畜' },
  { rid: 1010, name: '知识' },
  { rid: 1012, name: '科技' },
  { rid: 1018, name: '运动' },
  { rid: 1013, name: '汽车' },
  { rid: 1020, name: '生活' },
  { rid: 1014, name: '时尚' },
  { rid: 1002, name: '娱乐' },
  { rid: 1001, name: '影视' },
  { rid: 1024, name: '动物' },
];

/** 动态流：关注的人的动态（需登录）。offset 翻页，首屏传空串 */
export async function getDynamicFeed(
  offset = '',
): Promise<{ items: DynamicItem[]; hasMore: boolean; offset: string }> {
  const res = await api.get('/x/polymer/web-dynamic/v1/feed/all', {
    params: { timezone_offset: -480, type: 'all', offset, features: 'itemOpusStyle' },
  });
  if (res.data?.code !== 0) throw new Error(res.data?.message || '获取动态失败');
  const data = res.data?.data ?? {};
  const raw: any[] = Array.isArray(data.items) ? data.items : [];
  const items: DynamicItem[] = [];
  for (const it of raw) {
    const author = it?.modules?.module_author ?? {};
    const dyn = it?.modules?.module_dynamic ?? {};
    const base = {
      id: String(it?.id_str ?? ''),
      author: {
        mid: Number(author.mid ?? 0),
        name: String(author.name ?? ''),
        face: String(author.face ?? ''),
        pubTime: Number(author.pub_ts ?? 0),
      },
    };
    const archive = dyn?.major?.archive;
    if (archive?.bvid) {
      items.push({
        ...base,
        type: 'av',
        bvid: String(archive.bvid),
        aid: Number(archive.aid ?? 0),
        title: String(archive.title ?? ''),
        cover: String(archive.cover ?? ''),
        duration: Number(archive.duration ?? 0),
        playCount: parseCount(archive.stat?.play),
        text: String(dyn?.desc?.text ?? ''),
      });
    } else {
      const text = String(dyn?.desc?.text ?? '').trim();
      if (!text) continue; // 纯转发/未知类型暂跳过
      items.push({ ...base, type: 'text', text });
    }
  }
  return { items, hasMore: !!data.has_more, offset: String(data.offset ?? '') };
}
