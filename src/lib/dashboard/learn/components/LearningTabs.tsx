import { useMemo } from "react";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/lib/components/ui/tabs";
import { formatDate } from "~/lib/dashboard/utils";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";
import { parseAnalysisText } from "../analysis";
import { TAB_OPTIONS } from "../constants";

type LearningTabsProps = {
  title: string;
  description?: string | null;
  publishedAt?: string | null;
  analysisText?: string | null;
  onSeekToTimestamp?: (seconds: number) => void;
};

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
  const parsedAnalysis = useMemo(() => parseAnalysisText(analysisText), [analysisText]);
  const hasAnalysisText = Boolean(analysisText);
  const summaryText =
    parsedAnalysis?.summarize || (analysisText && !parsedAnalysis ? analysisText : null);
  const wikiItems =
    parsedAnalysis?.wiki && parsedAnalysis.wiki.length > 0 ? parsedAnalysis.wiki : null;
  const transcript = parsedAnalysis?.transcript;
  const transcriptSegments =
    transcript?.segments && transcript.segments.length > 0 ? transcript.segments : null;
  const tabLabels = {
    learn_tab_overview: m.learn_tab_overview(),
    learn_tab_wiki: m.learn_tab_wiki(),
    learn_tab_transcript: m.learn_tab_transcript(),
  } as const;

  return (
    <Tabs defaultValue="info" className="flex h-full min-h-0 flex-col">
      <TabsList className="flex h-auto w-full shrink-0 flex-wrap items-center gap-2 rounded-none border-0 bg-transparent p-0 px-4 pt-4 pb-2 text-muted-foreground">
        {TAB_OPTIONS.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            className="h-9 rounded-full border border-transparent bg-muted/30 px-4 py-1 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/50 data-[state=active]:border-primary/20 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            {tabLabels[tab.labelKey]}
          </TabsTrigger>
        ))}
      </TabsList>
      <ScrollArea className="min-h-0 flex-1 px-4 pb-4 pt-2">
        <TabsContent value="info">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {m.learn_video_info_heading()}
                </p>
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold tracking-tight text-foreground">
                  {title}
                </h3>
                <p className="text-sm font-medium text-muted-foreground">
                  {m.learn_published_at({ date: formatDate(publishedAt) })}
                </p>
              </div>
              <div className="rounded-3xl bg-muted/20 p-5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {description?.trim() || m.learn_description_empty()}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {m.learn_summary_heading()}
                </p>
              </div>
              <div className="rounded-3xl bg-surface-container-high/50 p-6 border border-border/50">
                <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed tracking-wide prose-p:my-2 prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                  {summaryText ? (
                    <p className="whitespace-pre-wrap">{summaryText}</p>
                  ) : (
                    <p className="text-muted-foreground italic">
                      {hasAnalysisText
                        ? m.learn_summary_empty()
                        : m.learn_analysis_unavailable()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="wiki">
          <div className="flex flex-wrap gap-4">
            {wikiItems && wikiItems.length > 0 ? (
              wikiItems.map((item, index) => (
                <div
                  key={`${item.title || "wiki"}-${item.timestamp || index}`}
                  className="group flex min-w-[300px] flex-[1_1_calc(50%-16px)] flex-col gap-2 rounded-3xl border border-border/40 bg-card p-5 transition-all hover:border-primary/20 hover:bg-accent/5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {item.title || "Key moment"}
                    </p>
                    {item.timestamp && (
                      <TimestampButton
                        timestamp={item.timestamp}
                        onSeek={onSeekToTimestamp}
                        className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/20 no-underline"
                      />
                    )}
                  </div>
                  {item.details && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.details}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-3xl border border-dashed border-muted-foreground/20 bg-muted/10">
                <p className="text-sm text-muted-foreground">
                  {hasAnalysisText
                    ? m.learn_wiki_empty()
                    : m.learn_analysis_unavailable()}
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="transcript">
          <div className="space-y-4">
            <div className="flex items-start gap-4 rounded-3xl border border-amber-200/40 bg-amber-50/50 p-4 text-sm text-amber-900/80">
              <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <p className="text-xs font-medium leading-relaxed">
                {m.learn_transcript_notice()}
              </p>
            </div>

            {transcript && (
              <div className="flex flex-wrap items-center gap-2 px-1">
                {transcript.language && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {m.learn_transcript_language({ language: transcript.language })}
                  </span>
                )}
                {typeof transcript.is_truncated === "boolean" && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {transcript.is_truncated
                      ? m.learn_transcript_truncated()
                      : m.learn_transcript_complete()}
                  </span>
                )}
              </div>
            )}

            {transcriptSegments ? (
              <div className="space-y-1">
                {transcriptSegments.map((segment, index) => (
                  <div
                    key={`${segment.start || "segment"}-${segment.end || index}`}
                    className="group flex gap-4 rounded-2xl p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="mt-1 shrink-0">
                      {segment.start && (
                        <TimestampButton
                          timestamp={segment.start}
                          onSeek={onSeekToTimestamp}
                          className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-bold text-muted-foreground hover:bg-primary/10 hover:text-primary no-underline transition-colors"
                        />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      {segment.speaker && (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                          {segment.speaker}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed text-foreground/90">
                        {segment.text || m.learn_transcript_text_empty()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-3xl border border-dashed border-muted-foreground/20 bg-muted/10">
                <p className="text-sm text-muted-foreground">
                  {hasAnalysisText
                    ? m.learn_transcript_empty()
                    : m.learn_analysis_unavailable()}
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="captions">
          <div className="flex h-60 w-full items-center justify-center rounded-3xl border border-dashed border-muted-foreground/20 bg-muted/10">
            <p className="text-sm text-muted-foreground">
              {m.learn_captions_unavailable()}
            </p>
          </div>
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}
