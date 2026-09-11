import { PrismaClient, type Video, type Job, type Rendition } from "@prisma/client";
import type { VideoDto, VideoStatus, JobStatus } from "@repo/shared";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { Video, Job, Rendition, PrismaClient };
export { Prisma } from "@prisma/client";

export function toVideoDto(video: Video): VideoDto {
  return {
    id: video.id,
    title: video.title,
    status: video.status as VideoStatus,
    originalKey: video.originalKey,
    masterPlaylistKey: video.masterPlaylistKey,
    duration: video.duration,
    error: video.error,
    createdAt: video.createdAt.toISOString(),
    updatedAt: video.updatedAt.toISOString(),
  };
}

export async function createVideo(title: string) {
  return prisma.video.create({
    data: { title, status: "uploading" },
  });
}

export async function getVideoById(id: string) {
  return prisma.video.findUnique({ where: { id } });
}

export async function listVideos() {
  return prisma.video.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function updateVideoStatus(
  id: string,
  status: VideoStatus,
  data: {
    originalKey?: string;
    masterPlaylistKey?: string;
    duration?: number;
    error?: string | null;
  } = {},
) {
  return prisma.video.update({
    where: { id },
    data: {
      status,
      ...data,
    },
  });
}

export async function createJob(videoId: string) {
  return prisma.job.create({
    data: {
      videoId,
      type: "transcode",
      status: "waiting",
      progress: 0,
    },
  });
}

export async function updateJob(
  id: string,
  data: {
    bullJobId?: string;
    progress?: number;
    status?: JobStatus;
  },
) {
  return prisma.job.update({
    where: { id },
    data,
  });
}

export async function upsertRendition(data: {
  videoId: string;
  height: number;
  bandwidth?: number;
  playlistKey: string;
}) {
  return prisma.rendition.upsert({
    where: {
      videoId_height: {
        videoId: data.videoId,
        height: data.height,
      },
    },
    create: data,
    update: {
      bandwidth: data.bandwidth,
      playlistKey: data.playlistKey,
    },
  });
}
