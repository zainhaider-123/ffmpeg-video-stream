"use client";

import {
  isHLSProvider,
  MediaPlayer,
  MediaProvider,
  type MediaProviderAdapter,
} from "@vidstack/react";
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from "@vidstack/react/player/layouts/default";
import HLS from "hls.js";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

type VideoPlayerProps = {
  src: string;
  title: string;
};

export function VideoPlayer({ src, title }: VideoPlayerProps) {
  function onProviderChange(provider: MediaProviderAdapter | null) {
    if (isHLSProvider(provider)) {
      provider.library = HLS;
    }
  }

  return (
    <MediaPlayer
      className="player"
      title={title}
      src={{ src, type: "application/x-mpegurl" }}
      onProviderChange={onProviderChange}
      playsInline
      streamType="on-demand"
      crossOrigin
    >
      <MediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
  );
}
