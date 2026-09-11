import "../env.js";
import { Router } from "express";
import {
  createJob,
  createVideo,
  getVideoById,
  listVideos,
  toVideoDto,
  updateJob,
  updateVideoStatus,
} from "@repo/db";
import {
  CreateVideoSchema,
  DEFAULT_TRANSCODE_PROFILES,
  hlsOutputPrefix,
  originalObjectKey,
} from "@repo/shared";
import { addTranscodeJob, createRedisConnection, createTranscodeQueue } from "@repo/queue";
import { createStorageClient } from "@repo/storage";

export const videosRouter = Router();

const storage = createStorageClient();
const queue = createTranscodeQueue(createRedisConnection());

videosRouter.post("/", async (req, res, next) => {
  try {
    const body = CreateVideoSchema.parse(req.body);
    const video = await createVideo(body.title);
    const objectKey = originalObjectKey(video.id);
    const uploadUrl = await storage.getPresignedUploadUrl(objectKey);

    await updateVideoStatus(video.id, "uploading", { originalKey: objectKey });

    const updated = await getVideoById(video.id);
    res.status(201).json({
      video: toVideoDto(updated!),
      upload: {
        method: "PUT",
        url: uploadUrl,
        objectKey,
        headers: {
          "Content-Type": "video/mp4",
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

videosRouter.post("/:id/upload", async (req, res, next) => {
  try {
    const video = await getVideoById(req.params.id!);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const objectKey = video.originalKey ?? originalObjectKey(video.id);
    const uploadUrl = await storage.getPresignedUploadUrl(objectKey);

    if (!video.originalKey) {
      await updateVideoStatus(video.id, "uploading", { originalKey: objectKey });
    }

    res.json({
      method: "PUT",
      url: uploadUrl,
      objectKey,
      headers: {
        "Content-Type": "video/mp4",
      },
    });
  } catch (err) {
    next(err);
  }
});

videosRouter.post("/:id/transcode", async (req, res, next) => {
  try {
    const video = await getVideoById(req.params.id!);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const inputKey = video.originalKey ?? originalObjectKey(video.id);
    const exists = await storage.objectExists(inputKey);
    if (!exists) {
      res.status(400).json({
        error: "Original upload not found in storage. Upload the file first.",
      });
      return;
    }

    const job = await createJob(video.id);
    const bullJob = await addTranscodeJob(queue, {
      videoId: video.id,
      inputKey,
      outputPrefix: hlsOutputPrefix(video.id),
      profiles: DEFAULT_TRANSCODE_PROFILES,
    });

    await updateJob(job.id, {
      bullJobId: String(bullJob.id),
      status: "waiting",
    });
    await updateVideoStatus(video.id, "queued", { originalKey: inputKey, error: null });

    const updated = await getVideoById(video.id);
    res.status(202).json({
      video: toVideoDto(updated!),
      job: {
        id: job.id,
        bullJobId: bullJob.id,
      },
    });
  } catch (err) {
    next(err);
  }
});

videosRouter.get("/", async (_req, res, next) => {
  try {
    const videos = await listVideos();
    res.json({ videos: videos.map(toVideoDto) });
  } catch (err) {
    next(err);
  }
});

videosRouter.get("/:id", async (req, res, next) => {
  try {
    const video = await getVideoById(req.params.id!);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.json({ video: toVideoDto(video) });
  } catch (err) {
    next(err);
  }
});

videosRouter.get("/:id/playback", async (req, res, next) => {
  try {
    const video = await getVideoById(req.params.id!);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    if (video.status !== "ready" || !video.masterPlaylistKey) {
      res.status(409).json({
        error: "Video is not ready for playback",
        status: video.status,
      });
      return;
    }

    const baseUrl = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
    res.json({
      videoId: video.id,
      masterPlaylistUrl: `${baseUrl}/videos/${video.id}/hls/master.m3u8`,
      expiresInSeconds: null,
    });
  } catch (err) {
    next(err);
  }
});

videosRouter.get("/:id/hls/*path", async (req, res, next) => {
  try {
    const video = await getVideoById(req.params.id!);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    if (video.status !== "ready") {
      res.status(409).json({ error: "Video is not ready for playback" });
      return;
    }

    const rawPath = req.params.path;
    const relativePath = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath ?? "");
    if (!relativePath || relativePath.includes("..")) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }

    const objectKey = `${hlsOutputPrefix(video.id)}/${relativePath}`;
    const exists = await storage.objectExists(objectKey);
    if (!exists) {
      res.status(404).json({ error: "Segment not found" });
      return;
    }

    const stream = await storage.getObjectStream(objectKey);
    res.setHeader("Content-Type", guessHlsContentType(relativePath));
    res.setHeader("Cache-Control", "public, max-age=60");
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

function guessHlsContentType(filename: string): string {
  if (filename.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filename.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}