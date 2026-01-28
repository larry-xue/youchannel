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

type SchedulerThresholdContext = {
  assistantLastHasQuestion: boolean;
  userHasSpoken: boolean;
};

type SchedulerSignalsSnapshot = {
  assistantTurnId: string | null;
  assistantTurnCompleteAt: string | null;
  assistantOutputActive: boolean;
  awaitingAssistantOutputEnd: boolean;
  silenceMs: number | null;
  userLastSpeechStartAt: string | null;
  userLastSpeechEndAt: string | null;
  userSpeechSecondsTotal: number;
  userInterruptionsTotal: number;
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
  isAssistantOutputActiveRef: React.MutableRefObject<boolean>;
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

const getLastUserMessage = (messages: Message[]) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "user") return message;
  }
  return null;
};

type ScriptHint =
  | "latin"
  | "cjk"
  | "hiragana_katakana"
  | "hangul"
  | "thai"
  | "arabic"
  | "cyrillic"
  | "unknown";

const inferScriptHint = (text: string): ScriptHint => {
  for (const char of text) {
    const code = char.codePointAt(0);
    if (!code) continue;
    if (code >= 0x0e00 && code <= 0x0e7f) return "thai";
    if (code >= 0x4e00 && code <= 0x9fff) return "cjk";
    if (code >= 0x3040 && code <= 0x30ff) return "hiragana_katakana";
    if (code >= 0xac00 && code <= 0xd7af) return "hangul";
    if (code >= 0x0600 && code <= 0x06ff) return "arabic";
    if (code >= 0x0400 && code <= 0x04ff) return "cyrillic";
    if ((code >= 0x0041 && code <= 0x007a) || (code >= 0x00c0 && code <= 0x024f)) {
      return "latin";
    }
  }
  return "unknown";
};

const isNoiseLike = (text: string) => {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return true;
  if (trimmed === "." || trimmed === "..." || trimmed === "<noise>" || trimmed === "[noise]") {
    return true;
  }
  return false;
};

const hasQuestionLike = (text: string) => /[?？]/.test(text);

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
  isAssistantOutputActiveRef,
  sendHiddenTurn,
  stopOutput,
  getSessionContext,
  onCueInjected,
}: UseLiveSchedulerOptions) {
  const canSchedule = status === "connected" && !isReadOnlyHistory && isRecording && !isPaused;

  const logBufferRef = useRef<SchedulerLogEntry[]>([]);
  const assistantTurnIdRef = useRef<string | null>(null);
  const assistantTurnCompleteAtRef = useRef<number | null>(null);
  const waitingForAssistantOutputEndRef = useRef(false);
  const userLastSpeechStartAtRef = useRef<number | null>(null);
  const userLastSpeechEndAtRef = useRef<number | null>(null);
  const userSpeechSecondsTotalRef = useRef(0);
  const dispatchCountRef = useRef(0);
  const userInterruptionsRef = useRef(0);

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
      assistantOutputActive: isAssistantOutputActiveRef.current,
      awaitingAssistantOutputEnd: waitingForAssistantOutputEndRef.current,
      silenceMs,
      userLastSpeechStartAt: userLastSpeechStartAtRef.current
        ? formatIso(userLastSpeechStartAtRef.current)
        : null,
      userLastSpeechEndAt: userLastSpeechEndAtRef.current
        ? formatIso(userLastSpeechEndAtRef.current)
        : null,
      userSpeechSecondsTotal: userSpeechSecondsTotalRef.current,
      userInterruptionsTotal: userInterruptionsRef.current,
      dispatchCount: dispatchCountRef.current,
    };
  }, [isAssistantOutputActiveRef]);

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

  const computeThresholds = useCallback((context?: Partial<SchedulerThresholdContext>) => {
    const rawScale = proactivityScaleRef.current;
    const scale = clampNumber(rawScale, 0.5, 2.5);
    const assistantLastHasQuestion = context?.assistantLastHasQuestion ?? false;
    const userHasSpoken = context?.userHasSpoken ?? userSpeechSecondsTotalRef.current > 0.2;

    const questionMultiplier = assistantLastHasQuestion ? 1.6 : 1;
    const coldStartMultiplier = userHasSpoken ? 1 : 1.8;
    const delayMultiplier = questionMultiplier * coldStartMultiplier;

    const softDelayMs = clampNumber(Math.round(4500 * scale * delayMultiplier), 2000, 30000);
    const hardDelayMs = clampNumber(
      Math.round(11000 * scale * delayMultiplier),
      softDelayMs + 1200,
      45000,
    );
    const cooldownMs = clampNumber(Math.round(15000 * scale * questionMultiplier), 8000, 90000);
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

      const assistantLastMessage = getLastAssistantMessage(messages);
      const assistantLastHasQuestion = hasQuestionLike(assistantLastMessage?.content ?? "");
      const userHasSpoken = userSpeechSecondsTotalRef.current > 0.2;
      const thresholds = computeThresholds({ assistantLastHasQuestion, userHasSpoken });
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
      const lastUserMessage = getLastUserMessage(messages);
      const lastUserText = lastUserMessage?.content ?? "";
      const lastUserTextChars = lastUserText.trim().length;
      const lastUserTextScript =
        lastUserTextChars > 0 ? inferScriptHint(lastUserText) : "unknown";
      const lastUserTextNoiseLike = lastUserTextChars > 0 ? isNoiseLike(lastUserText) : true;

      let recentUserMessageCount = 0;
      let recentUserNoiseCount = 0;
      for (let i = messages.length - 1; i >= 0 && recentUserMessageCount < 8; i -= 1) {
        const message = messages[i];
        if (message.role !== "user") continue;
        recentUserMessageCount += 1;
        if (isNoiseLike(message.content)) {
          recentUserNoiseCount += 1;
        }
      }

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
          assistant_last_has_question: assistantLastHasQuestion,
          silence_ms: silenceMs,
          user_last_message_id: lastUserMessage?.id ?? null,
          user_last_text_chars: lastUserTextChars,
          user_last_text_script: lastUserTextScript,
          user_last_text_noise_like: lastUserTextNoiseLike,
          user_recent_message_count_8: recentUserMessageCount,
          user_recent_noise_count_8: recentUserNoiseCount,
          user_speech_seconds_total: userSpeechSecondsTotalRef.current,
          user_interruptions_total: userInterruptionsRef.current,
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
        assistantLastHasQuestion,
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

    const assistantMessage = messages.find((message) => message.id === assistantTurnId) ?? null;
    const assistantLastHasQuestion = assistantMessage
      ? hasQuestionLike(assistantMessage.content)
      : false;
    const userHasSpoken = userSpeechSecondsTotalRef.current > 0.2;
    const thresholds = computeThresholds({ assistantLastHasQuestion, userHasSpoken });
    log("silence_timers_scheduled", {
      assistantTurnId,
      thresholds,
      assistantLastHasQuestion,
      userHasSpoken,
    });

    timersRef.current.softTimer = setTimeout(() => {
      const dispatched = dispatchedForTurnRef.current;
      if (dispatched.assistantTurnId !== assistantTurnId) return;
      if (dispatched.soft) return;
      dispatchSilenceAction(
        "SILENCE_SOFT",
        assistantLastHasQuestion
          ? "user_silent_after_assistant_question"
          : "user_silent_after_assistant_turn",
      );
    }, thresholds.softDelayMs);

    timersRef.current.hardTimer = setTimeout(() => {
      const dispatched = dispatchedForTurnRef.current;
      if (dispatched.assistantTurnId !== assistantTurnId) return;
      if (dispatched.hard) return;
      dispatchSilenceAction("SILENCE_HARD", "user_still_silent_after_soft_prompt");
    }, thresholds.hardDelayMs);
  }, [clearTimers, computeThresholds, dispatchSilenceAction, log, messages]);

  const onUserSpeechStart = useCallback((userMessageId: string) => {
    const now = Date.now();
    userLastSpeechStartAtRef.current = now;
    clearTimers();

    const assistantWasStreaming = hasStreamingAssistant(messages);
    if (assistantWasStreaming) {
      userInterruptionsRef.current += 1;
    }

    stopOutput();

    const assistantTurnCompleteAt = assistantTurnCompleteAtRef.current;
    const latencyMs = assistantTurnCompleteAt ? now - assistantTurnCompleteAt : null;
    log("user_speech_start", {
      latencyMs,
      userMessageId,
      assistantWasStreaming,
      interruptionsTotal: userInterruptionsRef.current,
    });
  }, [clearTimers, log, messages, stopOutput]);

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

  const onAssistantOutputEnd = useCallback(() => {
    if (!canSchedule) return;

    const assistantTurnId = assistantTurnIdRef.current;
    if (!assistantTurnId) {
      log("assistant_output_end_no_turn");
      return;
    }

    if (!waitingForAssistantOutputEndRef.current) {
      log("assistant_output_end_unexpected", { assistantTurnId });
      return;
    }

    if (userLastSpeechStartAtRef.current) {
      waitingForAssistantOutputEndRef.current = false;
      log("assistant_output_end_ignored_user_speaking", { assistantTurnId });
      return;
    }

    waitingForAssistantOutputEndRef.current = false;
    assistantTurnCompleteAtRef.current = Date.now();
    log("assistant_output_end", { assistantTurnId });
    scheduleTimersForTurn();
  }, [canSchedule, log, scheduleTimersForTurn]);

  useEffect(() => {
    if (!canSchedule) {
      clearTimers();
      pendingActionRef.current = null;
      waitingForAssistantOutputEndRef.current = false;
      assistantTurnCompleteAtRef.current = null;
      return;
    }

    const completed = findLastCompletedAssistant(messages);
    if (!completed) return;

    if (assistantTurnIdRef.current === completed.id) return;

    clearTimers();
    assistantTurnIdRef.current = completed.id;
    assistantTurnCompleteAtRef.current = null;
    waitingForAssistantOutputEndRef.current = isAssistantOutputActiveRef.current;
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
      assistantOutputActive: isAssistantOutputActiveRef.current,
    });

    if (waitingForAssistantOutputEndRef.current) {
      log("assistant_silence_timers_deferred", { assistantTurnId: completed.id });
      return;
    }

    assistantTurnCompleteAtRef.current = Date.now();
    scheduleTimersForTurn();
  }, [
    canSchedule,
    clearTimers,
    isAssistantOutputActiveRef,
    log,
    messages,
    scheduleTimersForTurn,
  ]);

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
    onAssistantOutputEnd,
    debug,
  };
}
