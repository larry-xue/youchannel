import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
} from "~/lib/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/lib/components/ui/tabs";
import { getVideoAnalysesFn, getVideoByIdFn } from "~/lib/dashboard/data";
import { BottomPanel } from "~/lib/dashboard/learn/components/BottomPanel";
import { ChatSidebar } from "~/lib/dashboard/learn/components/ChatSidebar";
import { LearningTabs } from "~/lib/dashboard/learn/components/LearningTabs";
import {
  VideoPlayerCard,
  type YouTubePlayerHandle,
} from "~/lib/dashboard/learn/components/VideoPlayerCard";
import { getVideoPublishedAt } from "~/lib/dashboard/utils";
import * as m from "~/paraglide/messages";
import type { VideoAnalysis } from "~/schema";

// Panel size constants (percentage based)
const SIDEBAR_DEFAULT_SIZE = 25;
const SIDEBAR_MIN_SIZE = 15;
const SIDEBAR_COLLAPSED_SIZE = 0;
const BOTTOM_PANEL_DEFAULT_SIZE = 35;
const BOTTOM_PANEL_MIN_SIZE = 20;

export const Route = createFileRoute("/_layout/learn/$videoId")({
  component: DashboardLearnVideo,
});

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768); // md breakpoint
    checkMobile(); // Check immediately
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

function DashboardLearnVideo() {
  const { videoId } = Route.useParams();
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const bottomPanelRef = usePanelRef();
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useState(false);
  const isMobile = useIsMobile();

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
    console.log("seconds = ", seconds);
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

  if (hasError) {
    return (
      <div className="rounded-3xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {m.learn_error_load()}
      </div>
    );
  }

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-(--spacing(20)))] space-y-4">
        {/* Fixed Video Section */}
        <div className="w-full shrink-0">
          <div className="aspect-video w-full overflow-hidden rounded-3xl border border-border-soft bg-black/5 shadow-lll-sm">
            <VideoPlayerCard
              title={title}
              youtubeId={youtubeId}
              publishedAt={publishedAt}
              isLoading={isLoading}
              onPlayerReady={handlePlayerReady}
              className="h-full w-full"
            />
          </div>
        </div>

        {/* Tabs for Content */}
        <div className="min-h-0 flex-1">
          <Tabs defaultValue="learn" className="flex h-full flex-col">
            <TabsList className="grid w-full grid-cols-2 mb-2 p-1 bg-surface-2 rounded-full">
              <TabsTrigger value="learn" className="rounded-full">
                Learn
              </TabsTrigger>
              <TabsTrigger value="chat" className="rounded-full">
                Chat
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="learn"
              className="mt-0 min-h-0 flex-1 overflow-hidden rounded-3xl border border-border-soft bg-card shadow-lll-sm"
            >
              <LearningTabs
                title={title}
                description={video?.description}
                publishedAt={publishedAt}
                analysisText={latestAnalysis?.analysis_text}
                onSeekToTimestamp={handleSeekToTimestamp}
              />
            </TabsContent>

            <TabsContent
              value="chat"
              className="mt-0 min-h-0 flex-1 overflow-hidden rounded-3xl border border-border-soft bg-card shadow-lll-sm"
            >
              <ChatSidebar
                className="h-full"
                analysisText={chatAnalysisText}
                onSeekToTimestamp={handleSeekToTimestamp}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="space-y-6 h-[84vh] min-h-[600px]">
      <ResizablePanelGroup
        direction="horizontal"
        className="rounded-3xl border border-border-soft shadow-lll-sm bg-card overflow-hidden"
      >
        {/* Main content area */}
        <ResizablePanel defaultSize={100 - SIDEBAR_DEFAULT_SIZE} minSize={50}>
          <ResizablePanelGroup direction="vertical">
            {/* Video player */}
            <ResizablePanel defaultSize={100 - BOTTOM_PANEL_DEFAULT_SIZE} minSize={30}>
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
            className="h-full"
            analysisText={chatAnalysisText}
            onSeekToTimestamp={handleSeekToTimestamp}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
