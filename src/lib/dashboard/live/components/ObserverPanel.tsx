import { Sparkles } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/lib/components/ui/accordion";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Loading } from "~/lib/components/ui/loading";
import type { LiveSessionAssessment } from "~/lib/dashboard/live/assessment";
import {
  scoreShadowingAttemptFn,
  type ShadowingScore,
} from "~/lib/dashboard/live/practice";
import { arrayBufferToBase64, float32ToWavBuffer } from "~/lib/gemini/utils";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

type DimensionKey = keyof LiveSessionAssessment[number]["dimensions"];
type PracticeDrill = NonNullable<LiveSessionAssessment[number]["practice_drills"]>[number];

type DrillAttemptState = {
  status: "idle" | "recording" | "scoring" | "done" | "error";
  audioUrl?: string;
  score?: ShadowingScore;
  error?: string;
};

type ObserverPanelProps = {
  isLoading?: boolean;
  assessment?: LiveSessionAssessment | null;
  assessmentLocale?: string;
  className?: string;
};

export const ObserverPanel = memo(function ObserverPanel({
  isLoading = false,
  assessment,
  assessmentLocale,
  className,
}: ObserverPanelProps) {
  const hasAssessment = Boolean(assessment && assessment.length > 0);

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

  const practiceDrills = useMemo(() => {
    if (!activeEntry?.practice_drills) return [];
    return activeEntry.practice_drills;
  }, [activeEntry]);

  const [drillAttemptState, setDrillAttemptState] = useState<
    Record<string, DrillAttemptState>
  >({});
  const drillAttemptStateRef = useRef<Record<string, DrillAttemptState>>({});

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingDrillIdRef = useRef<string | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeEntryRef = useRef<LiveSessionAssessment[number] | null>(null);
  const assessmentLocaleRef = useRef<string | null>(assessmentLocale ?? null);

  useEffect(() => {
    activeEntryRef.current = activeEntry;
  }, [activeEntry]);

  useEffect(() => {
    assessmentLocaleRef.current = assessmentLocale ?? null;
  }, [assessmentLocale]);

  useEffect(() => {
    drillAttemptStateRef.current = drillAttemptState;
  }, [drillAttemptState]);

  const revokeObjectUrl = useCallback((url: string | undefined) => {
    if (!url) return;
    if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
    if (!url.startsWith("blob:")) return;
    URL.revokeObjectURL(url);
  }, []);

  const setAttemptState = useCallback(
    (drillId: string, next: Partial<DrillAttemptState>) => {
      setDrillAttemptState((prev) => {
        const existing = prev[drillId];
        const audioUrl = next.audioUrl ?? existing?.audioUrl;
        if (existing?.audioUrl && next.audioUrl && existing.audioUrl !== next.audioUrl) {
          revokeObjectUrl(existing.audioUrl);
        }
        return {
          ...prev,
          [drillId]: {
            status: existing?.status ?? "idle",
            ...existing,
            ...next,
            audioUrl,
          },
        };
      });
    },
    [revokeObjectUrl],
  );

  const stopMediaStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  }, []);

  const clearRecorder = useCallback(() => {
    const timer = autoStopTimerRef.current;
    if (timer) clearTimeout(timer);
    autoStopTimerRef.current = null;

    recorderRef.current = null;
    recordingDrillIdRef.current = null;
    chunksRef.current = [];
    stopMediaStream();
  }, [stopMediaStream]);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      clearRecorder();
      Object.values(drillAttemptStateRef.current).forEach((state) =>
        revokeObjectUrl(state.audioUrl),
      );
    };
  }, [clearRecorder, revokeObjectUrl]);

  const decodeBlobToWav = useCallback(async (blob: Blob) => {
    if (typeof window === "undefined") {
      throw new Error("Audio decoding is not available on the server.");
    }
    const raw = await blob.arrayBuffer();
    const context = new AudioContext();
    try {
      const audioBuffer = await context.decodeAudioData(raw.slice(0));
      const channelCount = audioBuffer.numberOfChannels;
      const frameCount = audioBuffer.length;
      const mono = new Float32Array(frameCount);

      for (let channel = 0; channel < channelCount; channel += 1) {
        const data = audioBuffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i += 1) {
          mono[i] += data[i] / channelCount;
        }
      }

      const wavBuffer = float32ToWavBuffer(mono, audioBuffer.sampleRate, 1);
      const base64 = arrayBufferToBase64(wavBuffer);
      const audioUrl = URL.createObjectURL(new Blob([wavBuffer], { type: "audio/wav" }));
      return { mimeType: "audio/wav", data: base64, audioUrl };
    } finally {
      await context.close().catch(() => {
        // ignore best-effort cleanup
      });
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(
    async (drill: PracticeDrill) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setAttemptState(drill.id, {
          status: "error",
          error: "getUserMedia is not available in this environment.",
        });
        return;
      }

      if (!activeEntryRef.current) return;

      const existingRecorder = recorderRef.current;
      if (existingRecorder && existingRecorder.state !== "inactive") {
        existingRecorder.stop();
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const preferredTypes = ["audio/webm;codecs=opus", "audio/webm"];
        const mimeType = preferredTypes.find((type) =>
          typeof MediaRecorder !== "undefined" &&
          typeof MediaRecorder.isTypeSupported === "function" &&
          MediaRecorder.isTypeSupported(type),
        );

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorderRef.current = recorder;
        chunksRef.current = [];
        recordingDrillIdRef.current = drill.id;

        console.debug("[LivePractice] recording_start", {
          drillId: drill.id,
          mimeType: recorder.mimeType || mimeType || null,
        });

        setAttemptState(drill.id, {
          status: "recording",
          score: undefined,
          audioUrl: undefined,
          error: undefined,
        });

        recorder.addEventListener("dataavailable", (event) => {
          if (!event.data || event.data.size === 0) return;
          chunksRef.current.push(event.data);
        });

        recorder.addEventListener("stop", async () => {
          const drillId = recordingDrillIdRef.current;
          const entry = activeEntryRef.current;
          const uiLocale = assessmentLocaleRef.current ?? "en";
          const recordedChunks = [...chunksRef.current];
          const recordedMimeType = recorder.mimeType || "audio/webm";
          clearRecorder();
          if (!drillId || !entry) return;

          setAttemptState(drillId, { status: "scoring" });

          try {
            const recordedBlob = new Blob(recordedChunks, { type: recordedMimeType });
            const wav = await decodeBlobToWav(recordedBlob);
            setAttemptState(drillId, { audioUrl: wav.audioUrl });

            console.debug("[LivePractice] scoring_start", {
              drillId,
              language: entry.language,
              targetChars: drill.target_text.length,
            });

            const result = await scoreShadowingAttemptFn({
              data: {
                uiLocale,
                language: entry.language,
                targetText: drill.target_text,
                audio: { mimeType: wav.mimeType, data: wav.data },
              },
            });

            console.debug("[LivePractice] scoring_done", {
              drillId,
              overall: result.overall,
              accuracy: result.accuracy,
              pronunciation: result.pronunciation,
              fluency: result.fluency,
            });

            setAttemptState(drillId, { status: "done", score: result });
          } catch (err) {
            console.error("[LivePractice] scoring_failed", err);
            const message = err instanceof Error ? err.message : String(err);
            setAttemptState(drillId, { status: "error", error: message });
          }
        });

        recorder.start();

        autoStopTimerRef.current = setTimeout(() => {
          const current = recorderRef.current;
          if (!current || current.state === "inactive") return;
          console.debug("[LivePractice] recording_autostop", { drillId: drill.id });
          current.stop();
        }, 8000);
      } catch (err) {
        console.error("[LivePractice] recording_failed", err);
        const message = err instanceof Error ? err.message : String(err);
        setAttemptState(drill.id, { status: "error", error: message });
        clearRecorder();
      }
    },
    [clearRecorder, decodeBlobToWav, setAttemptState],
  );

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

  const dimensionItems: Array<{ key: DimensionKey; label: string }> = [
    { key: "pronunciation", label: m.live_assessment_dim_pronunciation() },
    { key: "fluency", label: m.live_assessment_dim_fluency() },
    { key: "grammar", label: m.live_assessment_dim_grammar() },
    { key: "vocabulary", label: m.live_assessment_dim_vocabulary() },
    { key: "comprehension", label: m.live_assessment_dim_comprehension() },
  ];

  return (
    <aside className={cn("flex h-full min-w-0 flex-col", className)}>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
        <div className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-background">
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {isLoading && !hasAssessment ? (
              <Loading text={m.live_history_loading()} className="py-14" />
            ) : !hasAssessment ? (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-primary/10">
                  <Sparkles aria-hidden="true" className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {m.live_assessment_empty()}
                </p>
              </div>
            ) : (
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
                      {practiceDrills.length > 0 && (
                        <AccordionItem
                          value={`${activeEntry.language}-practice`}
                          className="px-4"
                        >
                          <AccordionTrigger className="py-4 text-left hover:no-underline">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {m.live_practice_title()}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="pb-4 text-sm">
                            <div className="space-y-4">
                              {practiceDrills.map((drill) => {
                                const state = drillAttemptState[drill.id] ?? {
                                  status: "idle" as const,
                                };
                                const isRecording = state.status === "recording";
                                const isScoring = state.status === "scoring";

                                return (
                                  <div
                                    key={`${activeEntry.language}-practice-${drill.id}`}
                                    className="space-y-3 border border-border bg-muted/10 p-4"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 space-y-1">
                                        <p className="text-sm font-semibold text-foreground">
                                          {drill.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {drill.why}
                                        </p>
                                        {drill.tip && (
                                          <p className="text-xs text-muted-foreground">
                                            {drill.tip}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={() => {
                                            if (isRecording) {
                                              stopRecording();
                                            } else {
                                              void startRecording(drill);
                                            }
                                          }}
                                          disabled={isScoring}
                                        >
                                          {isRecording
                                            ? m.live_practice_stop()
                                            : m.live_practice_record()}
                                        </Button>
                                      </div>
                                    </div>

                                    <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground">
                                      {drill.target_text}
                                    </div>

                                    {state.audioUrl && (
                                      <audio
                                        className="w-full"
                                        controls
                                        preload="metadata"
                                        src={state.audioUrl}
                                      />
                                    )}

                                    {state.status === "scoring" && (
                                      <p className="text-xs text-muted-foreground">
                                        {m.live_practice_scoring()}
                                      </p>
                                    )}

                                    {state.status === "error" && state.error && (
                                      <p className="text-xs text-destructive">
                                        {state.error}
                                      </p>
                                    )}

                                    {state.status === "done" && state.score && (
                                      <div className="space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                          <Badge variant="secondary" className="rounded-md">
                                            {m.live_practice_score_overall()}{" "}
                                            {state.score.overall}
                                          </Badge>
                                          <Badge variant="secondary" className="rounded-md">
                                            {m.live_practice_score_accuracy()}{" "}
                                            {state.score.accuracy}
                                          </Badge>
                                          <Badge variant="secondary" className="rounded-md">
                                            {m.live_practice_score_pronunciation()}{" "}
                                            {state.score.pronunciation}
                                          </Badge>
                                          <Badge variant="secondary" className="rounded-md">
                                            {m.live_practice_score_fluency()}{" "}
                                            {state.score.fluency}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {state.score.feedback}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {m.live_practice_next_focus()}:{" "}
                                          {state.score.next_focus}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

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
                                    className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
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
      </div>
    </aside>
  );
});
