# HLS Streaming Service — Plan V1

Turborepo + pnpm monorepo for an HLS video streaming service: Express API, Next.js frontend, Redis queue, MinIO object storage, Postgres metadata, and an FFmpeg video worker. **The full application stack is hosted with Docker.**

---

## Goal

Upload video → enqueue FFmpeg job → produce HLS (multi-bitrate) → store in MinIO → play via Next.js.

---

## Target layout

```text
apps/
  api/          # Express: upload, jobs, video metadata, signed URLs
  web/          # Next.js: upload UI + HLS player
  worker/       # FFmpeg consumer (pulls Redis jobs)
  docs/         # optional; keep or drop later

packages/
  db/           # Prisma/Drizzle schema + client (Postgres)
  queue/        # BullMQ queues, job types, producers/consumers helpers
  storage/      # MinIO client (upload, download, signed URLs, buckets)
  shared/       # Zod schemas, video/job status enums, API DTOs
  ui/           # existing shared React UI
  typescript-config/
  eslint-config/

docs/
  plan_V1.md    # this plan

docker/
  api.Dockerfile
  web.Dockerfile
  worker.Dockerfile   # includes FFmpeg
```

**Why packages:** API and worker both need DB, queue, storage, and shared types. Put that in packages once; apps stay thin.

---

## Runtime architecture

```text
[web] --REST--> [api] --enqueue--> [Redis/BullMQ]
                                    |
                                 [worker]
                                    |
                    download source → FFmpeg HLS → upload segments
                                    |
                                 [MinIO]
                                    |
[web player] <--playlist/segments-- [api proxy or MinIO signed URLs]
```

| Service   | Role                                                                 |
|-----------|----------------------------------------------------------------------|
| **api**   | Create video, multipart/presigned upload, enqueue transcode, status  |
| **worker**| Consume jobs, run FFmpeg, write HLS to MinIO, update DB status       |
| **web**   | Upload form, job progress, HLS player                                |
| **Postgres** | Videos, jobs, renditions metadata                                 |
| **Redis** | BullMQ (and optional job progress pub/sub)                           |
| **MinIO** | Originals + HLS outputs                                              |

---

## Docker hosting

The application is deployed and run via Docker Compose (local and production-shaped environments).

### Services in Compose

| Service    | Image / build              | Notes                                      |
|------------|----------------------------|--------------------------------------------|
| `postgres` | `postgres:18`              | Already present                            |
| `minio`    | `minio/minio`              | Already present                            |
| `redis`    | `redis:7` (or newer)       | Add for BullMQ                             |
| `api`      | build `docker/api.Dockerfile`    | Express API                          |
| `worker`   | build `docker/worker.Dockerfile` | FFmpeg installed in image            |
| `web`      | build `docker/web.Dockerfile`    | Next.js (standalone output preferred)|

### Compose responsibilities

- **Infra:** Postgres, Redis, MinIO with named volumes
- **Apps:** `api`, `worker`, `web` built from monorepo Dockerfiles
- **Networking:** single Docker network; apps reach infra by service name (`postgres`, `redis`, `minio`)
- **Env:** shared `.env` / Compose `environment` for `DATABASE_URL`, `REDIS_URL`, MinIO endpoint/credentials, public URLs
- **Healthchecks:** Postgres/Redis ready before api/worker start; api health before web if needed
- **Worker image:** must include system FFmpeg (+ ffprobe); api/web do not

### Dev vs Docker-hosted

| Mode | Infra | Apps |
|------|--------|------|
| **Local dev** | Docker Compose (postgres, redis, minio) | `pnpm turbo dev` on host |
| **Full Docker** | Compose | api, worker, web also as containers |

Target for V1 delivery: **full stack runnable with `docker compose up`**.

### Dockerfile notes

- Use multi-stage builds (deps → build → runtime)
- pnpm workspace: copy root lockfile + relevant package manifests; build with turbo filters (`--filter=api`, etc.)
- `worker`: base image with FFmpeg (e.g. Debian/Ubuntu + `ffmpeg`, or a maintained FFmpeg-capable base)
- `web`: Next.js `output: "standalone"` for smaller runtime image
- Do not bake secrets into images; inject via Compose/env

### Suggested Compose ports (host)

| Port | Service        |
|------|----------------|
| 3000 | web            |
| 4000 | api            |
| 5432 | postgres       |
| 6379 | redis          |
| 9000 | MinIO API      |
| 9001 | MinIO console  |

---

## Storage layout (MinIO)

```text
bucket: videos
  originals/{videoId}/source.mp4
  hls/{videoId}/master.m3u8
  hls/{videoId}/360p/index.m3u8 + seg_*.ts
  hls/{videoId}/720p/...
  hls/{videoId}/1080p/...
```

Buckets to create on boot: `videos` (private). Serve via API signed URLs or short-lived URLs for `.m3u8` / `.ts`.

---

## Data model (minimal)

- **Video:** `id`, `title`, `status` (`uploading` \| `queued` \| `processing` \| `ready` \| `failed`), `originalKey`, `masterPlaylistKey`, `duration`, `error`, timestamps
- **Job:** `id`, `videoId`, `type` (`transcode`), `bullJobId`, `progress`, `status`, timestamps
- **Rendition** (optional): `videoId`, `height`, `bandwidth`, `playlistKey`

Statuses live in `@repo/shared` so API/worker/web stay aligned.

---

## Queue design (`packages/queue`)

- **Lib:** BullMQ on Redis
- **Queue name:** `video-transcode`
- **Job payload:** `{ videoId, inputKey, outputPrefix, profiles }`
- **Concurrency:** start at `1` per worker (FFmpeg is CPU-heavy); scale with more worker containers
- **Progress:** worker reports 0–100; API exposes status; web polls (SSE later)
- **Retries:** limited (e.g. 2) with backoff; failed jobs mark video `failed`

---

## Worker FFmpeg flow (`apps/worker`)

1. Claim job
2. Download original from MinIO to temp dir
3. Probe with `ffprobe` (duration, codecs)
4. Transcode adaptive HLS (e.g. 360 / 720 / 1080) with `ffmpeg` → local `hls/`
5. Upload tree to `hls/{videoId}/`
6. Set video `ready` + `masterPlaylistKey`
7. Cleanup temp files (always, even on failure)

Worker Docker image includes FFmpeg. API/web images do not.

---

## API surface (v1)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/videos` | Create video row + return upload strategy |
| `POST` | `/videos/:id/upload` | Direct upload *or* return MinIO presigned PUT |
| `POST` | `/videos/:id/transcode` | Enqueue job after upload complete |
| `GET` | `/videos/:id` | Metadata + status |
| `GET` | `/videos` | List |
| `GET` | `/videos/:id/playback` | Signed master playlist URL (or stream proxy) |

Prefer **presigned MinIO upload** so large files skip the API process.

---

## Docker Compose additions (from current)

Already present: Postgres, MinIO.

Add:

- **redis**
- **api**, **worker**, **web** (built services)
- Shared network + env wiring
- Optional: MinIO bucket init container/script on first boot

---

## Implementation phases

### Phase 0 — Monorepo scaffolding

- Add Redis to `docker-compose.yml`
- Scaffold `apps/worker`
- Create packages: `shared`, `db`, `storage`, `queue`
- Wire TypeScript + workspace deps; add `dev`/`build` for api + worker
- Root env example: `DATABASE_URL`, `REDIS_URL`, MinIO keys/endpoints
- Add `docker/*.Dockerfile` stubs and Compose service definitions for apps

### Phase 1 — Storage + DB

- MinIO client in `@repo/storage` (put/get/presign/list)
- Schema + migrations in `@repo/db`
- Bucket bootstrap script (runnable in Docker or as init)

### Phase 2 — Queue + API skeleton

- BullMQ producer in API, consumer skeleton in worker
- Create/upload/status endpoints
- Health checks (for Compose `healthcheck`)

### Phase 3 — FFmpeg pipeline

- Implement transcode → HLS (single profile first, then ABR)
- Progress + failure handling
- Temp disk hygiene (volume or ephemeral container disk)

### Phase 4 — Frontend

- Upload UI against API
- Status polling
- HLS player page when `ready`

### Phase 5 — Docker hardening + polish

- Production-ready multi-stage images
- `docker compose up` runs full stack end-to-end
- Auth, size/type validation, limits
- Scale workers via `docker compose up --scale worker=N`
- Observability (job logs); optional CDN in front of MinIO; SSE for progress

---

## Package responsibilities

| Package | Exports |
|---------|---------|
| `@repo/shared` | `VideoStatus`, Zod DTOs, job names/payloads |
| `@repo/db` | Prisma/Drizzle client, videos/jobs repos |
| `@repo/storage` | `getPresignedUploadUrl`, `downloadObject`, `uploadDir` |
| `@repo/queue` | `transcodeQueue`, `addTranscodeJob`, typed workers |

Apps import packages; packages never import apps.

---

## Tooling choices (defaults)

| Concern | Choice |
|---------|--------|
| Monorepo | pnpm + Turborepo (already) |
| Hosting | Docker Compose (infra + api + worker + web) |
| API | Express 5 (already) |
| ORM | Prisma or Drizzle (pick one; Prisma is simpler to start) |
| Queue | BullMQ + Redis |
| Object store | MinIO (S3 API) |
| Player | `hls.js` in Next |
| FFmpeg | system binary inside **worker** Docker image |

---

## Open decisions (lock before coding)

1. **ORM:** Prisma vs Drizzle
2. **Upload path:** multipart through API vs MinIO presigned only
3. **Playback:** proxy through API vs browser + MinIO signed URLs
4. **Keep `apps/docs`?** or delete to reduce noise
5. **HLS profiles:** one bitrate first, or full ABR from day one
6. **Compose files:** single `docker-compose.yml` vs `docker-compose.dev.yml` + `docker-compose.yml`

---

## Recommended first build order

1. Redis in Compose + `@repo/shared` + `@repo/storage` + `@repo/db`
2. Express: create video + presigned upload + enqueue
3. Worker: single-rendition HLS end-to-end (Docker image with FFmpeg)
4. Web: upload + play
5. Wire api/worker/web into Compose so `docker compose up` hosts the full app
