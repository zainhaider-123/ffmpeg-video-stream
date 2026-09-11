import { Client } from "minio";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { VIDEO_BUCKET } from "@repo/shared";

export type StorageConfig = {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket?: string;
  publicEndPoint?: string;
  publicPort?: number;
};

export function loadStorageConfigFromEnv(): StorageConfig {
  return {
    endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "minio",
    secretKey: process.env.MINIO_SECRET_KEY ?? "minio_password",
    bucket: process.env.MINIO_BUCKET ?? VIDEO_BUCKET,
    publicEndPoint: process.env.MINIO_PUBLIC_ENDPOINT ?? process.env.MINIO_ENDPOINT ?? "localhost",
    publicPort: Number(
      process.env.MINIO_PUBLIC_PORT ?? process.env.MINIO_PORT ?? 9000,
    ),
  };
}

export function createStorageClient(config: StorageConfig = loadStorageConfigFromEnv()) {
  const client = new Client({
    endPoint: config.endPoint,
    port: config.port,
    useSSL: config.useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });

  const publicClient =
    config.publicEndPoint &&
    (config.publicEndPoint !== config.endPoint ||
      config.publicPort !== config.port)
      ? new Client({
          endPoint: config.publicEndPoint,
          port: config.publicPort ?? config.port,
          useSSL: config.useSSL,
          accessKey: config.accessKey,
          secretKey: config.secretKey,
        })
      : client;

  const bucket = config.bucket ?? VIDEO_BUCKET;

  return {
    client,
    publicClient,
    bucket,

    async ensureBucket(): Promise<void> {
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        await client.makeBucket(bucket);
      }
    },

    async getPresignedUploadUrl(
      objectKey: string,
      expirySeconds = 60 * 60,
    ): Promise<string> {
      return publicClient.presignedPutObject(bucket, objectKey, expirySeconds);
    },

    async getPresignedGetUrl(
      objectKey: string,
      expirySeconds = 60 * 60,
    ): Promise<string> {
      return publicClient.presignedGetObject(bucket, objectKey, expirySeconds);
    },

    async downloadObject(objectKey: string, destPath: string): Promise<void> {
      await client.fGetObject(bucket, objectKey, destPath);
    },

    async uploadObject(
      objectKey: string,
      filePath: string,
      contentType?: string,
    ): Promise<void> {
      const meta = contentType ? { "Content-Type": contentType } : undefined;
      await client.fPutObject(bucket, objectKey, filePath, meta);
    },

    async uploadDir(localDir: string, keyPrefix: string): Promise<string[]> {
      const uploaded: string[] = [];

      async function walk(dir: string, prefix: string) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const objectKey = path.posix.join(prefix, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath, objectKey);
            continue;
          }
          const contentType = guessContentType(entry.name);
          await client.fPutObject(bucket, objectKey, fullPath, {
            "Content-Type": contentType,
          });
          uploaded.push(objectKey);
        }
      }

      await walk(localDir, keyPrefix.replace(/\/$/, ""));
      return uploaded;
    },

    async objectExists(objectKey: string): Promise<boolean> {
      try {
        await client.statObject(bucket, objectKey);
        return true;
      } catch {
        return false;
      }
    },

    async getObjectStream(objectKey: string) {
      return client.getObject(bucket, objectKey);
    },

    async putStream(
      objectKey: string,
      filePath: string,
      contentType?: string,
    ): Promise<void> {
      const fileStat = await stat(filePath);
      const stream = createReadStream(filePath);
      await client.putObject(bucket, objectKey, stream, fileStat.size, {
        "Content-Type": contentType ?? guessContentType(filePath),
      });
    },
  };
}

export type Storage = ReturnType<typeof createStorageClient>;

export function guessContentType(filename: string): string {
  if (filename.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filename.endsWith(".ts")) return "video/mp2t";
  if (filename.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}
