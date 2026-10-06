import * as FileSystem from 'expo-file-system/legacy';
import type { PlayUrlResponse, DashAudioItem } from '../services/types';

/**
 * 将 Bilibili DASH 响应写成 MPD 文件，返回 file:// URI 供 ExoPlayer 播放。
 * 选取 id === qn 的视频流（找不到则取第一条），带宽最高的音频流。
 */
export async function buildDashMpdUri(
  playData: PlayUrlResponse,
  qn: number,
  bvid?: string,
): Promise<string> {
  const xml = buildMpdXml(playData, qn);
  // 带 bvid 区分，避免不同视频在同一 qn 上复用同一文件名导致命中过期 MPD
  const suffix = bvid ? `${bvid}_${qn}` : String(qn);
  const path = `${FileSystem.cacheDirectory}bili_dash_${suffix}.mpd`;
  await FileSystem.writeAsStringAsync(path, xml, { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}

/** 删除指定视频的所有清晰度 MPD 缓存（详情页卸载时调用） */
export async function cleanupDashMpd(bvid: string): Promise<void> {
  if (!bvid || !FileSystem.cacheDirectory) return;
  try {
    const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
    const targets = files.filter(f => f.startsWith(`bili_dash_${bvid}_`) && f.endsWith('.mpd'));
    await Promise.all(
      targets.map(f =>
        FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${f}`, { idempotent: true }),
      ),
    );
  } catch {
    // 忽略，缓存清理失败不影响功能
  }
}

function isDolbyVision(codecs: string): boolean {
  return /^(dvhe|dvh1)/.test(codecs);
}

function buildMpdXml(playData: PlayUrlResponse, qn: number): string {
  const dash = playData.dash!;

  const video = dash.video.find(v => v.id === qn) ?? dash.video[0];

  // 优先使用杜比全景声音轨，回退到带宽最高的普通音轨
  const dolbyAudios = playData.dolby?.audio;
  const audio: DashAudioItem = (dolbyAudios && dolbyAudios.length > 0)
    ? dolbyAudios.reduce((best, a) => a.bandwidth > best.bandwidth ? a : best)
    : dash.audio.reduce((best, a) => a.bandwidth > best.bandwidth ? a : best);

  const dur = dash.duration;
  const vSeg = video.segment_base;
  const aSeg = audio.segment_base;

  const videoSegmentBase = vSeg
    ? `\n        <SegmentBase indexRange="${vSeg.index_range}"><Initialization range="${vSeg.initialization}"/></SegmentBase>`
    : '';
  const audioSegmentBase = aSeg
    ? `\n        <SegmentBase indexRange="${aSeg.index_range}"><Initialization range="${aSeg.initialization}"/></SegmentBase>`
    : '';

  const isDV = isDolbyVision(video.codecs);
  const dvProperty = isDV
    ? `\n      <SupplementalProperty schemeIdUri="tag:dolby.com,2016:dash:dolby_vision_profile:2014" value="${video.codecs}"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011,http://dashif.org/guidelines/dash-if-simple"
     type="static"
     mediaPresentationDuration="PT${dur}S">
  <Period duration="PT${dur}S">
    <AdaptationSet id="1" mimeType="${video.mimeType}" codecs="${video.codecs}" startWithSAP="1" subsegmentAlignment="true">${dvProperty}
      <Representation id="v1" bandwidth="${video.bandwidth}" width="${video.width}" height="${video.height}" frameRate="${video.frameRate}">
        <BaseURL>${escapeXml(video.baseUrl)}</BaseURL>${videoSegmentBase}
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="2" mimeType="${audio.mimeType}" codecs="${audio.codecs}" startWithSAP="1" subsegmentAlignment="true">
      <Representation id="a1" bandwidth="${audio.bandwidth}">
        <BaseURL>${escapeXml(audio.baseUrl)}</BaseURL>${audioSegmentBase}
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
