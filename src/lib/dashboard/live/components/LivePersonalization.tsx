import { GoogleGenAI } from "@google/genai";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { Info, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "~/lib/components/ui/alert";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/lib/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  const tourStartedRef = useRef(false);

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

  const startTour = useCallback(() => {
    if (typeof window === "undefined") return;
    if (tourStartedRef.current) return;
    tourStartedRef.current = true;

    const tour = driver({
      showProgress: true,
      steps: [
        {
          element: "#live-personalize-record",
          popover: {
            title: m.live_personalize_tour_record_title(),
            description: m.live_personalize_tour_record_desc(),
          },
        },
        {
          element: "#live-personalize-geo",
          popover: {
            title: m.live_personalize_tour_geo_title(),
            description: m.live_personalize_tour_geo_desc(),
          },
        },
        {
          element: "#live-personalize-generate",
          popover: {
            title: m.live_personalize_tour_generate_title(),
            description: m.live_personalize_tour_generate_desc(),
          },
        },
      ],
    });

    requestAnimationFrame(() => {
      tour.drive();
    });
  }, []);

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
  }, [isGenerating, isRecording, stop]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        resetForm();
        tourStartedRef.current = false;
      } else {
        setInlineError(null);
      }
    },
    [resetForm],
  );

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;

    const key = "live.personalization_tour_seen";
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch (err) {
      console.warn("[LivePersonalization] Failed to read/write tour flag", err);
    }

    const timer = window.setTimeout(() => {
      startTour();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, startTour]);

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
              "h-11 w-11 rounded-full border-border bg-background/80 backdrop-blur",
              "shadow-sm hover:bg-background sm:w-auto sm:px-4",
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
        <TooltipContent side="right" sideOffset={8}>
          {buttonLabel}
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader className="gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span>{m.live_personalize_title()}</span>
                  {hasProfile && <Badge variant="outline">v{profileVersion}</Badge>}
                </DialogTitle>
                <DialogDescription>{m.live_personalize_description()}</DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isGenerating}
                onClick={resetForm}
                className="shrink-0"
              >
                {m.action_clear()}
              </Button>
            </div>

            <Alert className="border-border bg-muted/10">
              <Info />
              <AlertTitle>{m.live_personalize_privacy_note()}</AlertTitle>
              <AlertDescription>
                <p>{m.live_personalize_tour_generate_desc()}</p>
              </AlertDescription>
            </Alert>
          </DialogHeader>

          <div className="grid gap-4">
            <Card className="py-0">
              <CardHeader className="border-b border-border pb-4">
                <CardTitle className="text-base">
                  {m.live_personalize_record_title()}
                </CardTitle>
                <CardDescription>{m.live_personalize_record_desc()}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    id="live-personalize-record"
                    type="button"
                    variant={isRecording ? "secondary" : "default"}
                    onClick={() => void toggleRecording()}
                    disabled={isGenerating}
                    className="min-w-36"
                  >
                    {isRecording
                      ? m.live_personalize_record_stop()
                      : m.live_personalize_record_start()}
                  </Button>
                  {isRecording && (
                    <p
                      aria-live="polite"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      {formatSeconds(recordingSeconds)}
                    </p>
                  )}
                  {!isRecording && recording && (
                    <Badge variant="secondary">
                      {m.live_personalize_recorded({
                        seconds: Math.max(1, Math.round(recording.durationMs / 1000)),
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
                      {m.live_voice_message()}
                    </p>
                    <audio
                      className="w-full"
                      controls
                      preload="metadata"
                      src={recordingPreviewUrl}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="py-0">
              <CardHeader className="border-b border-border pb-4">
                <CardTitle className="text-base">
                  {m.live_personalize_geo_title()}
                </CardTitle>
                <CardDescription>{m.live_personalize_geo_desc()}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    id="live-personalize-geo"
                    type="button"
                    variant="outline"
                    onClick={() => void requestGeo()}
                    disabled={isGenerating || geo.status === "requesting"}
                    className="min-w-36"
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
                  {geo.status === "granted" &&
                    typeof geo.coords.accuracyMeters === "number" &&
                    geo.coords.accuracyMeters > 0 && (
                      <p className="text-xs text-muted-foreground">
                        ~{roundNumber(geo.coords.accuracyMeters, 0)}m
                      </p>
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
          </div>

          <DialogFooter>
            <Button
              id="live-personalize-generate"
              type="button"
              onClick={() => void generateAndSave()}
              disabled={!canGenerate}
              className="min-w-40"
            >
              {isGenerating
                ? m.live_personalize_generating()
                : m.live_personalize_generate()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
