import { notFound } from "next/navigation";
import { getVideo } from "../../../lib/api";
import { VideoDetail } from "../../../components/video-detail";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function VideoPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const { video } = await getVideo(id);
    return (
      <main className="page">
        <VideoDetail initialVideo={video} />
      </main>
    );
  } catch {
    notFound();
  }
}
