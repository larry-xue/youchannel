import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { PLAYER_ASPECT_RATIO, PLAYER_MIN_HEIGHT } from "../constants";
import { clamp, isBrowser } from "../utils";

type YouTubePlayer = {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  loadVideoById?: (videoId: string) => void;
  cueVideoById?: (videoId: string) => void;
  setSize?: (width: number, height: number) => void;
  getIframe?: () => HTMLIFrameElement;
  destroy?: () => void;
};

type YouTubePlayerOptions = {
  videoId: string;
  width?: number;
  height?: number;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: () => void;
  };
};

type YouTubeWindow = typeof window & {
  YT?: {
    Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
  };
  onYouTubeIframeAPIReady?: () => void;
};

let youTubeApiPromise: Promise<void> | null = null;

const loadYouTubeApi = () => {
  if (!isBrowser) {
    return Promise.reject(new Error("YouTube API can only load in the browser."));
  }
  const win = window as YouTubeWindow;
  if (win.YT?.Player) {
    return Promise.resolve();
  }
  if (youTubeApiPromise) {
    return youTubeApiPromise;
  }

  youTubeApiPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    const previousReady = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      if (previousReady) {
        previousReady();
      }
      resolve();
    };

    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      youTubeApiPromise = null;
      reject(new Error("Failed to load the YouTube IFrame API."));
    };
    document.head.appendChild(script);
  });

  return youTubeApiPromise;
};

export type YouTubePlayerHandle = Pick<YouTubePlayer, "seekTo" | "playVideo">;

type VideoPlayerCardProps = {
  title: string;
  youtubeId?: string | null;
  publishedAt?: string | null;
  isLoading: boolean;
  className?: string;
  onPlayerReady?: (player: YouTubePlayerHandle) => void;
};

export function VideoPlayerCard({
  title,
  youtubeId,
  isLoading,
  className,
  onPlayerReady,
}: VideoPlayerCardProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const playerMountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [playerSize, setPlayerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!isBrowser) return;
    const container = stageRef.current;
    if (!container) return;
    const updateBounds = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      if (!containerWidth || !containerHeight) return;
      const maxWidth = containerWidth;
      const maxHeight = Math.max(PLAYER_MIN_HEIGHT, containerHeight);
      const heightFromWidth = maxWidth / PLAYER_ASPECT_RATIO;
      const widthFromHeight = maxHeight * PLAYER_ASPECT_RATIO;
      const nextHeight = heightFromWidth <= maxHeight ? heightFromWidth : maxHeight;
      const nextWidth = heightFromWidth <= maxHeight ? maxWidth : widthFromHeight;
      setPlayerSize({
        width: clamp(nextWidth, PLAYER_MIN_HEIGHT * PLAYER_ASPECT_RATIO, maxWidth),
        height: clamp(nextHeight, PLAYER_MIN_HEIGHT, maxHeight),
      });
    };

    updateBounds();
    let resizeObserver: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(updateBounds);
      resizeObserver.observe(container);
    }
    return () => {
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isBrowser || !youtubeId) return;
    if (playerRef.current) {
      if (playerSize.width && playerSize.height) {
        playerRef.current.setSize?.(playerSize.width, playerSize.height);
      }
      const iframe = playerRef.current.getIframe?.();
      if (iframe) {
        iframe.title = title;
      }
      return;
    }

    const mountNode = playerMountRef.current;
    if (!mountNode) return;

    let isCancelled = false;
    void loadYouTubeApi()
      .then(() => {
        if (isCancelled) return;
        const win = window as YouTubeWindow;
        if (!win.YT?.Player) return;
        const player = new win.YT.Player(mountNode, {
          videoId: youtubeId,
          width: playerSize.width || undefined,
          height: playerSize.height || undefined,
          playerVars: {
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              const iframe = player.getIframe?.();
              if (iframe) {
                iframe.title = title;
                iframe.allow =
                  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
                iframe.setAttribute("allowfullscreen", "");
              }
              onPlayerReady?.(player);
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [onPlayerReady, playerSize.height, playerSize.width, title, youtubeId]);

  useEffect(() => {
    if (!youtubeId || !playerRef.current?.cueVideoById) return;
    playerRef.current.cueVideoById(youtubeId);
  }, [youtubeId]);

  const playerStyle =
    playerSize.width && playerSize.height
      ? { width: playerSize.width, height: playerSize.height }
      : { width: "100%", aspectRatio: "16 / 9" };

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col", className)}>
      <div
        ref={stageRef}
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 pt-4"
      >
        <div
          className="relative overflow-hidden rounded-2xl bg-muted/30 mb-5"
          style={playerStyle}
        >
          {youtubeId ? (
            <div ref={playerMountRef} className="h-full w-full" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {isLoading ? "Loading video..." : "Video not available"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
