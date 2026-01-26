import { Sparkles } from "lucide-react";
import { memo, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/lib/components/ui/accordion";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Loading } from "~/lib/components/ui/loading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/lib/components/ui/tabs";
import type { LiveSessionAssessment } from "~/lib/dashboard/live/assessment";
import type { LiveObserverOutput } from "~/lib/dashboard/live/useLiveObserverSidecar";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

type DimensionKey = keyof LiveSessionAssessment[number]["dimensions"];
type PanelTab = "observer" | "assessment";

type ObserverPanelProps = {
  outputs: LiveObserverOutput[];
  error: unknown;
  canTrigger: boolean;
  onTrigger: () => void;
  isLoading?: boolean;
  assessment?: LiveSessionAssessment | null;
  assessmentLocale?: string;
  className?: string;
};

export const ObserverPanel = memo(function ObserverPanel({
  outputs,
  error,
  canTrigger,
  onTrigger,
  isLoading = false,
  assessment,
  assessmentLocale,
  className,
}: ObserverPanelProps) {
  const hasOutputs = outputs.length > 0;
  const hasAssessment = Boolean(assessment && assessment.length > 0);

  const [activeTab, setActiveTab] = useState<PanelTab>(() =>
    hasAssessment ? "assessment" : "observer",
  );
  const resolvedTab: PanelTab = hasAssessment ? activeTab : "observer";

  const [activeLanguage, setActiveLanguage] = useState<string | null>(() => {
    if (!assessment || assessment.length === 0) return null;
    return assessment[0].language;
  });

  const resolvedLanguage = useMemo(() => {
    if (!assessment || assessment.length === 0) return null;
    if (activeLanguage && assessment.some((entry) => entry.language === activeLanguage)) {
      return activeLanguage;
    }
    return assessment[0].language;
  }, [activeLanguage, assessment]);

  const activeEntry = useMemo(() => {
    if (!assessment || assessment.length === 0) return null;
    if (!resolvedLanguage) return assessment[0];
    return (
      assessment.find((entry) => entry.language === resolvedLanguage) ?? assessment[0]
    );
  }, [assessment, resolvedLanguage]);

  const languageCount = assessment?.length ?? 0;
  const hasMultipleLanguages = languageCount > 1;
  const languageCountLabel =
    languageCount === 1
      ? m.live_assessment_language_count_one()
      : m.live_assessment_language_count_many({ count: languageCount });

  const displayNames = useMemo(() => {
    if (typeof Intl === "undefined") return null;
    if (!("DisplayNames" in Intl)) return null;
    try {
      return new Intl.DisplayNames([assessmentLocale ?? "en"], { type: "language" });
    } catch {
      return null;
    }
  }, [assessmentLocale]);

  const getLanguageName = (language: string) => {
    if (!displayNames) return language;
    return displayNames.of(language) ?? language;
  };

  const formatConfidence = (value: number) => {
    if (!Number.isFinite(value)) return "--";
    return `${Math.round(value * 100)}%`;
  };

  const formatTimestamp = (value: number) =>
    new Date(value).toLocaleTimeString(assessmentLocale ?? "en", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleTabChange = (value: string) => {
    if (value !== "observer" && value !== "assessment") return;
    if (value === "assessment" && !hasAssessment) return;
    setActiveTab(value);
  };

  const dimensionItems: Array<{ key: DimensionKey; label: string }> = [
    { key: "pronunciation", label: m.live_assessment_dim_pronunciation() },
    { key: "fluency", label: m.live_assessment_dim_fluency() },
    { key: "grammar", label: m.live_assessment_dim_grammar() },
    { key: "vocabulary", label: m.live_assessment_dim_vocabulary() },
    { key: "comprehension", label: m.live_assessment_dim_comprehension() },
  ];

  return (
    <aside className={cn("flex h-full min-w-0 flex-col", className)}>
      <Tabs
        value={resolvedTab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="observer"
            className="h-10 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {m.live_observer_title()}
          </TabsTrigger>
          <TabsTrigger
            value="assessment"
            disabled={!hasAssessment}
            className="h-10 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {m.live_assessment_title()}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="observer" className="mt-3 min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-background">
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {error instanceof Error && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-3 border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  {error.message}
                </div>
              )}

              {!hasOutputs ? (
                isLoading ? (
                  <Loading text={m.live_history_loading()} className="py-14" />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-primary/10">
                      <Sparkles aria-hidden="true" className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {m.live_observer_empty()}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onTrigger}
                      disabled={!canTrigger}
                      className="h-9 rounded-md border-border bg-background px-4"
                    >
                      <Sparkles aria-hidden="true" className="h-4 w-4" />
                      <span className="text-sm font-semibold">
                        {m.live_observer_run()}
                      </span>
                    </Button>
                  </div>
                )
              ) : (
                <Accordion type="multiple" className="border border-border">
                  {outputs.map((entry) => (
                    <AccordionItem key={entry.id} value={entry.id} className="px-4">
                      <AccordionTrigger className="py-4 text-left hover:no-underline">
                        <div className="flex w-full items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="text-sm font-semibold text-foreground">
                              {m.live_observer_title()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(entry.createdAt)}
                            </span>
                          </div>
                          <Badge variant="secondary" className="rounded-md text-xs">
                            {m.live_assessment_confidence_short()}{" "}
                            {formatConfidence(entry.confidence)}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4 text-sm">
                        <div className="space-y-3 break-words">
                          {entry.transcript && (
                            <p className="border border-border bg-muted/20 px-4 py-3 text-sm italic text-muted-foreground">
                              "{entry.transcript}"
                            </p>
                          )}

                          {entry.suggestions.length > 0 && (
                            <div className="space-y-3">
                              {entry.suggestions.map((suggestion) => {
                                const label =
                                  suggestion.type === "grammar"
                                    ? m.live_assessment_dim_grammar()
                                    : suggestion.type === "vocabulary"
                                      ? m.live_assessment_dim_vocabulary()
                                      : suggestion.type === "pronunciation"
                                        ? m.live_assessment_dim_pronunciation()
                                        : suggestion.type === "fluency"
                                          ? m.live_assessment_dim_fluency()
                                          : suggestion.type === "comprehension"
                                            ? m.live_assessment_dim_comprehension()
                                            : m.live_observer_title();

                                const itemKey = `${entry.id}-${suggestion.type}-${suggestion.text}`;

                                return (
                                  <div
                                    key={itemKey}
                                    className="border border-border bg-muted/20 px-4 py-3"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        {label}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {formatConfidence(suggestion.confidence)}
                                      </span>
                                    </div>
                                    <div className="mt-2 text-sm leading-relaxed text-foreground">
                                      {suggestion.text}
                                    </div>
                                    {suggestion.example && (
                                      <div className="mt-2 text-sm text-muted-foreground">
                                        "{suggestion.example}"
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {entry.injection && (
                            <div className="border border-border bg-muted/20 px-4 py-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  {m.live_assessment_recommendations()}
                                </span>
                                <Badge variant="secondary" className="rounded-md text-xs">
                                  {entry.injection.priority}
                                </Badge>
                              </div>
                              <div className="mt-2 text-sm leading-relaxed text-foreground">
                                {entry.injection.text}
                              </div>
                              {entry.injection.reason && (
                                <div className="mt-2 text-sm text-muted-foreground">
                                  {entry.injection.reason}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="assessment" className="mt-3 min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-background">
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {hasAssessment && (
                <section className="space-y-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {m.live_assessment_title()}
                    </p>
                    <span className="text-sm text-muted-foreground">
                      {languageCountLabel}
                    </span>
                  </div>

                  {hasMultipleLanguages && (
                    <div className="flex flex-wrap gap-2">
                      {assessment?.map((entry) => {
                        const isActive = entry.language === activeEntry?.language;
                        return (
                          <button
                            key={entry.language}
                            type="button"
                            onClick={() => setActiveLanguage(entry.language)}
                            aria-pressed={isActive}
                            className={cn(
                              "rounded-md border border-border px-3 py-1 text-sm font-semibold",
                              "transition-colors",
                              isActive
                                ? "border-primary/30 bg-primary/10 text-foreground"
                                : cn(
                                    "border-border bg-background",
                                    "text-muted-foreground hover:bg-muted/20 hover:text-foreground",
                                  ),
                            )}
                          >
                            {getLanguageName(entry.language)}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {activeEntry && (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {getLanguageName(activeEntry.language)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {activeEntry.language}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="rounded-md text-sm">
                            {activeEntry.overall_cefr}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {m.live_assessment_confidence_short()}{" "}
                            {formatConfidence(activeEntry.confidence)}
                          </span>
                        </div>
                      </div>

                      <p className="text-sm leading-relaxed text-foreground/90">
                        {activeEntry.summary}
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {dimensionItems.map((item) => (
                          <div
                            key={item.key}
                            className="border border-border bg-muted/20 px-4 py-3"
                          >
                            <p className="text-xs text-muted-foreground">{item.label}</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {activeEntry.dimensions[item.key]}
                            </p>
                          </div>
                        ))}
                      </div>

                      <Accordion type="multiple" className="border border-border">
                        {activeEntry.strengths.length > 0 && (
                          <AccordionItem
                            value={`${activeEntry.language}-strengths`}
                            className="px-4"
                          >
                            <AccordionTrigger className="py-4 text-left hover:no-underline">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {m.live_assessment_strengths()}
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4 text-sm">
                              <ul className="space-y-2 text-sm leading-relaxed text-foreground/90">
                                {activeEntry.strengths.map((item) => (
                                  <li
                                    key={`${activeEntry.language}-strength-${item}`}
                                    className="flex gap-2"
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60"
                                    />
                                    <span className="min-w-0">{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        )}

                        {activeEntry.weaknesses.length > 0 && (
                          <AccordionItem
                            value={`${activeEntry.language}-weaknesses`}
                            className="px-4"
                          >
                            <AccordionTrigger className="py-4 text-left hover:no-underline">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {m.live_assessment_weaknesses()}
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4 text-sm">
                              <ul className="space-y-2 text-sm leading-relaxed text-foreground/90">
                                {activeEntry.weaknesses.map((item) => (
                                  <li
                                    key={`${activeEntry.language}-weakness-${item}`}
                                    className="flex gap-2"
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--brand-blue)]/60"
                                    />
                                    <span className="min-w-0">{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        )}

                        {activeEntry.recommendations.length > 0 && (
                          <AccordionItem
                            value={`${activeEntry.language}-recommendations`}
                            className="px-4"
                          >
                            <AccordionTrigger className="py-4 text-left hover:no-underline">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {m.live_assessment_recommendations()}
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4 text-sm">
                              <ul className="space-y-2 text-sm leading-relaxed text-foreground/90">
                                {activeEntry.recommendations.map((item) => (
                                  <li
                                    key={`${activeEntry.language}-recommendation-${item}`}
                                    className="flex gap-2"
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--brand-green)]/60"
                                    />
                                    <span className="min-w-0">{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        )}
                      </Accordion>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
});
