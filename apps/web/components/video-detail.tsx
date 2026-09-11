"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { VideoDto } from "@repo/shared";
import { getPlayback, getVideo } from "../lib/api";
import { VideoPlayer } from "./video-player";

const STATUS_LABEL: Record<VideoDto["status"], string> = {
  uploading: "Uploading",
  queued: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export function VideoDetail({
  initialVideo,
}: {
  initialVideo: VideoDto;
}) {
  const [video, setVideo] = useState(initialVideo);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const { video: next } = await getVideo(initialVideo.id);
        if (cancelled) return;
        setVideo(next);

        if (next.status === "ready") {
          const playback = await getPlayback(next.id);
          if (!cancelled) {
            setPlaylistUrl(playback.masterPlaylistUrl);
            setError(null);
          }
          return;
        }

        if (next.status === "failed") {
          setError(next.error ?? "Transcode failed");
          return;
        }

        timer = setTimeout(() => {
          void tick();
        }, 2000);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load video");
        }
      }
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [initialVideo.id]);

  return (
    <div className="detail">
      <Link href="/" className="back-link">
        ← Library
      </Link>

      <header className="detail-header">
        <div>
          <h1>{video.title}</h1>
          <p className="muted">ID {video.id}</p>
        </div>
        <span className={`badge status-${video.status}`}>
          {STATUS_LABEL[video.status]}
        </span>
      </header>

      {video.status !== "ready" && video.status !== "failed" ? (
        <div className="processing-panel" aria-live="polite">
          <div className="spinner" />
          <p>
            {video.status === "queued"
              ? "Waiting in the transcode queue…"
              : video.status === "processing"
                ? "FFmpeg is building HLS…"
                : "Preparing upload…"}
          </p>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      {playlistUrl ? (
        <div className="player-shell">
          <VideoPlayer src={playlistUrl} title={video.title} />
        </div>
      ) : null}

      {video.duration ? (
        <p className="muted">Duration {Math.round(video.duration)}s</p>
      ) : null}
    </div>
  );
}
