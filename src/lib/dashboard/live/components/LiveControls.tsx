import { Loader2, Mic, MicOff, Phone, PhoneOff, Send } from "lucide-react";
import { memo, useCallback, type KeyboardEvent } from "react";
import { Button } from "~/lib/components/ui/button";
import { Textarea } from "~/lib/components/ui/textarea";
import { PersonaSelector } from "~/lib/dashboard/live/components/PersonaSelector";
import { VoiceSelector } from "~/lib/dashboard/live/components/LiveVoiceSession";
import { type Persona } from "~/lib/dashboard/live/constants";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

type LiveControlsProps = {
  selectedPersonaId: string;
  onSelectPersona: (persona: Persona) => void;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  isActiveSession: boolean;
  isConnecting: boolean;
  isReadOnlyHistory: boolean;
  isRecording: boolean;
  isPaused: boolean;
  isStartDisabled: boolean;
  onToggleMute: () => void;
  onToggleSession: () => void;
  textInput: string;
  onTextInputChange: (value: string) => void;
  onSendMessage: () => void;
  canSendText: boolean;
  className?: string;
};

export const LiveControls = memo(function LiveControls({
  selectedPersonaId,
  onSelectPersona,
  selectedVoice,
  onVoiceChange,
  isActiveSession,
  isConnecting,
  isReadOnlyHistory,
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
  const statusLabel = isConnecting
    ? m.live_status_connecting()
    : isActiveSession
      ? isPaused
        ? m.live_status_paused()
        : m.live_status_live()
      : m.live_status_offline();
  const statusTone =
    isActiveSession && !isPaused
      ? "bg-muted/70 text-foreground border-border/60"
      : "bg-muted/70 text-muted-foreground border-border/60";
  const messagePlaceholder = isActiveSession
    ? m.live_message_placeholder_active()
    : m.live_empty_prompt();
  const callButtonClassName = cn(
    "h-10 min-w-[150px] px-5 text-sm font-semibold",
    isActiveSession
      ? "text-destructive"
      : "bg-foreground text-background hover:bg-foreground/90",
  );

  return (
    <div
      className={cn(
        "shrink-0 rounded-2xl border border-border/60 bg-background px-4 py-3",
        "z-20 flex flex-col gap-3 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <PersonaSelector
            selectedId={selectedPersonaId}
            onSelect={onSelectPersona}
            className="w-[180px] h-9"
          />
          <VoiceSelector
            value={selectedVoice}
            onValueChange={onVoiceChange}
            disabled={isActiveSession || isConnecting || isReadOnlyHistory}
            className="w-[140px] h-9"
          />
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold uppercase",
              "tracking-wide",
              statusTone,
            )}
          >
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isActiveSession && !isReadOnlyHistory && (
            <Button
              size="sm"
              variant="outline"
              aria-pressed={isRecording}
              className="h-9 px-3 text-xs font-medium"
              onClick={onToggleMute}
            >
              {isRecording ? (
                <>
                  <Mic aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                  {m.live_mute()}
                </>
              ) : (
                <>
                  <MicOff aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                  {m.live_unmute()}
                </>
              )}
            </Button>
          )}

          <Button
            size="default"
            variant={isActiveSession ? "outline" : "default"}
            className={callButtonClassName}
            onClick={onToggleSession}
            disabled={isStartDisabled}
          >
            {isActiveSession ? (
              <>
                <PhoneOff aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                {m.live_end_call()}
              </>
            ) : (
              <>
                {isConnecting ? (
                  <Loader2
                    aria-hidden="true"
                    className="mr-2 h-3.5 w-3.5"
                  />
                ) : (
                  <Phone aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
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
            "min-h-[36px] max-h-[120px] py-2 px-3 rounded-2xl resize-none text-sm",
          )}
        />
      </div>
      <Button
        size="sm"
        type="button"
        aria-label={m.live_send_message_label()}
        disabled={!canSend}
        onClick={onSend}
        className="h-9 w-9 p-0 shrink-0"
      >
        <Send aria-hidden="true" className="h-4 w-4" />
      </Button>
    </div>
  );
});
