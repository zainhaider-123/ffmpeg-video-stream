import Link from "next/link";
import type { VideoDto } from "@repo/shared";

const STATUS_LABEL: Record<VideoDto["status"], string> = {
  uploading: "Uploading",
  queued: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export function VideoList({ videos }: { videos: VideoDto[] }) {
  if (videos.length === 0) {
    return <p className="empty">No videos yet. Upload one to get started.</p>;
  }

  return (
    <ul className="video-list">
      {videos.map((video) => (
        <li key={video.id}>
          <Link href={`/videos/${video.id}`} className="video-row">
            <div>
              <strong>{video.title}</strong>
              <span className="muted">
                {new Date(video.createdAt).toLocaleString()}
              </span>
            </div>
            <span className={`badge status-${video.status}`}>
              {STATUS_LABEL[video.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
