import { Queue, Worker, type JobsOptions, type Processor } from "bullmq";
import { Redis } from "ioredis";
import {
  TRANSCODE_QUEUE_NAME,
  type TranscodeJobPayload,
} from "@repo/shared";

export function createRedisConnection(redisUrl = process.env.REDIS_URL) {
  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });
}

export function createTranscodeQueue(
  connection: Redis = createRedisConnection(),
) {
  return new Queue<TranscodeJobPayload>(TRANSCODE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}

export async function addTranscodeJob(
  queue: Queue<TranscodeJobPayload>,
  payload: TranscodeJobPayload,
  opts?: JobsOptions,
) {
  return queue.add("transcode", payload, {
    jobId: `transcode-${payload.videoId}`,
    ...opts,
  });
}

export function createTranscodeWorker(
  processor: Processor<TranscodeJobPayload>,
  options: {
    connection?: Redis;
    concurrency?: number;
  } = {},
) {
  const connection = options.connection ?? createRedisConnection();
  return new Worker<TranscodeJobPayload>(TRANSCODE_QUEUE_NAME, processor, {
    connection,
    concurrency: options.concurrency ?? Number(process.env.WORKER_CONCURRENCY ?? 1),
  });
}

export { Queue, Worker, TRANSCODE_QUEUE_NAME };
export type { TranscodeJobPayload };
