import { listVideos } from "../lib/api";
import { UploadForm } from "../components/upload-form";
import { VideoList } from "../components/video-list";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let videos: Awaited<ReturnType<typeof listVideos>>["videos"] = [];
  let loadError: string | null = null;

  try {
    const data = await listVideos();
    videos = data.videos;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load videos";
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Video pipeline</p>
        <h1>Streamforge</h1>
        <p className="lede">
          Drop a file, enqueue FFmpeg, and watch adaptive HLS when it&apos;s ready.
        </p>
      </section>

      <section className="panel">
        <h2>Upload</h2>
        <UploadForm />
      </section>

      <section className="panel">
        <h2>Library</h2>
        {loadError ? <p className="error">{loadError}</p> : <VideoList videos={videos} />}
      </section>
    </main>
  );
}
