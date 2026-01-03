import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/lib/components/ui/tabs";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import { formatDate } from "~/lib/dashboard/utils";
import { cn } from "~/lib/utils";
import { TAB_OPTIONS } from "../constants";

type AnalysisWikiItem = {
  timestamp?: string;
  title?: string;
  details?: string;
};

type AnalysisPayload = {
  summarize?: string;
  wiki?: AnalysisWikiItem[];
};

type LearningTabsProps = {
  title: string;
  description?: string | null;
  publishedAt?: string | null;
  analysisText?: string | null;
  onSeekToTimestamp?: (seconds: number) => void;
};

function parseAnalysisText(text?: string | null): AnalysisPayload | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as AnalysisPayload;
    if (!parsed || typeof parsed !== "object") return null;
    const wiki = Array.isArray(parsed.wiki)
      ? parsed.wiki
          .filter(Boolean)
          .map((item) => ({
            timestamp: item.timestamp?.trim() || undefined,
            title: item.title?.trim() || undefined,
            details: item.details?.trim() || undefined,
          }))
          .filter((item) => item.title || item.details || item.timestamp)
      : undefined;
    return {
      summarize: typeof parsed.summarize === "string" ? parsed.summarize : undefined,
      wiki,
    };
  } catch {
    return null;
  }
}

function parseTimestampToSeconds(timestamp?: string | null) {
  if (!timestamp) return null;
  const cleaned = timestamp.trim();
  if (!cleaned) return null;
  if (/^\d+$/.test(cleaned)) return Number(cleaned);
  const parts = cleaned.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

type TimestampButtonProps = {
  timestamp: string;
  onSeek?: (seconds: number) => void;
  className?: string;
};

function TimestampButton({ timestamp, onSeek, className }: TimestampButtonProps) {
  const seconds = parseTimestampToSeconds(timestamp);
  if (!onSeek || seconds === null) {
    return (
      <span className={cn("text-xs font-semibold text-muted-foreground", className)}>
        {timestamp}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSeek(Math.max(0, seconds))}
      className={cn(
        "text-xs font-semibold text-primary underline decoration-primary/70 underline-offset-4 transition hover:text-primary/80",
        className,
      )}
      aria-label={`Jump to ${timestamp}`}
    >
      {timestamp}
    </button>
  );
}

export function LearningTabs({
  title,
  description,
  publishedAt,
  analysisText,
  onSeekToTimestamp,
}: LearningTabsProps) {
  const parsedAnalysis = useMemo(
    () => parseAnalysisText(analysisText),
    [analysisText],
  );
  const hasAnalysisText = Boolean(analysisText);
  const summaryText =
    parsedAnalysis?.summarize || (analysisText && !parsedAnalysis ? analysisText : null);
  const wikiItems =
    parsedAnalysis?.wiki && parsedAnalysis.wiki.length > 0
      ? parsedAnalysis.wiki
      : null;

  return (
    <Tabs
      defaultValue="info"
      className="flex h-full min-h-0 flex-col"
    >
      <TabsList className="flex h-auto w-full shrink-0 flex-wrap items-center gap-3 rounded-none border-0 bg-transparent p-0 px-4 pt-3 pb-1 text-muted-foreground">
        {TAB_OPTIONS.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-1.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <ScrollArea className="min-h-0 flex-1 px-4 pb-4 pt-2">
        <TabsContent value="info">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Video Info
              </p>
              <div>
                <h3 className="text-base font-semibold text-foreground">{title}</h3>
                <p className="text-xs text-muted-foreground">
                  Published {formatDate(publishedAt)}
                </p>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">
                {description?.trim() || "No description available yet."}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Summary
              </p>
              <div className="prose prose-base max-w-prose text-foreground/90 leading-relaxed tracking-[0.01em] prose-p:my-1 prose-li:my-1">
              {summaryText ? (
                <p className="whitespace-pre-wrap">{summaryText}</p>
              ) : (
                <p className="text-muted-foreground">
                  {hasAnalysisText
                    ? "No summary available yet."
                    : "Video analysis is not available yet. Please wait for the analysis to complete or trigger it from the playlists page."}
                </p>
              )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="wiki">
          <div className="prose prose-base flex max-w-none flex-wrap gap-x-6 gap-y-2 text-foreground/90 leading-relaxed tracking-[0.01em] prose-p:my-0">
            {wikiItems && wikiItems.length > 0 ? (
              wikiItems.map((item, index) => (
                <div
                  key={`${item.title || "wiki"}-${item.timestamp || index}`}
                  className="flex min-w-[18rem] flex-[1_1_calc(50%-12px)] items-start gap-3 py-1"
                >
                  {item.timestamp && (
                    <TimestampButton
                      timestamp={item.timestamp}
                      onSeek={onSeekToTimestamp}
                      className="text-xs shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="break-words">
                      <span className="font-semibold text-foreground">
                        {item.title || "Key moment"}
                      </span>
                      {item.details && (
                        <span className="text-muted-foreground">
                          {" "}
                          - {item.details}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-2 text-muted-foreground">
                {hasAnalysisText
                  ? "No wiki entries available yet."
                  : "Video analysis is not available yet. Please wait for the analysis to complete or trigger it from the playlists page."}
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="captions">
          <div className="text-sm">
            <p className="py-2 text-muted-foreground">
              Captions feature is not available yet.
            </p>
          </div>
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}
