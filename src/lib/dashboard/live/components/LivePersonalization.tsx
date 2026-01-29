import { GoogleGenAI } from "@google/genai";
import { Info, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "~/lib/components/ui/alert";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Card, CardContent } from "~/lib/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/lib/components/ui/dialog";
import { Progress } from "~/lib/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/lib/components/ui/tooltip";
import { createLiveUserProfileVersionFn } from "~/lib/dashboard/live/profile";
import { getGeminiToken } from "~/lib/gemini/actions";
import { useWavRecorder, type WavRecording } from "~/lib/gemini/live/useWavRecorder";
import { decode } from "~/lib/gemini/utils";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";
import { getLocale } from "~/paraglide/runtime";

const PROFILE_MODEL = "gemini-3-flash-preview";

type GeoState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "denied" }
  | { status: "error"; message: string }
  | {
      status: "granted";
      coords: { lat: number; lng: number; accuracyMeters: number | null };
    };

const roundNumber = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const formatSeconds = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const generatedProfileSchema = z
  .object({
    manual_text: z.string().min(1).max(20000),
    data: z.record(z.unknown()).optional().default({}),
    source: z.record(z.unknown()).optional().default({}),
  })
  .passthrough();

const getTextFromResponse = (response: unknown) => {
  const value = (response as { text?: unknown } | null)?.text;
  if (typeof value === "function") {
    const asFn = value as () => string;
    return asFn();
  }
  return typeof value === "string" ? value : "";
};

type LivePersonalizationProps = {
  disabled?: boolean;
  profileVersion?: number | null;
  onSaved?: () => void;
  className?: string;
};

export function LivePersonalization({
  disabled = false,
  profileVersion = null,
  onSaved,
  className,
}: LivePersonalizationProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [recording, setRecording] = useState<WavRecording | null>(null);
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [isGenerating, setIsGenerating] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);

  const { isRecording, start, stop } = useWavRecorder();
  const recordingStartedAtRef = useRef<number | null>(null);

  const uiLocale = getLocale();
  const deviceTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const canGenerate = Boolean(recording) && !isGenerating;

  const recordingPreviewUrl = useMemo(() => {
    if (!recording) return null;
    if (typeof window === "undefined") return null;

    try {
      const bytes = decode(recording.audio.data);
      const blob = new Blob([bytes], { type: recording.audio.mimeType });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.warn("[LivePersonalization] Failed to build audio preview URL", err);
      return null;
    }
  }, [recording]);

  useEffect(() => {
    return () => {
      if (!recordingPreviewUrl) return;
      URL.revokeObjectURL(recordingPreviewUrl);
    };
  }, [recordingPreviewUrl]);

  useEffect(() => {
    if (!isRecording) {
      recordingStartedAtRef.current = null;
      setRecordingElapsedMs(0);
      return;
    }

    const startedAt = Date.now();
    recordingStartedAtRef.current = startedAt;
    setRecordingElapsedMs(0);

    const timer = window.setInterval(() => {
      setRecordingElapsedMs(Date.now() - startedAt);
    }, 200);

    return () => {
      window.clearInterval(timer);
    };
  }, [isRecording]);

  const resetForm = useCallback(() => {
    if (isGenerating) return;

    try {
      if (isRecording) stop();
    } catch (err) {
      console.warn("[LivePersonalization] Failed to stop recording during reset", err);
    }

    setInlineError(null);
    setRecording(null);
    setGeo({ status: "idle" });
    setStep(1);
  }, [isGenerating, isRecording, stop]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        resetForm();
      } else {
        setInlineError(null);
        setStep(1);
      }
    },
    [resetForm],
  );

  const toggleRecording = useCallback(async () => {
    if (isGenerating) return;
    if (!isRecording) {
      setInlineError(null);
      setRecording(null);
      try {
        await start();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : m.live_personalize_error();
        setInlineError(message);
        toast.error(message);
      }
      return;
    }

    const result = stop();
    if (result) {
      setRecording(result);
    }
  }, [isGenerating, isRecording, start, stop]);

  const goBack = useCallback(() => {
    if (isGenerating) return;
    setInlineError(null);
    setStep((prev) => Math.max(1, prev - 1));
  }, [isGenerating]);

  const goNext = useCallback(() => {
    if (isGenerating) return;
    setInlineError(null);
    setStep((prev) => Math.min(3, prev + 1));
  }, [isGenerating]);

  const requestGeo = useCallback(async () => {
    if (isGenerating) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeo({ status: "error", message: "Geolocation is not available." });
      return;
    }

    setInlineError(null);
    setGeo({ status: "requesting" });

    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      });
    }).catch((err: unknown) => {
      if (typeof err === "object" && err && "code" in err) {
        const code = (err as { code?: unknown }).code;
        if (code === 1) {
          setGeo({ status: "denied" });
          return null;
        }
      }
      const message = err instanceof Error ? err.message : "Failed to get location.";
      setGeo({ status: "error", message });
      return null;
    });

    if (!position) return;

    setGeo({
      status: "granted",
      coords: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyMeters:
          typeof position.coords.accuracy === "number" ? position.coords.accuracy : null,
      },
    });
  }, [isGenerating]);

  const generateAndSave = useCallback(async () => {
    if (!recording) return;
    if (isGenerating) return;

    setIsGenerating(true);
    setInlineError(null);

    try {
      const { token } = await getGeminiToken();
      if (!token) throw new Error("Missing Gemini token");

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const geoPayload =
        geo.status === "granted"
          ? {
              lat: roundNumber(geo.coords.lat, 3),
              lng: roundNumber(geo.coords.lng, 3),
              accuracy_m: geo.coords.accuracyMeters,
            }
          : null;

      const prompt = `You are generating a user profile used as SYSTEM CONTEXT for a realtime voice conversation (Gemini Live).

Input:
- UI locale: ${uiLocale}
- Device time zone (IANA): ${deviceTimeZone}
- Optional approximate coordinates (rounded): ${geoPayload ? JSON.stringify(geoPayload) : "null"}

Tasks:
1) Transcribe the audio and infer the user's conversation preferences and learning goals.
2) If coordinates are provided, you MAY use the googleSearch tool to infer:
   country, region/state, city (best effort). If uncertain, use null.

Output STRICT JSON only (no markdown), with this shape:
{
  "manual_text": "string",
  "data": {
    "ui_locale": "string",
    "device_time_zone": "string",
    "geo": {
      "country": "string|null",
      "region": "string|null",
      "city": "string|null",
      "time_zone": "string",
      "captured_at": "string (ISO)"
    }
  },
  "source": {}
}

Rules:
- NEVER include raw coordinates in the output.
- Do NOT include the full transcript in the output.
- manual_text must be concise (max ~500 words) and written in English.
- Prefer stable preferences (topics, correction style, pacing, tone) and avoid PII.
`;

      const response = await ai.models.generateContent({
        model: PROFILE_MODEL,
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: recording.audio.mimeType,
                  data: recording.audio.data,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }],
        },
      });

      const responseText = getTextFromResponse(response);
      const parsedJson = JSON.parse(responseText);
      const parsed = generatedProfileSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new Error("Failed to parse Gemini profile output");
      }

      const source = {
        ...parsed.data.source,
        model: PROFILE_MODEL,
        generated_at: new Date().toISOString(),
        input_audio_ms: recording.durationMs,
        geo_status: geo.status,
      };

      await createLiveUserProfileVersionFn({
        data: {
          manualText: parsed.data.manual_text,
          data: parsed.data.data,
          source,
        },
      });

      try {
        window.localStorage.setItem("live.personalization_hint_seen", "1");
      } catch (err) {
        console.warn("[LivePersonalization] Failed to persist hint flag", err);
      }

      toast.success(m.live_personalize_success());
      onSaved?.();
      setOpen(false);
    } catch (err: unknown) {
      console.error("[LivePersonalization] Failed to generate profile", err);
      const message = err instanceof Error ? err.message : m.live_personalize_error();
      setInlineError(message);
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  }, [deviceTimeZone, geo, isGenerating, onSaved, recording, uiLocale]);

  const geoLabel = useMemo(() => {
    switch (geo.status) {
      case "idle":
        return m.live_personalize_geo_idle();
      case "requesting":
        return m.live_personalize_geo_requesting();
      case "granted":
        return m.live_personalize_geo_granted();
      case "denied":
        return m.live_personalize_geo_denied();
      case "error":
        return m.live_personalize_geo_error();
    }
  }, [geo.status]);

  const recordingSeconds = useMemo(
    () => Math.max(1, Math.round(recordingElapsedMs / 1000)),
    [recordingElapsedMs],
  );

  const recordingProgress = useMemo(() => {
    const maxMs = 40_000;
    return Math.min(100, Math.round((recordingElapsedMs / maxMs) * 100));
  }, [recordingElapsedMs]);

  const buttonLabel = m.live_personalize_button();
  const hasProfile = typeof profileVersion === "number" && profileVersion > 0;
  const totalSteps = 3;
  const stepLabel = m.live_personalize_step_label({ current: step, total: totalSteps });
  const canGoNext =
    step === 1 ? Boolean(recording) && !isRecording : step === 2 ? true : canGenerate;

  return (
    <div className={cn("pointer-events-auto", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={buttonLabel}
            onClick={() => handleOpenChange(true)}
            className={cn(
              "h-10 w-10 rounded-md border-border bg-background",
              "shadow-xs hover:bg-accent sm:w-auto sm:px-3",
            )}
          >
            <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" />
            <span className="sr-only">{buttonLabel}</span>
            <span className="hidden sm:inline">{buttonLabel}</span>
            {hasProfile && (
              <Badge
                variant="secondary"
                className="hidden sm:inline-flex bg-muted/50 text-muted-foreground"
              >
                v{profileVersion}
              </Badge>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {buttonLabel}
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader className="gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <DialogTitle className="type-h1 flex flex-wrap items-center gap-2">
                  <span>{m.live_personalize_title()}</span>
                  {hasProfile && <Badge variant="outline">v{profileVersion}</Badge>}
                </DialogTitle>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* <p className="text-xs font-semibold text-muted-foreground">{stepLabel}</p> */}
              <div className="flex items-center gap-2">
                {([1, 2, 3] as const).map((value) => (
                  <span
                    key={value}
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 w-10 rounded-full",
                      value <= step ? "bg-primary" : "bg-border",
                    )}
                  />
                ))}
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-4">
            <Card className="py-0">
              <CardContent className="p-0">
                <div className="p-5">
                  {step === 1 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {m.live_personalize_record_title()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {m.live_personalize_record_desc()}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          id="live-personalize-record"
                          type="button"
                          variant={isRecording ? "secondary" : "default"}
                          onClick={() => void toggleRecording()}
                          disabled={isGenerating}
                          className="min-w-40"
                        >
                          {isRecording
                            ? m.live_personalize_record_stop()
                            : m.live_personalize_record_start()}
                        </Button>

                        {isRecording && (
                          <Badge
                            variant="secondary"
                            className="tabular-nums text-muted-foreground"
                          >
                            {formatSeconds(recordingSeconds)}
                          </Badge>
                        )}

                        {!isRecording && recording && (
                          <Badge variant="secondary">
                            {m.live_personalize_recorded({
                              seconds: Math.max(
                                1,
                                Math.round(recording.durationMs / 1000),
                              ),
                            })}
                          </Badge>
                        )}
                      </div>

                      {isRecording && (
                        <div className="space-y-2">
                          <Progress value={recordingProgress} />
                        </div>
                      )}

                      {recordingPreviewUrl && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {m.live_personalize_audio_preview_label()}
                          </p>
                          <audio
                            className="w-full"
                            controls
                            preload="metadata"
                            src={recordingPreviewUrl}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {m.live_personalize_geo_title()}
                          </p>
                          <Badge variant="secondary" className="bg-secondary/60">
                            {m.live_personalize_optional_badge()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {m.live_personalize_geo_desc()}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          id="live-personalize-geo"
                          type="button"
                          variant="outline"
                          onClick={() => void requestGeo()}
                          disabled={isGenerating || geo.status === "requesting"}
                          className="min-w-40"
                        >
                          {m.live_personalize_geo_button()}
                        </Button>
                        <Badge
                          variant={
                            geo.status === "denied" || geo.status === "error"
                              ? "outline"
                              : "secondary"
                          }
                          className="bg-muted/30 text-muted-foreground"
                        >
                          {geoLabel}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {step === 3 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {m.live_personalize_save_title()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {m.live_personalize_apply_note()}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {recording && (
                          <Badge variant="secondary">
                            {m.live_personalize_recorded({
                              seconds: Math.max(
                                1,
                                Math.round(recording.durationMs / 1000),
                              ),
                            })}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="bg-muted/30 text-muted-foreground">
                          {m.live_personalize_summary_geo({ status: geoLabel })}
                        </Badge>
                      </div>

                      <Alert className="border-border bg-muted/10">
                        <Info />
                        <AlertTitle>{m.live_personalize_notice_title()}</AlertTitle>
                        <AlertDescription>
                          <ul className="list-disc space-y-1 pl-5 text-sm">
                            <li>{m.live_personalize_privacy_note()}</li>
                            <li>{m.live_personalize_apply_note()}</li>
                          </ul>
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {inlineError && (
              <Alert variant="destructive">
                <AlertTitle>{m.live_status_error()}</AlertTitle>
                <AlertDescription>
                  <p>{inlineError}</p>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={step === 1 || isGenerating}
                onClick={goBack}
                className="min-w-28"
              >
                {m.action_back()}
              </Button>

              {step < 3 ? (
                <Button
                  type="button"
                  onClick={goNext}
                  disabled={!canGoNext || isGenerating}
                  className="min-w-28"
                >
                  {m.action_next()}
                </Button>
              ) : (
                <Button
                  id="live-personalize-generate"
                  type="button"
                  onClick={() => void generateAndSave()}
                  disabled={!canGenerate}
                  className="min-w-40"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      {m.live_personalize_generating()}
                    </>
                  ) : (
                    m.live_personalize_generate()
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
