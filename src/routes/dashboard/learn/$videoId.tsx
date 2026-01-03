import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "~/lib/utils";
import { getVideoAnalysesFn, getVideoByIdFn } from "~/lib/dashboard/data";
import type { VideoAnalysis } from "~/schema";
import { BottomPanel } from "~/lib/dashboard/learn/components/BottomPanel";
import { ChatSidebar } from "~/lib/dashboard/learn/components/ChatSidebar";
import { LearningTabs } from "~/lib/dashboard/learn/components/LearningTabs";
import {
  VideoPlayerCard,
  type YouTubePlayerHandle,
} from "~/lib/dashboard/learn/components/VideoPlayerCard";
import {
  BOTTOM_PANEL_COLLAPSED_HEIGHT,
  BOTTOM_PANEL_DEFAULT_HEIGHT,
  BOTTOM_PANEL_MIN_HEIGHT,
  CONTENT_MIN_HEIGHT,
  CONTENT_MIN_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SPLITTER_SIZE,
  STORAGE_KEYS,
  WORKSPACE_MIN_HEIGHT,
} from "~/lib/dashboard/learn/constants";
import { useLocalStorageState } from "~/lib/dashboard/learn/utils";

export const Route = createFileRoute("/dashboard/learn/$videoId")({
  component: DashboardLearnVideo,
});

function DashboardLearnVideo() {
  const { videoId } = Route.useParams();
  const sidebarResizeState = useRef({
    startX: 0,
    startWidth: SIDEBAR_DEFAULT_WIDTH,
    isResizing: false,
  });
  const panelResizeState = useRef({
    startY: 0,
    startHeight: BOTTOM_PANEL_DEFAULT_HEIGHT,
    isResizing: false,
  });
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorageState(
    STORAGE_KEYS.sidebarCollapsed,
    false,
  );
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    STORAGE_KEYS.sidebarWidth,
    SIDEBAR_DEFAULT_WIDTH,
  );
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useLocalStorageState(
    STORAGE_KEYS.bottomPanelCollapsed,
    false,
  );
  const [bottomPanelHeight, setBottomPanelHeight] = useLocalStorageState(
    STORAGE_KEYS.bottomPanelHeight,
    BOTTOM_PANEL_DEFAULT_HEIGHT,
  );

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

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;

    const updateSize = () => {
      setWorkspaceSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const clampDimension = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const availableSidebarWidth = workspaceSize.width
    ? Math.max(0, workspaceSize.width - CONTENT_MIN_WIDTH - SPLITTER_SIZE)
    : Number.POSITIVE_INFINITY;
  const availableBottomHeight = workspaceSize.height
    ? Math.max(0, workspaceSize.height - CONTENT_MIN_HEIGHT - SPLITTER_SIZE)
    : Number.POSITIVE_INFINITY;

  const sidebarMinWidth = Math.min(SIDEBAR_MIN_WIDTH, availableSidebarWidth);
  const bottomPanelMinHeight = Math.min(BOTTOM_PANEL_MIN_HEIGHT, availableBottomHeight);

  const clampedSidebarWidth = clampDimension(
    sidebarWidth,
    sidebarMinWidth,
    availableSidebarWidth,
  );
  const clampedBottomHeight = clampDimension(
    bottomPanelHeight,
    bottomPanelMinHeight,
    availableBottomHeight,
  );

  useEffect(() => {
    if (sidebarWidth !== clampedSidebarWidth) {
      setSidebarWidth(clampedSidebarWidth);
    }
  }, [sidebarWidth, clampedSidebarWidth, setSidebarWidth]);

  useEffect(() => {
    if (bottomPanelHeight !== clampedBottomHeight) {
      setBottomPanelHeight(clampedBottomHeight);
    }
  }, [bottomPanelHeight, clampedBottomHeight, setBottomPanelHeight]);

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

  const sidebarWidthValue = isSidebarCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : clampedSidebarWidth;
  const bottomPanelHeightValue = isBottomPanelCollapsed
    ? BOTTOM_PANEL_COLLAPSED_HEIGHT
    : clampedBottomHeight;

  const workspaceStyle = {
    "--sidebar-width": `${sidebarWidthValue}px`,
    "--splitter-size": `${SPLITTER_SIZE}px`,
    "--bottom-panel-height": `${bottomPanelHeightValue}px`,
    height: "84vh",
    minHeight: WORKSPACE_MIN_HEIGHT,
    gridTemplateColumns: `minmax(${CONTENT_MIN_WIDTH}px, 1fr) var(--splitter-size) var(--sidebar-width)`,
  } as CSSProperties;

  const contentStyle = {
    gridTemplateRows: `minmax(${CONTENT_MIN_HEIGHT}px, 1fr) var(--splitter-size) var(--bottom-panel-height)`,
  } as CSSProperties;

  const handleSidebarResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isSidebarCollapsed) {
      setIsSidebarCollapsed(false);
    }
    sidebarResizeState.current = {
      startX: event.clientX,
      startWidth: clampedSidebarWidth,
      isResizing: true,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSidebarResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sidebarResizeState.current.isResizing) return;
    const delta = sidebarResizeState.current.startX - event.clientX;
    const nextWidth = clampDimension(
      sidebarResizeState.current.startWidth + delta,
      sidebarMinWidth,
      availableSidebarWidth,
    );
    setSidebarWidth(nextWidth);
  };

  const handleSidebarResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sidebarResizeState.current.isResizing) return;
    sidebarResizeState.current.isResizing = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePanelResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isBottomPanelCollapsed) {
      setIsBottomPanelCollapsed(false);
    }
    panelResizeState.current = {
      startY: event.clientY,
      startHeight: clampedBottomHeight,
      isResizing: true,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePanelResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panelResizeState.current.isResizing) return;
    const delta = panelResizeState.current.startY - event.clientY;
    const nextHeight = clampDimension(
      panelResizeState.current.startHeight + delta,
      bottomPanelMinHeight,
      availableBottomHeight,
    );
    setBottomPanelHeight(nextHeight);
  };

  const handlePanelResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panelResizeState.current.isResizing) return;
    panelResizeState.current.isResizing = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="space-y-6">
      {hasError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Unable to load this video right now.
        </div>
      )}

      <div ref={workspaceRef} className="grid gap-0" style={workspaceStyle}>
        <section className="grid min-h-0" style={contentStyle}>
          <VideoPlayerCard
            title={title}
            youtubeId={youtubeId}
            publishedAt={video?.published_at}
            isLoading={isLoading}
            onPlayerReady={handlePlayerReady}
            className="min-h-0"
          />

          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize bottom panel"
            title="Drag to resize bottom panel"
            onPointerDown={handlePanelResizeStart}
            onPointerMove={handlePanelResizeMove}
            onPointerUp={handlePanelResizeEnd}
            onPointerCancel={handlePanelResizeEnd}
            className={cn(
              "flex cursor-row-resize select-none items-center justify-center border-y border-border/60 bg-muted/40 text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70 touch-none",
              isBottomPanelCollapsed && "opacity-80",
            )}
          >
            <span className="h-1 w-16 rounded-full bg-border" />
          </div>

          <BottomPanel
            isCollapsed={isBottomPanelCollapsed}
            onToggle={() => setIsBottomPanelCollapsed((prev) => !prev)}
            className="min-h-0"
          >
            <LearningTabs
              title={title}
              description={video?.description}
              publishedAt={video?.published_at}
              analysisText={latestAnalysis?.analysis_text}
              onSeekToTimestamp={handleSeekToTimestamp}
            />
          </BottomPanel>
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize sidebar"
          onPointerDown={handleSidebarResizeStart}
          onPointerMove={handleSidebarResizeMove}
          onPointerUp={handleSidebarResizeEnd}
          onPointerCancel={handleSidebarResizeEnd}
          className={cn(
            "flex cursor-col-resize select-none items-center justify-center border-x border-border/60 bg-muted/40 touch-none",
            isSidebarCollapsed && "opacity-80",
          )}
        >
          <span className="h-16 w-1 rounded-full bg-border" />
        </div>

        <ChatSidebar className="min-h-0" />
      </div>
    </div>
  );
}
