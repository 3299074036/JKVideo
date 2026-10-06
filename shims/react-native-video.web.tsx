/** Web shim for react-native-video - uses HTML5 <video> element */
import React from 'react';

interface VideoProps {
  source?: { uri?: string } | number;
  style?: React.CSSProperties;
  paused?: boolean;
  muted?: boolean;
  repeat?: boolean;
  onLoad?: (data: unknown) => void;
  onError?: (error: unknown) => void;
  onProgress?: (data: unknown) => void;
  onEnd?: () => void;
  resizeMode?: string;
  [key: string]: unknown;
}

const Video = React.forwardRef<HTMLVideoElement, VideoProps>(
  ({ source, style, paused, muted, repeat, onLoad, onError, onProgress, onEnd }, ref) => {
    const uri = typeof source === 'object' && source !== null ? (source as { uri?: string }).uri : undefined;
    return (
      <video
        ref={ref}
        src={uri}
        style={style as React.CSSProperties}
        autoPlay={!paused}
        muted={muted}
        loop={repeat}
        onLoadedData={onLoad ? () => onLoad({}) : undefined}
        onError={onError ? (e) => onError(e) : undefined}
        onTimeUpdate={onProgress ? (e) => {
          const t = e.currentTarget;
          onProgress({ currentTime: t.currentTime, seekableDuration: t.duration });
        } : undefined}
        onEnded={onEnd}
        playsInline
      />
    );
  }
);

export default Video;
