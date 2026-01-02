import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, type CSSProperties } from "react";
import { getVideoByIdFn } from "~/lib/dashboard/data";
import { ChatSidebar } from "./components/ChatSidebar";
import { LearningHeader } from "./components/LearningHeader";
import { LearningTabs } from "./components/LearningTabs";
import { VideoPlayerCard } from "./components/VideoPlayerCard";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  STORAGE_KEYS,
} from "./constants";
import { clamp, useLocalStorageState } from "./utils";

export const Route = createFileRoute("/dashboard/learn/$videoId")({
  component: DashboardLearnVideo,
});

function DashboardLearnVideo() {
  const { videoId } = Route.useParams();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorageState(
    STORAGE_KEYS.sidebarCollapsed,
    false,
  );
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    STORAGE_KEYS.sidebarWidth,
    SIDEBAR_DEFAULT_WIDTH,
  );

  const videoQuery = useQuery({
    queryKey: ["video", videoId],
    queryFn: () => getVideoByIdFn({ data: { videoId } }),
  });

  const video = videoQuery.data;
  const isLoading = videoQuery.isLoading;
  const hasError = videoQuery.isError;
  const title = video?.title || "Learning Session";
  const youtubeId = video?.youtube_video_id;
  const clampedSidebarWidth = clamp(
    sidebarWidth,
    SIDEBAR_MIN_WIDTH,
    SIDEBAR_MAX_WIDTH,
  );

  useEffect(() => {
    if (sidebarWidth !== clampedSidebarWidth) {
      setSidebarWidth(clampedSidebarWidth);
    }
  }, [sidebarWidth, clampedSidebarWidth, setSidebarWidth]);

  const sidebarWidthValue = isSidebarCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : clampedSidebarWidth;
  const gridStyle = {
    "--sidebar-width": `${sidebarWidthValue}px`,
  } as CSSProperties;

  return (
    <div className="space-y-6">
      <LearningHeader title={title} />

      {hasError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Unable to load this video right now.
        </div>
      )}

      <div
        className="grid gap-6 lg:[grid-template-columns:minmax(0,1fr)_var(--sidebar-width)]"
        style={gridStyle}
      >
        <section className="space-y-6">
          <VideoPlayerCard
            title={title}
            youtubeId={youtubeId}
            publishedAt={video?.published_at}
            isLoading={isLoading}
          />
          <LearningTabs
            title={title}
            description={video?.description}
            publishedAt={video?.published_at}
          />
        </section>

        <ChatSidebar
          isCollapsed={isSidebarCollapsed}
          width={clampedSidebarWidth}
          onWidthChange={setSidebarWidth}
          onCollapsedChange={setIsSidebarCollapsed}
        />
      </div>
    </div>
  );
}
