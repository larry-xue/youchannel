import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { getVideoAnalysesFn, getVideoByIdFn } from "~/lib/dashboard/data";
import type { VideoAnalysis } from "~/schema";
import { BottomPanel } from "~/lib/dashboard/learn/components/BottomPanel";
import { ChatSidebar } from "~/lib/dashboard/learn/components/ChatSidebar";
import { LearningTabs } from "~/lib/dashboard/learn/components/LearningTabs";
import {
  VideoPlayerCard,
  type YouTubePlayerHandle,
} from "~/lib/dashboard/learn/components/VideoPlayerCard";
import { getVideoPublishedAt } from "~/lib/dashboard/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
} from "~/lib/components/ui/resizable";

// Panel size constants (percentage based)
const SIDEBAR_DEFAULT_SIZE = 25;
const SIDEBAR_MIN_SIZE = 15;
const SIDEBAR_COLLAPSED_SIZE = 0;
const BOTTOM_PANEL_DEFAULT_SIZE = 35;
const BOTTOM_PANEL_MIN_SIZE = 20;

export const Route = createFileRoute("/dashboard/learn/$videoId")({
  component: DashboardLearnVideo,
});

function DashboardLearnVideo() {
  const { videoId } = Route.useParams();
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const bottomPanelRef = usePanelRef();
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useState(false);

  const videoQuery = useQuery({
    queryKey: ["video", videoId],
    queryFn: () => getVideoByIdFn({ data: { videoId } }),
  });
  const analysesQuery = useQuery({
    queryKey: ["video-analyses", videoId],
    queryFn: () => getVideoAnalysesFn({ data: { videoId } }),
  });

  const video = videoQuery.data;
  const analyses = (analysesQuery.data || []) as VideoAnalysis[];
  const latestAnalysis = analyses[0];
  const isLoading = videoQuery.isLoading;
  const hasError = videoQuery.isError;
  const title = video?.title || "Learning Session";
  const youtubeId = video?.youtube_video_id;
  const publishedAt = getVideoPublishedAt(video);
  const chatAnalysisText = latestAnalysis?.analysis_text ?? "";
  const chatId = latestAnalysis?.id
    ? `analysis-${latestAnalysis.id}`
    : `analysis-pending-${videoId}`;

  const handlePlayerReady = (player: YouTubePlayerHandle) => {
    playerRef.current = player;
    if (pendingSeekRef.current !== null) {
      const target = pendingSeekRef.current;
      pendingSeekRef.current = null;
      player.seekTo(target, true);
      player.playVideo?.();
    }
  };

  const handleSeekToTimestamp = (seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const target = Math.max(0, seconds);
    const player = playerRef.current;
    if (player) {
      player.seekTo(target, true);
      player.playVideo?.();
    } else {
      pendingSeekRef.current = target;
    }
  };

  const handleToggleBottomPanel = () => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  };

  return (
    <div className="space-y-6">
      {hasError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Unable to load this video right now.
        </div>
      )}

      <ResizablePanelGroup
        direction="horizontal"
        className="h-[84vh] min-h-[600px] rounded-lg border"
      >
        {/* Main content area */}
        <ResizablePanel defaultSize={100 - SIDEBAR_DEFAULT_SIZE} minSize={50}>
          <ResizablePanelGroup direction="vertical">
            {/* Video player */}
            <ResizablePanel
              defaultSize={100 - BOTTOM_PANEL_DEFAULT_SIZE}
              minSize={30}
            >
              <VideoPlayerCard
                title={title}
                youtubeId={youtubeId}
                publishedAt={publishedAt}
                isLoading={isLoading}
                onPlayerReady={handlePlayerReady}
                className="h-full"
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom panel */}
            <ResizablePanel
              panelRef={bottomPanelRef}
              defaultSize={BOTTOM_PANEL_DEFAULT_SIZE}
              minSize={BOTTOM_PANEL_MIN_SIZE}
              collapsible
              collapsedSize={SIDEBAR_COLLAPSED_SIZE}
              onResize={(size) => {
                setIsBottomPanelCollapsed(size.asPercentage <= SIDEBAR_COLLAPSED_SIZE);
              }}
            >
              <BottomPanel
                isCollapsed={isBottomPanelCollapsed}
                onToggle={handleToggleBottomPanel}
                className="h-full"
              >
                <LearningTabs
                  title={title}
                  description={video?.description}
                  publishedAt={publishedAt}
                  analysisText={latestAnalysis?.analysis_text}
                  onSeekToTimestamp={handleSeekToTimestamp}
                />
              </BottomPanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Chat sidebar */}
        <ResizablePanel
          defaultSize={SIDEBAR_DEFAULT_SIZE}
          minSize={SIDEBAR_MIN_SIZE}
          collapsible
          collapsedSize={SIDEBAR_COLLAPSED_SIZE}
        >
          <ChatSidebar
            key={chatId}
            className="h-full"
            analysisText={chatAnalysisText}
            chatId={chatId}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
