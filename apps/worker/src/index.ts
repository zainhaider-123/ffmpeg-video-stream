import "./env.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  prisma,
  updateVideoStatus,
  upsertRendition,
} from "@repo/db";
import { createRedisConnection, createTranscodeWorker } from "@repo/queue";
import {
  masterPlaylistKey,
  type TranscodeJobPayload,
  type TranscodeProfile,
} from "@repo/shared";
import { createStorageClient } from "@repo/storage";

const storage = createStorageClient();
const connection = createRedisConnection();
const tempRoot = process.env.TEMP_DIR ?? path.join(tmpdir(), "ffmpeg-video-stream");

async function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
  });
}

async function probeDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await runCommand("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const duration = Number.parseFloat(stdout.trim());
    return Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  }
}

async function transcodeProfile(
  inputPath: string,
  outputDir: string,
  profile: TranscodeProfile,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const playlistPath = path.join(outputDir, "index.m3u8");
  const segmentPattern = path.join(outputDir, "seg_%03d.ts");

  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `scale=-2:${profile.height}`,
    "-c:v",
    "h264",
    "-b:v",
    profile.videoBitrate,
    "-c:a",
    "aac",
    "-b:a",
    profile.audioBitrate,
    "-ac",
    "2",
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    segmentPattern,
    playlistPath,
  ]);
}

function buildMasterPlaylist(
  videoId: string,
  profiles: TranscodeProfile[],
): string {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const profile of profiles) {
    const bandwidth = estimateBandwidth(profile);
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=1280x${profile.height}`,
    );
    lines.push(`${profile.name}/index.m3u8`);
  }
  void videoId;
  return `${lines.join("\n")}\n`;
}

function estimateBandwidth(profile: TranscodeProfile): number {
  const videoKbps = Number.parseInt(profile.videoBitrate, 10);
  const audioKbps = Number.parseInt(profile.audioBitrate, 10);
  const totalKbps =
    (Number.isFinite(videoKbps) ? videoKbps : 2500) +
    (Number.isFinite(audioKbps) ? audioKbps : 128);
  return totalKbps * 1000;
}

async function processJob(
  payload: TranscodeJobPayload,
  onProgress: (progress: number) => Promise<void>,
) {
  await mkdir(tempRoot, { recursive: true });
  const workDir = await mkdtemp(path.join(tempRoot, `${payload.videoId}-`));

  try {
    await updateVideoStatus(payload.videoId, "processing", { error: null });
    await onProgress(5);

    const inputPath = path.join(workDir, "source.mp4");
    await storage.downloadObject(payload.inputKey, inputPath);
    await onProgress(20);

    const duration = await probeDuration(inputPath);
    await onProgress(25);

    const hlsDir = path.join(workDir, "hls");
    await mkdir(hlsDir, { recursive: true });

    const profileCount = payload.profiles.length;
    for (const [index, profile] of payload.profiles.entries()) {
      const profileDir = path.join(hlsDir, profile.name);
      await transcodeProfile(inputPath, profileDir, profile);
      const progress = 25 + Math.round(((index + 1) / profileCount) * 50);
      await onProgress(progress);

      await upsertRendition({
        videoId: payload.videoId,
        height: profile.height,
        bandwidth: estimateBandwidth(profile),
        playlistKey: `${payload.outputPrefix}/${profile.name}/index.m3u8`,
      });
    }

    const masterPath = path.join(hlsDir, "master.m3u8");
    await writeFile(
      masterPath,
      buildMasterPlaylist(payload.videoId, payload.profiles),
      "utf8",
    );
    await onProgress(80);

    await storage.uploadDir(hlsDir, payload.outputPrefix);
    await onProgress(95);

    const playlistKey = masterPlaylistKey(payload.videoId);
    await updateVideoStatus(payload.videoId, "ready", {
      masterPlaylistKey: playlistKey,
      duration: duration ?? undefined,
      error: null,
    });

    await prisma.job.updateMany({
      where: { videoId: payload.videoId, type: "transcode" },
      data: { status: "completed", progress: 100 },
    });

    await onProgress(100);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcode failed";
    await updateVideoStatus(payload.videoId, "failed", { error: message });
    await prisma.job.updateMany({
      where: { videoId: payload.videoId, type: "transcode" },
      data: { status: "failed" },
    });
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

const worker = createTranscodeWorker(
  async (job) => {
    console.log(`Processing job ${job.id} for video ${job.data.videoId}`);
    await prisma.job.updateMany({
      where: { videoId: job.data.videoId, type: "transcode" },
      data: { status: "active", bullJobId: String(job.id) },
    });

    await processJob(job.data, async (progress) => {
      await job.updateProgress(progress);
      await prisma.job.updateMany({
        where: { videoId: job.data.videoId, type: "transcode" },
        data: { progress },
      });
    });
  },
  { connection },
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Worker started, waiting for transcode jobs…");

async function shutdown() {
  console.log("Shutting down worker…");
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
