import { useCallback, useEffect, useMemo, useRef } from "react";
import type { GeminiLiveStatus, Message } from "~/lib/gemini/useGeminiLive";

export type LiveSchedulerAction = "SILENCE_SOFT" | "SILENCE_HARD";

export type LiveSchedulerInjectedCue = {
  action: LiveSchedulerAction;
  actionId: string;
  assistantTurnId: string | null;
  ts: string;
  text: string;
  payload: unknown;
};

type SchedulerAction = LiveSchedulerAction;

type LiveSchedulerSessionContext = {
  clientSessionId: string | null;
  liveSessionId: string | null;
};

type SchedulerThresholds = {
  scale: number;
  softDelayMs: number;
  hardDelayMs: number;
  cooldownMs: number;
};

type SchedulerSignalsSnapshot = {
  assistantTurnId: string | null;
  assistantTurnCompleteAt: string | null;
  silenceMs: number | null;
  userLastSpeechStartAt: string | null;
  userLastSpeechEndAt: string | null;
  userSpeechSecondsTotal: number;
  dispatchCount: number;
};

type SchedulerLogEntry = {
  ts: string;
  event: string;
  context: LiveSchedulerSessionContext;
  payload?: Record<string, unknown>;
};

type LiveSchedulerDebug = {
  getBuffer: () => SchedulerLogEntry[];
  dump: () => string;
  getState: () => SchedulerSignalsSnapshot;
};

type UseLiveSchedulerOptions = {
  status: GeminiLiveStatus;
  isReadOnlyHistory: boolean;
  isRecording: boolean;
  isPaused: boolean;
  messages: Message[];
  proactivityScaleRef: React.MutableRefObject<number>;
  sendHiddenTurn: (text: string) => void;
  stopOutput: () => void;
  getSessionContext: () => LiveSchedulerSessionContext;
  onCueInjected?: (cue: LiveSchedulerInjectedCue) => void;
};

const LOG_BUFFER_LIMIT = 300;
const INPUT_SAMPLE_RATE = 16000;

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatIso = (ms: number) => new Date(ms).toISOString();

const getLastAssistantMessage = (messages: Message[]) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "assistant") return message;
  }
  return null;
};

const hasStreamingAssistant = (messages: Message[]) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "assistant" && message.isStreaming) return true;
  }
  return false;
};

const findLastCompletedAssistant = (messages: Message[]) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    if (message.isStreaming) continue;
    if (!message.content.trim()) continue;
    return message;
  }
  return null;
};

export function useLiveScheduler({
  status,
  isReadOnlyHistory,
  isRecording,
  isPaused,
  messages,
  proactivityScaleRef,
  sendHiddenTurn,
  stopOutput,
  getSessionContext,
  onCueInjected,
}: UseLiveSchedulerOptions) {
  const canSchedule = status === "connected" && !isReadOnlyHistory && isRecording && !isPaused;

  const logBufferRef = useRef<SchedulerLogEntry[]>([]);
  const assistantTurnIdRef = useRef<string | null>(null);
  const assistantTurnCompleteAtRef = useRef<number | null>(null);
  const userLastSpeechStartAtRef = useRef<number | null>(null);
  const userLastSpeechEndAtRef = useRef<number | null>(null);
  const userSpeechSecondsTotalRef = useRef(0);
  const dispatchCountRef = useRef(0);

  const timersRef = useRef<{
    softTimer: ReturnType<typeof setTimeout> | null;
    hardTimer: ReturnType<typeof setTimeout> | null;
  }>({ softTimer: null, hardTimer: null });

  const dispatchedForTurnRef = useRef<{
    assistantTurnId: string | null;
    soft: boolean;
    hard: boolean;
    lastDispatchAt: number;
  }>({ assistantTurnId: null, soft: false, hard: false, lastDispatchAt: 0 });

  const pendingActionRef = useRef<{
    actionId: string;
    action: SchedulerAction;
    dispatchedAt: number;
  } | null>(null);

  const getStateSnapshot = useCallback((): SchedulerSignalsSnapshot => {
    const now = Date.now();
    const assistantTurnCompleteAt = assistantTurnCompleteAtRef.current;
    const silenceMs =
      assistantTurnCompleteAt && !userLastSpeechStartAtRef.current
        ? now - assistantTurnCompleteAt
        : null;

    return {
      assistantTurnId: assistantTurnIdRef.current,
      assistantTurnCompleteAt: assistantTurnCompleteAt ? formatIso(assistantTurnCompleteAt) : null,
      silenceMs,
      userLastSpeechStartAt: userLastSpeechStartAtRef.current
        ? formatIso(userLastSpeechStartAtRef.current)
        : null,
      userLastSpeechEndAt: userLastSpeechEndAtRef.current
        ? formatIso(userLastSpeechEndAtRef.current)
        : null,
      userSpeechSecondsTotal: userSpeechSecondsTotalRef.current,
      dispatchCount: dispatchCountRef.current,
    };
  }, []);

  const log = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      const entry: SchedulerLogEntry = {
        ts: new Date().toISOString(),
        event,
        context: getSessionContext(),
        payload,
      };
      logBufferRef.current = [...logBufferRef.current, entry].slice(-LOG_BUFFER_LIMIT);
      console.debug("[LiveScheduler]", entry);
    },
    [getSessionContext],
  );

  const computeThresholds = useCallback((): SchedulerThresholds => {
    const rawScale = proactivityScaleRef.current;
    const scale = clampNumber(rawScale, 0.5, 2.5);
    const softDelayMs = clampNumber(Math.round(2500 * scale), 1200, 15000);
    const hardDelayMs = clampNumber(Math.round(6000 * scale), softDelayMs + 1200, 30000);
    const cooldownMs = clampNumber(Math.round(12000 * scale), 6000, 60000);
    return { scale, softDelayMs, hardDelayMs, cooldownMs };
  }, [proactivityScaleRef]);

  const clearTimers = useCallback(() => {
    const softTimer = timersRef.current.softTimer;
    const hardTimer = timersRef.current.hardTimer;
    if (softTimer) clearTimeout(softTimer);
    if (hardTimer) clearTimeout(hardTimer);
    timersRef.current.softTimer = null;
    timersRef.current.hardTimer = null;
  }, []);

  const dispatchSilenceAction = useCallback(
    (action: SchedulerAction, reason: string) => {
      if (!canSchedule) return;
      if (hasStreamingAssistant(messages)) {
        log("dispatch_skipped_assistant_streaming", { action, reason });
        return;
      }

      const now = Date.now();
      const assistantTurnId = assistantTurnIdRef.current;
      const assistantTurnCompleteAt = assistantTurnCompleteAtRef.current;
      if (!assistantTurnId || !assistantTurnCompleteAt) return;
      if (userLastSpeechStartAtRef.current) return;

      const thresholds = computeThresholds();
      const dispatchedState = dispatchedForTurnRef.current;
      if (now - dispatchedState.lastDispatchAt < thresholds.cooldownMs) {
        log("dispatch_skipped_cooldown", {
          action,
          reason,
          cooldownMs: thresholds.cooldownMs,
          sinceLastDispatchMs: now - dispatchedState.lastDispatchAt,
        });
        return;
      }

      const actionId = crypto.randomUUID();
      const silenceMs = now - assistantTurnCompleteAt;
      const assistantLastMessage = getLastAssistantMessage(messages);

      const controlPayload = {
        action,
        action_id: actionId,
        ts: formatIso(now),
        reason,
        scale: thresholds.scale,
        thresholds: {
          soft_delay_ms: thresholds.softDelayMs,
          hard_delay_ms: thresholds.hardDelayMs,
          cooldown_ms: thresholds.cooldownMs,
        },
        signals: {
          assistant_turn_id: assistantTurnId,
          assistant_content_chars: assistantLastMessage?.content.length ?? 0,
          silence_ms: silenceMs,
          user_speech_seconds_total: userSpeechSecondsTotalRef.current,
        },
      };

      const text = `[[SCHED]] ${JSON.stringify(controlPayload)}`;
      const injectedCue: LiveSchedulerInjectedCue = {
        action,
        actionId,
        assistantTurnId,
        ts: formatIso(now),
        text,
        payload: controlPayload,
      };
      dispatchCountRef.current += 1;
      dispatchedForTurnRef.current = {
        assistantTurnId,
        soft: action === "SILENCE_SOFT" ? true : dispatchedState.soft,
        hard: action === "SILENCE_HARD" ? true : dispatchedState.hard,
        lastDispatchAt: now,
      };
      pendingActionRef.current = { actionId, action, dispatchedAt: now };

      log("dispatch_action", {
        action,
        actionId,
        assistantTurnId,
        silenceMs,
        thresholds,
        reason,
        injectedText: text,
        injectedPayload: controlPayload,
      });
      onCueInjected?.(injectedCue);
      sendHiddenTurn(text);
    },
    [canSchedule, computeThresholds, log, messages, onCueInjected, sendHiddenTurn],
  );

  const scheduleTimersForTurn = useCallback(() => {
    clearTimers();
    const assistantTurnId = assistantTurnIdRef.current;
    const assistantTurnCompleteAt = assistantTurnCompleteAtRef.current;
    if (!assistantTurnId || !assistantTurnCompleteAt) return;

    const thresholds = computeThresholds();
    log("silence_timers_scheduled", { assistantTurnId, thresholds });

    timersRef.current.softTimer = setTimeout(() => {
      const dispatched = dispatchedForTurnRef.current;
      if (dispatched.assistantTurnId !== assistantTurnId) return;
      if (dispatched.soft) return;
      dispatchSilenceAction("SILENCE_SOFT", "user_silent_after_assistant_turn");
    }, thresholds.softDelayMs);

    timersRef.current.hardTimer = setTimeout(() => {
      const dispatched = dispatchedForTurnRef.current;
      if (dispatched.assistantTurnId !== assistantTurnId) return;
      if (dispatched.hard) return;
      dispatchSilenceAction("SILENCE_HARD", "user_still_silent_after_soft_prompt");
    }, thresholds.hardDelayMs);
  }, [clearTimers, computeThresholds, dispatchSilenceAction, log]);

  const onUserSpeechStart = useCallback(() => {
    const now = Date.now();
    userLastSpeechStartAtRef.current = now;
    clearTimers();
    stopOutput();

    const assistantTurnCompleteAt = assistantTurnCompleteAtRef.current;
    const latencyMs = assistantTurnCompleteAt ? now - assistantTurnCompleteAt : null;
    log("user_speech_start", { latencyMs });
  }, [clearTimers, log, stopOutput]);

  const onUserSpeechEnd = useCallback(
    (chunk: { pcm: Float32Array; sampleCount: number }) => {
      const now = Date.now();
      userLastSpeechEndAtRef.current = now;
      const seconds = chunk.sampleCount / INPUT_SAMPLE_RATE;
      userSpeechSecondsTotalRef.current += seconds;
      log("user_speech_end", { seconds, sampleCount: chunk.sampleCount });
    },
    [log],
  );

  useEffect(() => {
    if (!canSchedule) {
      clearTimers();
      pendingActionRef.current = null;
      return;
    }

    const completed = findLastCompletedAssistant(messages);
    if (!completed) return;

    if (assistantTurnIdRef.current === completed.id) return;

    assistantTurnIdRef.current = completed.id;
    assistantTurnCompleteAtRef.current = Date.now();
    userLastSpeechStartAtRef.current = null;
    dispatchedForTurnRef.current = {
      assistantTurnId: completed.id,
      soft: false,
      hard: false,
      lastDispatchAt: dispatchedForTurnRef.current.lastDispatchAt,
    };

    log("assistant_turn_complete", {
      assistantTurnId: completed.id,
      contentChars: completed.content.length,
    });
    scheduleTimersForTurn();
  }, [canSchedule, clearTimers, log, messages, scheduleTimersForTurn]);

  useEffect(() => {
    if (!canSchedule) return;

    const pending = pendingActionRef.current;
    if (!pending) return;

    const lastAssistant = messages[messages.length - 1];
    if (!lastAssistant || lastAssistant.role !== "assistant") return;
    if (!lastAssistant.isStreaming) return;

    const elapsedMs = Date.now() - pending.dispatchedAt;
    if (elapsedMs > 15000) return;

    log("assistant_response_started", {
      action: pending.action,
      actionId: pending.actionId,
      elapsedMs,
      assistantMessageId: lastAssistant.id,
    });
    pendingActionRef.current = null;
  }, [canSchedule, log, messages]);

  const debug = useMemo<LiveSchedulerDebug>(
    () => ({
      getBuffer: () => logBufferRef.current,
      dump: () => JSON.stringify(logBufferRef.current, null, 2),
      getState: () => getStateSnapshot(),
    }),
    [getStateSnapshot],
  );

  return {
    onUserSpeechStart,
    onUserSpeechEnd,
    debug,
  };
}
