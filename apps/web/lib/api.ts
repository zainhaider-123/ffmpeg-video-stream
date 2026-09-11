import type { VideoDto } from "@repo/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export type CreateVideoResponse = {
  video: VideoDto;
  upload: {
    method: "PUT";
    url: string;
    objectKey: string;
    headers: Record<string, string>;
  };
};

export async function createVideo(title: string) {
  return request<CreateVideoResponse>("/videos", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function listVideos() {
  return request<{ videos: VideoDto[] }>("/videos");
}

export async function getVideo(id: string) {
  return request<{ video: VideoDto }>(`/videos/${id}`);
}

export async function startTranscode(id: string) {
  return request<{ video: VideoDto }>(`/videos/${id}/transcode`, {
    method: "POST",
  });
}

export async function getPlayback(id: string) {
  return request<{
    videoId: string;
    masterPlaylistUrl: string;
    expiresInSeconds: number | null;
  }>(`/videos/${id}/playback`);
}

export async function uploadFileToPresignedUrl(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void,
) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed (network error)"));
    xhr.send(file);
  });
}

export function getApiBaseUrl() {
  return API_URL;
}
