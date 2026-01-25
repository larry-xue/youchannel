import { History, Loader2, Mic, MicOff, Phone, PhoneOff, Send } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Button } from "~/lib/components/ui/button";
import { Textarea } from "~/lib/components/ui/textarea";
import { VoiceSelector } from "~/lib/dashboard/live/components/LiveVoiceSession";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

type LiveControlsProps = {
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  isActiveSession: boolean;
  isConnecting: boolean;
  isReadOnlyHistory: boolean;
  isViewingHistory: boolean;
  isRecording: boolean;
  isPaused: boolean;
  isStartDisabled: boolean;
  onToggleMute: () => void;
  onToggleSession: () => void | Promise<void>;
  textInput: string;
  onTextInputChange: (value: string) => void;
  onSendMessage: () => void;
  canSendText: boolean;
  className?: string;
};

export const LiveControls = memo(function LiveControls({
  selectedVoice,
  onVoiceChange,
  isActiveSession,
  isConnecting,
  isReadOnlyHistory,
  isViewingHistory,
  isRecording,
  isPaused,
  isStartDisabled,
  onToggleMute,
  onToggleSession,
  textInput,
  onTextInputChange,
  onSendMessage,
  canSendText,
  className,
}: LiveControlsProps) {
  const [isEndingCall, setIsEndingCall] = useState(false);
  const isEndingCallRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleToggleSession = useCallback(() => {
    if (isActiveSession) {
      if (isEndingCallRef.current) return;
      isEndingCallRef.current = true;
      setIsEndingCall(true);
    }

    void (async () => {
      try {
        await onToggleSession();
      } finally {
        isEndingCallRef.current = false;
        if (isMountedRef.current) {
          setIsEndingCall(false);
        }
      }
    })();
  }, [isActiveSession, onToggleSession]);

  const statusLabel = isConnecting
    ? m.live_status_connecting()
    : isActiveSession
      ? isPaused
        ? m.live_status_paused()
        : m.live_status_live()
      : m.live_status_offline();

  const statusDotClassName = isConnecting
    ? "bg-primary motion-safe:animate-pulse motion-reduce:animate-none"
    : isActiveSession && !isPaused
      ? "bg-[color:var(--brand-green)]"
      : isActiveSession && isPaused
        ? "bg-[color:var(--brand-blue)]"
        : "bg-muted-foreground/60";

  const statusTone =
    isActiveSession && !isPaused ? "text-foreground" : "text-muted-foreground";
  const messagePlaceholder = isActiveSession
    ? m.live_message_placeholder_active()
    : m.live_empty_prompt();

  return (
    <div
      className={cn(
        "shrink-0 border border-border bg-background px-4 py-3",
        "z-20 flex flex-col gap-3",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <VoiceSelector
            value={selectedVoice}
            onValueChange={onVoiceChange}
            disabled={isActiveSession || isConnecting || isReadOnlyHistory}
            className="h-10 w-full sm:w-[180px]"
          />
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-border",
              "bg-muted/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
              statusTone,
            )}
          >
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 rounded-full", statusDotClassName)}
            />
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isActiveSession && !isReadOnlyHistory && (
            <Button
              size="icon"
              variant="outline"
              aria-pressed={isRecording}
              className="h-10 w-10 rounded-md border-border bg-background"
              onClick={onToggleMute}
              title={isRecording ? m.live_mute() : m.live_unmute()}
            >
              {isRecording ? (
                <>
                  <Mic aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">{m.live_mute()}</span>
                </>
              ) : (
                <>
                  <MicOff aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">{m.live_unmute()}</span>
                </>
              )}
            </Button>
          )}

          <Button
            size="lg"
            variant={isActiveSession ? "outline" : "default"}
            className={cn(
              "h-10 w-full justify-center rounded-md px-6 text-sm font-semibold sm:w-auto",
              isActiveSession &&
                "border-destructive/30 text-destructive hover:bg-destructive/10",
            )}
            aria-busy={isActiveSession && isEndingCall}
            onClick={handleToggleSession}
            disabled={isStartDisabled || (isActiveSession && isEndingCall)}
          >
            {isActiveSession ? (
              <>
                {isEndingCall ? (
                  <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PhoneOff aria-hidden="true" className="mr-2 h-4 w-4" />
                )}
                {m.live_end_call()}
              </>
            ) : (
              <>
                {isConnecting ? (
                  <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {isViewingHistory ? (
                      <History aria-hidden="true" className="mr-2 h-4 w-4" />
                    ) : (
                      <Phone aria-hidden="true" className="mr-2 h-4 w-4" />
                    )}
                  </>
                )}
                {isConnecting ? m.live_status_connecting() : m.live_start_call()}
              </>
            )}
          </Button>
        </div>
      </div>

      <MessageComposer
        value={textInput}
        onValueChange={onTextInputChange}
        onSend={onSendMessage}
        canSend={canSendText}
        isDisabled={!isActiveSession || isReadOnlyHistory}
        placeholder={messagePlaceholder}
      />
    </div>
  );
});

type MessageComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  isDisabled: boolean;
  placeholder: string;
};

const MessageComposer = memo(function MessageComposer({
  value,
  onValueChange,
  onSend,
  canSend,
  isDisabled,
  placeholder,
}: MessageComposerProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (canSend) onSend();
      }
    },
    [canSend, onSend],
  );

  return (
    <div className="flex items-end gap-2">
      <div className="relative flex-1">
        <Textarea
          value={value}
          name="live_message"
          autoComplete="off"
          aria-label={m.live_message_input_label()}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          className={cn(
            "min-h-[44px] max-h-[140px] resize-none rounded-md border-border bg-background px-4 py-3 text-sm leading-relaxed shadow-none",
            "focus-visible:ring-ring/40 focus-visible:ring-[3px]",
          )}
        />
      </div>
      <Button
        size="sm"
        type="button"
        aria-label={m.live_send_message_label()}
        disabled={!canSend || isDisabled}
        onClick={onSend}
        className="h-11 w-11 shrink-0 rounded-md p-0"
      >
        <Send aria-hidden="true" className="h-4 w-4" />
      </Button>
    </div>
  );
});
