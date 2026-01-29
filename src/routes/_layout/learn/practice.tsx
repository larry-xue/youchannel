import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import { Loading } from "~/lib/components/ui/loading";
import { getPracticeRecommendationsFn, type PracticeRecommendation } from "~/lib/dashboard/learn/practice";
import { scoreShadowingAttemptFn, type ShadowingScore } from "~/lib/dashboard/live/practice";
import { arrayBufferToBase64, float32ToWavBuffer } from "~/lib/gemini/utils";
import { useLearningProfile } from "~/lib/hooks/useLearningProfile";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";
import { getLocale } from "~/paraglide/runtime";

type DrillAttemptState = {
  status: "idle" | "recording" | "scoring" | "done" | "error";
  audioUrl?: string;
  score?: ShadowingScore;
  deltaOverall?: number | null;
  error?: string;
};

const SHOWN_KEY_STORAGE = "practice_day_shown_at_v1";

const readDayShownKeys = () => {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(SHOWN_KEY_STORAGE);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const keys = Object.entries(parsed)
      .filter(([, ts]) => typeof ts === "number" && now - ts < oneDay)
      .map(([key]) => key);
    return new Set(keys);
  } catch {
    return new Set<string>();
  }
};

const writeShownKeys = (keys: string[]) => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(SHOWN_KEY_STORAGE);
    const existing = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    for (const key of keys) {
      existing[key] = now;
    }
    window.localStorage.setItem(SHOWN_KEY_STORAGE, JSON.stringify(existing));
  } catch {
    // ignore
  }
};

export const Route = createFileRoute("/_layout/learn/practice")({
  component: PracticePage,
});

function PracticePage() {
  const uiLocale = getLocale();
  const { profile, loading: profileLoading } = useLearningProfile();

  const preferredLanguage = profile?.target_language ?? "en-US";
  const [language, setLanguage] = useState(preferredLanguage);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [sessionShownKeys, setSessionShownKeys] = useState<string[]>([]);
  const dayShownKeys = useMemo(() => Array.from(readDayShownKeys()), [refreshNonce]);

  useEffect(() => {
    setLanguage((current) => (current ? current : preferredLanguage));
  }, [preferredLanguage]);

  const recommendationsQuery = useQuery({
    queryKey: ["practice-recommendations", language, refreshNonce],
    queryFn: async () => {
      const result = await getPracticeRecommendationsFn({
        data: {
          language,
          limit: 5,
          sessionShownKeys,
          dayShownKeys,
        },
      });
      return result.drills as PracticeRecommendation[];
    },
    enabled: Boolean(language) && profileLoading === false,
  });

  useEffect(() => {
    const drills = recommendationsQuery.data ?? [];
    if (drills.length === 0) return;
    const keys = drills.map((drill) => drill.drillKey);
    writeShownKeys(keys);
    setSessionShownKeys((prev) => [...new Set([...prev, ...keys])]);
  }, [recommendationsQuery.data]);

  const refreshSet = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="type-h1 text-foreground">{m.practice()}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {m.practice_description()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refreshSet}
              disabled={recommendationsQuery.isFetching}
              className="h-9 rounded-lg border-border bg-background px-4"
            >
              {m.practice_refresh_set()}
            </Button>
          </div>
        </div>

        {recommendationsQuery.isLoading ? (
          <Loading text={m.practice_loading()} className="py-14" />
        ) : recommendationsQuery.isError ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {m.practice_error_load()}
          </div>
        ) : (recommendationsQuery.data?.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-muted/10 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-foreground">
              {m.practice_empty_title()}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {m.practice_empty_body()}
            </p>
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.assign("/live");
                }}
                className="h-9 rounded-lg border-border bg-background px-4"
              >
                {m.practice_go_live()}
              </Button>
            </div>
          </div>
        ) : (
          <PracticeDrillList
            drills={recommendationsQuery.data ?? []}
            uiLocale={uiLocale}
            language={language}
          />
        )}
      </div>
    </div>
  );
}

type PracticeDrillListProps = {
  drills: PracticeRecommendation[];
  uiLocale: string;
  language: string;
};

function PracticeDrillList({ drills, uiLocale, language }: PracticeDrillListProps) {
  const [attemptState, setAttemptState] = useState<Record<string, DrillAttemptState>>({});

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingKeyRef = useRef<string | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRecorder = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorderRef.current = null;

    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamRef.current = null;
    chunksRef.current = [];
    recordingKeyRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearRecorder();
      setAttemptState((prev) => {
        for (const key of Object.keys(prev)) {
          const url = prev[key].audioUrl;
          if (url) URL.revokeObjectURL(url);
        }
        return {};
      });
    };
  }, [clearRecorder]);

  const setState = useCallback((key: string, next: Partial<DrillAttemptState>) => {
    setAttemptState((prev) => {
      const current = prev[key] ?? { status: "idle" as const };
      const audioUrl = next.audioUrl ?? current.audioUrl;
      const score = next.score ?? current.score;
      const error = next.error ?? current.error;
      const status = next.status ?? current.status;
      const deltaOverall =
        next.deltaOverall !== undefined ? next.deltaOverall : current.deltaOverall;
      return { ...prev, [key]: { status, audioUrl, score, error, deltaOverall } };
    });
  }, []);

  const decodeBlobToWav = useCallback(async (blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      const channelData = decoded.getChannelData(0);
      const wavBuffer = float32ToWavBuffer(channelData, decoded.sampleRate, 1);
      const base64 = arrayBufferToBase64(wavBuffer);
      const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
      return { mimeType: "audio/wav", data: base64, audioUrl: URL.createObjectURL(wavBlob) };
    } finally {
      await audioContext.close().catch(() => {
        // ignore
      });
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(
    async (drill: PracticeRecommendation) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setState(drill.drillKey, {
          status: "error",
          error: "getUserMedia is not available in this environment.",
        });
        return;
      }

      const existing = recorderRef.current;
      if (existing && existing.state !== "inactive") {
        existing.stop();
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
        recordingKeyRef.current = drill.drillKey;

        setState(drill.drillKey, {
          status: "recording",
          score: undefined,
          error: undefined,
          deltaOverall: null,
        });

        recorder.addEventListener("dataavailable", (event) => {
          if (!event.data || event.data.size === 0) return;
          chunksRef.current.push(event.data);
        });

        recorder.addEventListener("stop", async () => {
          const drillKey = recordingKeyRef.current;
          const recordedChunks = [...chunksRef.current];
          const recordedMimeType = recorder.mimeType || "audio/webm";
          clearRecorder();
          if (!drillKey) return;

          setState(drillKey, { status: "scoring" });

          try {
            const blob = new Blob(recordedChunks, { type: recordedMimeType });
            const wav = await decodeBlobToWav(blob);

            const previousOverall =
              attemptState[drillKey]?.score?.overall ?? drill.stats.lastOverall;

            const result = await scoreShadowingAttemptFn({
              data: {
                uiLocale,
                language,
                targetText: drill.targetText,
                liveSessionId: drill.sourceLiveSessionId,
                drillId: drill.drillKey,
                audio: { mimeType: wav.mimeType, data: wav.data },
              },
            });

            const delta =
              typeof previousOverall === "number" ? result.overall - previousOverall : null;

            setState(drillKey, {
              status: "done",
              audioUrl: wav.audioUrl,
              score: result,
              deltaOverall: delta,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setState(drillKey, { status: "error", error: message });
          }
        });

        recorder.start();
        autoStopTimerRef.current = setTimeout(() => {
          const current = recorderRef.current;
          if (!current || current.state === "inactive") return;
          current.stop();
        }, 8000);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState(drill.drillKey, { status: "error", error: message });
        clearRecorder();
      }
    },
    [attemptState, clearRecorder, decodeBlobToWav, language, setState, uiLocale],
  );

  return (
    <div className="space-y-4">
      {drills.map((drill) => {
        const state = attemptState[drill.drillKey] ?? { status: "idle" as const };
        const isRecording = state.status === "recording";
        const isScoring = state.status === "scoring";
        const latestOverall = state.score?.overall;
        const displayedLast = latestOverall ?? drill.stats.lastOverall;
        const displayedBest =
          typeof latestOverall === "number"
            ? typeof drill.stats.bestOverall === "number"
              ? Math.max(drill.stats.bestOverall, latestOverall)
              : latestOverall
            : drill.stats.bestOverall;

        return (
          <div
            key={drill.drillKey}
            className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {m.practice_today()}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {drill.title ?? m.practice_drill_default_title()}
                </p>
                {drill.why && <p className="text-xs text-muted-foreground">{drill.why}</p>}
                {drill.tip && <p className="text-xs text-muted-foreground">{drill.tip}</p>}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right text-xs text-muted-foreground">
                  <p>
                    {m.practice_best_short()}{" "}
                    <span className="font-semibold text-foreground">
                      {displayedBest ?? "--"}
                    </span>
                  </p>
                  <p>
                    {m.practice_last_short()}{" "}
                    <span className="font-semibold text-foreground">
                      {displayedLast ?? "--"}
                    </span>
                  </p>
                </div>
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
                  className="h-9 rounded-lg px-4"
                >
                  {isRecording ? m.live_practice_stop() : m.live_practice_record()}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground">
              {drill.targetText}
            </div>

            {state.status === "scoring" && (
              <p className="text-xs text-muted-foreground">{m.live_practice_scoring()}</p>
            )}

            {state.status === "error" && state.error && (
              <p className="text-xs text-destructive">{state.error}</p>
            )}

            {state.status === "done" && state.score && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {m.live_practice_score_overall()} {state.score.overall}
                  </span>
                  {typeof state.deltaOverall === "number" && (
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        state.deltaOverall >= 0 ? "text-emerald-600" : "text-destructive",
                      )}
                    >
                      {state.deltaOverall >= 0 ? "+" : ""}
                      {state.deltaOverall}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{state.score.feedback}</p>
                <p className="text-xs text-muted-foreground">
                  {m.live_practice_next_focus()}: {state.score.next_focus}
                </p>
                {state.audioUrl && (
                  <audio className="w-full" controls preload="metadata" src={state.audioUrl} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
