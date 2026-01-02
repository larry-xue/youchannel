import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "~/lib/utils";
import { getVideoByIdFn } from "~/lib/dashboard/data";
import { BottomPanel } from "./components/BottomPanel";
import { ChatSidebar } from "./components/ChatSidebar";
import { LearningTabs } from "./components/LearningTabs";
import { VideoPlayerCard } from "./components/VideoPlayerCard";
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
} from "./constants";
import { useLocalStorageState } from "./utils";

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

  const video = videoQuery.data;
  const isLoading = videoQuery.isLoading;
  const hasError = videoQuery.isError;
  const title = video?.title || "Learning Session";
  const youtubeId = video?.youtube_video_id;

  const clampedSidebarWidth = Math.max(sidebarWidth, SIDEBAR_MIN_WIDTH);
  const clampedBottomHeight = Math.max(bottomPanelHeight, BOTTOM_PANEL_MIN_HEIGHT);

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
    const nextWidth = Math.max(
      SIDEBAR_MIN_WIDTH,
      sidebarResizeState.current.startWidth + delta,
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
    const nextHeight = Math.max(
      BOTTOM_PANEL_MIN_HEIGHT,
      panelResizeState.current.startHeight + delta,
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

      <div className="grid gap-0" style={workspaceStyle}>
        <section className="grid min-h-0" style={contentStyle}>
          <VideoPlayerCard
            title={title}
            youtubeId={youtubeId}
            publishedAt={video?.published_at}
            isLoading={isLoading}
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

        <ChatSidebar
          isCollapsed={isSidebarCollapsed}
          onCollapsedChange={setIsSidebarCollapsed}
          className="min-h-0"
        />
      </div>
    </div>
  );
}
