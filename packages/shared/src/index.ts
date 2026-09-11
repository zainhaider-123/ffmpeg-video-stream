import { z } from "zod";

export const VIDEO_STATUSES = [
  "uploading",
  "queued",
  "processing",
  "ready",
  "failed",
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const VideoStatusSchema = z.enum(VIDEO_STATUSES);

export const JOB_STATUSES = [
  "waiting",
  "active",
  "completed",
  "failed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JobStatusSchema = z.enum(JOB_STATUSES);

export const JOB_TYPES = ["transcode"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const TRANSCODE_QUEUE_NAME = "video-transcode";

export const VIDEO_BUCKET = "videos";

export const CreateVideoSchema = z.object({
  title: z.string().min(1).max(200),
});

export type CreateVideoInput = z.infer<typeof CreateVideoSchema>;

export const TranscodeProfileSchema = z.object({
  name: z.string(),
  height: z.number().int().positive(),
  videoBitrate: z.string(),
  audioBitrate: z.string().default("128k"),
});

export type TranscodeProfile = z.infer<typeof TranscodeProfileSchema>;

/** Single-rendition first (Phase 3 expands to ABR). */
export const DEFAULT_TRANSCODE_PROFILES: TranscodeProfile[] = [
  {
    name: "720p",
    height: 720,
    videoBitrate: "2500k",
    audioBitrate: "128k",
  },
];

export const TranscodeJobPayloadSchema = z.object({
  videoId: z.string().uuid(),
  inputKey: z.string().min(1),
  outputPrefix: z.string().min(1),
  profiles: z.array(TranscodeProfileSchema).min(1),
});

export type TranscodeJobPayload = z.infer<typeof TranscodeJobPayloadSchema>;

export const VideoDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: VideoStatusSchema,
  originalKey: z.string().nullable(),
  masterPlaylistKey: z.string().nullable(),
  duration: z.number().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type VideoDto = z.infer<typeof VideoDtoSchema>;

export function originalObjectKey(videoId: string): string {
  return `originals/${videoId}/source.mp4`;
}

export function hlsOutputPrefix(videoId: string): string {
  return `hls/${videoId}`;
}

export function masterPlaylistKey(videoId: string): string {
  return `hls/${videoId}/master.m3u8`;
}
