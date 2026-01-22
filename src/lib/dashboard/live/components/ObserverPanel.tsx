import { memo, useEffect, useState } from "react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { cn } from "~/lib/utils";
import type { LiveSessionAssessment } from "~/lib/dashboard/live/assessment";
import type { ObserverOutput } from "~/lib/dashboard/live/useObserverInsights";
import * as m from "~/paraglide/messages";

type DimensionKey = keyof LiveSessionAssessment[number]["dimensions"];

type ObserverPanelProps = {
  outputs: ObserverOutput[];
  error: unknown;
  canTrigger: boolean;
  onTrigger: () => void;
  assessment?: LiveSessionAssessment | null;
  assessmentLocale?: string;
  className?: string;
};

export const ObserverPanel = memo(function ObserverPanel({
  outputs,
  error,
  canTrigger,
  onTrigger,
  assessment,
  assessmentLocale,
  className,
}: ObserverPanelProps) {
  const hasOutputs = outputs.length > 0;
  const hasAssessment = Boolean(assessment && assessment.length > 0);
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);

  useEffect(() => {
    if (!assessment || assessment.length === 0) {
      setActiveLanguage(null);
      return;
    }
    if (!activeLanguage || !assessment.some((entry) => entry.language === activeLanguage)) {
      setActiveLanguage(assessment[0].language);
    }
  }, [assessment, activeLanguage]);

  const activeEntry =
    assessment?.find((entry) => entry.language === activeLanguage) ??
    assessment?.[0] ??
    null;
  const hasMultipleLanguages = (assessment?.length ?? 0) > 1;
  const languageCount = assessment?.length ?? 0;
  const languageCountLabel =
    languageCount === 1
      ? m.live_assessment_language_count_one()
      : m.live_assessment_language_count_many({ count: languageCount });

  const displayNames =
    typeof Intl !== "undefined" && "DisplayNames" in Intl
      ? (() => {
          try {
            return new Intl.DisplayNames([assessmentLocale ?? "en"], {
              type: "language",
            });
          } catch {
            return null;
          }
        })()
      : null;
  const getLanguageName = (language: string) => {
    if (!displayNames) return language;
    return displayNames.of(language) ?? language;
  };
  const formatConfidence = (value: number) => {
    if (Number.isNaN(value)) return "--";
    return `${Math.round(value * 100)}%`;
  };
  const dimensionItems: Array<{ key: DimensionKey; label: string }> = [
    { key: "pronunciation", label: m.live_assessment_dim_pronunciation() },
    { key: "fluency", label: m.live_assessment_dim_fluency() },
    { key: "grammar", label: m.live_assessment_dim_grammar() },
    { key: "vocabulary", label: m.live_assessment_dim_vocabulary() },
    { key: "comprehension", label: m.live_assessment_dim_comprehension() },
  ];

  return (
    <aside
      className={cn(
        "hidden xl:flex flex-col gap-4 text-sm w-80 shrink-0 border-l border-border/60 bg-background sticky top-0 h-screen py-4 px-2",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {m.live_observer_title()}
        </p>
        <Button size="sm" variant="ghost" onClick={onTrigger} disabled={!canTrigger}>
          {m.live_observer_run()}
        </Button>
      </div>

      {error instanceof Error && (
        <div role="status" aria-live="polite" className="text-xs text-destructive">
          {error.message}
        </div>
      )}

      {hasAssessment && (
        <section className="rounded-2xl border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {m.live_assessment_title()}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {languageCountLabel}
            </span>
          </div>

          {hasMultipleLanguages && (
            <div className="mt-3 flex flex-wrap gap-2">
              {assessment?.map((entry) => {
                const isActive = entry.language === activeEntry?.language;
                return (
                  <button
                    key={entry.language}
                    type="button"
                    onClick={() => setActiveLanguage(entry.language)}
                    aria-pressed={isActive}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11px] font-semibold",
                      "transition-colors",
                      isActive
                        ? "border-foreground bg-foreground text-background"
                        : "border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {getLanguageName(entry.language)}
                  </button>
                );
              })}
            </div>
          )}

          {activeEntry && (
            <div className="mt-3 relative">
              {hasMultipleLanguages && (
                <>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -translate-y-2 translate-x-2 rounded-xl border border-border/50 bg-background/60 shadow-sm"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -translate-y-4 translate-x-4 rounded-xl border border-border/40 bg-background/40 shadow-sm"
                  />
                </>
              )}

              <div className="relative rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {getLanguageName(activeEntry.language)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {activeEntry.language}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-[11px]">
                      {activeEntry.overall_cefr}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {m.live_assessment_confidence_short()}{" "}
                      {formatConfidence(activeEntry.confidence)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-foreground/90 leading-relaxed">
                  {activeEntry.summary}
                </p>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {dimensionItems.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/40 px-2 py-1"
                    >
                      <span className="text-muted-foreground">
                        {item.label}
                      </span>
                      <span className="font-semibold text-foreground">
                        {activeEntry.dimensions[item.key]}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 text-xs">
                  {activeEntry.strengths.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {m.live_assessment_strengths()}
                      </p>
                      <ul className="mt-1 space-y-1 list-disc list-inside text-foreground/90">
                        {activeEntry.strengths.map((item, index) => (
                          <li key={`${activeEntry.language}-strength-${index}`}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activeEntry.weaknesses.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {m.live_assessment_weaknesses()}
                      </p>
                      <ul className="mt-1 space-y-1 list-disc list-inside text-foreground/90">
                        {activeEntry.weaknesses.map((item, index) => (
                          <li key={`${activeEntry.language}-weakness-${index}`}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activeEntry.recommendations.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {m.live_assessment_recommendations()}
                      </p>
                      <ul className="mt-1 space-y-1 list-disc list-inside text-foreground/90">
                        {activeEntry.recommendations.map((item, index) => (
                          <li key={`${activeEntry.language}-rec-${index}`}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="flex-1 overflow-auto">
        <div className="space-y-3 pb-2">
          {!hasOutputs && (
            <p className="text-xs text-muted-foreground">
              {m.live_observer_empty()}
            </p>
          )}
          {outputs.map((entry) => (
            <div key={entry.id} className="space-y-3 break-words">
              {entry.explanation && entry.explanation.length > 0 && (
                <div className="space-y-2">
                  {entry.explanation.map((item) => {
                    const itemKey = `${entry.id}-${item.term}-${item.example}`;
                    return (
                      <div key={itemKey} className="border-l border-border/60 pl-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {item.term}
                        </div>
                        <div className="mt-1 text-xs text-foreground">
                          {item.note}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          "{item.example}"
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
});
