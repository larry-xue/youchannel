import { memo, useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/lib/components/ui/accordion";
import { Badge } from "~/lib/components/ui/badge";
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
  const [activeTab, setActiveTab] = useState<PanelTab>(
    hasAssessment ? "assessment" : "observer",
  );
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAssessment && activeTab === "assessment") {
      setActiveTab("observer");
    }
  }, [activeTab, hasAssessment]);

  useEffect(() => {
    if (!assessment || assessment.length === 0) {
      setActiveLanguage(null);
      return;
    }
    if (
      !activeLanguage ||
      !assessment.some((entry) => entry.language === activeLanguage)
    ) {
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
    if (!Number.isFinite(value)) return "--";
    return `${Math.round(value * 100)}%`;
  };
  const formatTimestamp = (value: number) =>
    new Date(value).toLocaleTimeString(assessmentLocale ?? "en", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const handleTabChange = (value: string) => {
    if (value === "observer" || value === "assessment") {
      setActiveTab(value);
    }
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
        "hidden xl:flex flex-col gap-4 text-base min-w-0 w-full",
        "border-l border-border/60 bg-background sticky top-0 h-full py-4 px-2",
        className,
      )}
    >
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex h-full flex-col"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger
            value="observer"
            className="text-xs font-semibold uppercase tracking-[0.2em]"
          >
            {m.live_observer_title()}
          </TabsTrigger>
          <TabsTrigger
            value="assessment"
            disabled={!hasAssessment}
            className="text-xs font-semibold uppercase tracking-[0.2em]"
          >
            {m.live_assessment_title()}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="observer" className="mt-0 flex min-h-0 flex-1 flex-col gap-4">
          {error instanceof Error && (
            <div role="status" aria-live="polite" className="text-sm text-destructive">
              {error.message}
            </div>
          )}

          <div className="flex-1 overflow-auto pr-1">
            <div className="space-y-3 pb-2">
              {!hasOutputs && (
                <p className="text-sm text-muted-foreground">{m.live_observer_empty()}</p>
              )}
              {hasOutputs && (
                <Accordion type="multiple" className="w-full">
                  {outputs.map((entry) => (
                    <AccordionItem
                      key={entry.id}
                      value={entry.id}
                      className="border-border/40"
                    >
                      <AccordionTrigger
                        className={cn("py-3 text-left", "hover:no-underline")}
                      >
                        <div className="flex w-full items-start justify-between gap-3">
                          <div className="flex flex-col text-left">
                            <span className="text-base font-semibold text-foreground">
                              {m.live_observer_title()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(entry.createdAt)}
                            </span>
                          </div>
                          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            {m.live_assessment_confidence_short()}{" "}
                            {formatConfidence(entry.confidence)}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="text-sm">
                        <div className="space-y-3 break-words">
                          {entry.transcript && (
                            <p className="text-sm italic text-muted-foreground">
                              "{entry.transcript}"
                            </p>
                          )}

                          {entry.suggestions.length > 0 && (
                            <div className="space-y-3">
                              {entry.suggestions.map((suggestion, index) => {
                                const itemKey = `${entry.id}-${suggestion.type}-${index}`;
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

                                return (
                                  <div
                                    key={itemKey}
                                    className={cn(
                                      "space-y-1 border-b pb-2",
                                      "border-border/40 last:border-b-0",
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span
                                        className={cn(
                                          "text-xs font-semibold uppercase tracking-[0.2em]",
                                          "text-muted-foreground",
                                        )}
                                      >
                                        {label}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {formatConfidence(suggestion.confidence)}
                                      </span>
                                    </div>
                                    <div className="text-base text-foreground">
                                      {suggestion.text}
                                    </div>
                                    {suggestion.example && (
                                      <div className="text-sm text-muted-foreground">
                                        "{suggestion.example}"
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {entry.injection && (
                            <div className="space-y-1 border-l border-border/60 pl-3">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={cn(
                                    "text-xs font-semibold uppercase tracking-[0.2em]",
                                    "text-muted-foreground",
                                  )}
                                >
                                  {m.live_assessment_recommendations()}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] uppercase"
                                >
                                  {entry.injection.priority}
                                </Badge>
                              </div>
                              <div className="text-base text-foreground">
                                {entry.injection.text}
                              </div>
                              {entry.injection.reason && (
                                <div className="text-sm text-muted-foreground">
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

        <TabsContent
          value="assessment"
          className="mt-0 flex min-h-0 flex-1 flex-col gap-4"
        >
          {hasAssessment && (
            <div className="flex-1 overflow-auto pr-1">
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p
                    className={cn(
                      "text-base font-semibold uppercase tracking-[0.2em]",
                      "text-muted-foreground",
                    )}
                  >
                    {m.live_assessment_title()}
                  </p>
                  <span className="text-base text-muted-foreground">
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
                            "rounded-full border px-3 py-1 text-base font-semibold",
                            "transition-colors",
                            isActive
                              ? "border-foreground bg-foreground text-background"
                              : cn(
                                  "border-border/60 bg-transparent",
                                  "text-muted-foreground hover:text-foreground",
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
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-foreground truncate">
                          {getLanguageName(activeEntry.language)}
                        </p>
                        <p className="text-base text-muted-foreground">
                          {activeEntry.language}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-base">
                          {activeEntry.overall_cefr}
                        </Badge>
                        <span className="text-base text-muted-foreground">
                          {m.live_assessment_confidence_short()}{" "}
                          {formatConfidence(activeEntry.confidence)}
                        </span>
                      </div>
                    </div>

                    <p className="text-base text-foreground/90 leading-relaxed">
                      {activeEntry.summary}
                    </p>

                    <div className="space-y-2">
                      {dimensionItems.map((item) => (
                        <div
                          key={item.key}
                          className={cn(
                            "flex items-center justify-between border-b pb-1",
                            "border-border/40 last:border-b-0",
                          )}
                        >
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-semibold text-foreground">
                            {activeEntry.dimensions[item.key]}
                          </span>
                        </div>
                      ))}
                    </div>

                    <Accordion type="multiple" className="w-full">
                      {activeEntry.strengths.length > 0 && (
                        <AccordionItem
                          value={`${activeEntry.language}-strengths`}
                          className="border-border/40"
                        >
                          <AccordionTrigger
                            className={cn(
                              "py-2 text-base font-semibold uppercase tracking-[0.18em]",
                              "text-muted-foreground hover:no-underline",
                            )}
                          >
                            {m.live_assessment_strengths()}
                          </AccordionTrigger>
                          <AccordionContent className="text-base">
                            <ul className="mt-1 space-y-1 list-disc list-inside text-foreground/90">
                              {activeEntry.strengths.map((item, index) => (
                                <li key={`${activeEntry.language}-strength-${index}`}>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {activeEntry.weaknesses.length > 0 && (
                        <AccordionItem
                          value={`${activeEntry.language}-weaknesses`}
                          className="border-border/40"
                        >
                          <AccordionTrigger
                            className={cn(
                              "py-2 text-base font-semibold uppercase tracking-[0.18em]",
                              "text-muted-foreground hover:no-underline",
                            )}
                          >
                            {m.live_assessment_weaknesses()}
                          </AccordionTrigger>
                          <AccordionContent className="text-base">
                            <ul className="mt-1 space-y-1 list-disc list-inside text-foreground/90">
                              {activeEntry.weaknesses.map((item, index) => (
                                <li key={`${activeEntry.language}-weakness-${index}`}>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {activeEntry.recommendations.length > 0 && (
                        <AccordionItem
                          value={`${activeEntry.language}-recommendations`}
                          className="border-border/40"
                        >
                          <AccordionTrigger
                            className={cn(
                              "py-2 text-base font-semibold uppercase tracking-[0.18em]",
                              "text-muted-foreground hover:no-underline",
                            )}
                          >
                            {m.live_assessment_recommendations()}
                          </AccordionTrigger>
                          <AccordionContent className="text-base">
                            <ul className="mt-1 space-y-1 list-disc list-inside text-foreground/90">
                              {activeEntry.recommendations.map((item, index) => (
                                <li key={`${activeEntry.language}-rec-${index}`}>
                                  {item}
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
            </div>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
});
