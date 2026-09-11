"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  createVideo,
  startTranscode,
  uploadFileToPresignedUrl,
} from "../lib/api";

export function UploadForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "creating" | "uploading" | "transcoding" | "done" | "error"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a video file first.");
      return;
    }

    setError(null);
    setProgress(0);

    try {
      setPhase("creating");
      const created = await createVideo(title.trim() || file.name);

      setPhase("uploading");
      await uploadFileToPresignedUrl(
        created.upload.url,
        file,
        created.upload.headers,
        setProgress,
      );

      setPhase("transcoding");
      await startTranscode(created.video.id);

      setPhase("done");
      router.push(`/videos/${created.video.id}`);
      router.refresh();
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  const busy = phase === "creating" || phase === "uploading" || phase === "transcoding";

  return (
    <form className="upload-form" onSubmit={onSubmit}>
      <label className="field">
        <span>Title</span>
        <input
          type="text"
          name="title"
          placeholder="My video"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          maxLength={200}
        />
      </label>

      <label className="field file-field">
        <span>Video file</span>
        <input
          type="file"
          accept="video/mp4,video/*,.mp4,.mov,.mkv,.webm"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <p className="file-meta">
            {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
          </p>
        ) : null}
      </label>

      {phase === "uploading" ? (
        <div className="progress" aria-live="polite">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <span>Uploading {progress}%</span>
        </div>
      ) : null}

      {phase === "creating" ? <p className="status-line">Creating video…</p> : null}
      {phase === "transcoding" ? (
        <p className="status-line">Upload complete — starting transcode…</p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}

      <button type="submit" className="primary-btn" disabled={busy || !file}>
        {busy ? "Working…" : "Upload & transcode"}
      </button>
    </form>
  );
}
