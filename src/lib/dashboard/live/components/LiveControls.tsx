import { Loader2, Mic, MicOff, Phone, PhoneOff, Send } from "lucide-react";
import { memo, useCallback, type KeyboardEvent } from "react";
import { Button } from "~/lib/components/ui/button";
import { Card } from "~/lib/components/ui/card";
import { Textarea } from "~/lib/components/ui/textarea";
import { PersonaSelector } from "~/lib/dashboard/live/components/PersonaSelector";
import { VoiceSelector } from "~/lib/dashboard/live/components/LiveVoiceSession";
import { type Persona } from "~/lib/dashboard/live/constants";
import { cn } from "~/lib/utils";

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
  onToggleMute: () => void;
  onToggleSession: () => void;
  textInput: string;
  onTextInputChange: (value: string) => void;
  onSendMessage: () => void;
  canSendText: boolean;
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
  onToggleMute,
  onToggleSession,
  textInput,
  onTextInputChange,
  onSendMessage,
  canSendText,
}: LiveControlsProps) {
  const statusLabel = isConnecting
    ? "Connecting"
    : isActiveSession
      ? isPaused
        ? "Paused"
        : "Live"
      : "Offline";
  const statusTone = isConnecting || isPaused
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : isActiveSession
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-muted text-muted-foreground border-border/50";
  const messagePlaceholder = isActiveSession
    ? "Type a message..."
    : "Connect to start chatting...";

  return (
    <Card
      className={cn(
        "shrink-0 p-3 rounded-xl bg-card/80 backdrop-blur-xl border-border/50",
        "shadow-sm z-20 flex flex-col gap-3",
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
              className={cn(
                "h-9 px-3 text-xs font-medium",
                isRecording
                  ? "bg-background"
                  : "bg-amber-50 text-amber-600 border-amber-200",
              )}
              onClick={onToggleMute}
            >
              {isRecording ? (
                <>
                  <Mic aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                  Mute
                </>
              ) : (
                <>
                  <MicOff aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                  Unmute
                </>
              )}
            </Button>
          )}

          <Button
            size="sm"
            className={cn(
              "h-9 px-4 text-sm font-medium transition-all shadow-sm",
              isActiveSession
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-primary hover:bg-primary/90",
            )}
            onClick={onToggleSession}
            disabled={isConnecting || isReadOnlyHistory}
          >
            {isActiveSession ? (
              <>
                <PhoneOff aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                End
              </>
            ) : (
              <>
                {isConnecting ? (
                  <Loader2
                    aria-hidden="true"
                    className="mr-2 h-3.5 w-3.5 animate-spin"
                  />
                ) : (
                  <Phone aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                )}
                {isConnecting ? "Connecting..." : "Start Call"}
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
        isRecording={isRecording}
        isDisabled={!isActiveSession || isReadOnlyHistory}
        placeholder={messagePlaceholder}
      />
    </Card>
  );
});

type MessageComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  isRecording: boolean;
  isDisabled: boolean;
  placeholder: string;
};

const MessageComposer = memo(function MessageComposer({
  value,
  onValueChange,
  onSend,
  canSend,
  isRecording,
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
        {isRecording && (
          <span className="absolute top-3 left-3 flex h-2 w-2" aria-hidden="true">
            <span
              className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full",
                "bg-green-400 opacity-75",
              )}
            ></span>
            <span
              className={cn(
                "relative inline-flex rounded-full h-2 w-2 bg-green-500",
              )}
            ></span>
          </span>
        )}
        <Textarea
          value={value}
          name="live_message"
          autoComplete="off"
          aria-label="Message input"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          className={cn(
            "min-h-[36px] max-h-[120px] py-1.5 px-3 rounded-lg resize-none text-sm",
            isRecording && "pl-8",
          )}
        />
      </div>
      <Button
        size="sm"
        type="button"
        aria-label="Send message"
        disabled={!canSend}
        onClick={onSend}
        className="h-9 w-9 p-0 shrink-0"
      >
        <Send aria-hidden="true" className="h-4 w-4" />
      </Button>
    </div>
  );
});
