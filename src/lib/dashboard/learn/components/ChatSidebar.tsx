import { VoiceProvider, VoiceReadyState, useVoice } from "@humeai/voice-react";
import { ArrowLeft, Mic, MicOff, Sparkles, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "~/lib/components/ui/button";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import {
  getAnalysisContextWithoutCharacters,
  parseAnalysisText,
  type AnalysisCharacter,
} from "~/lib/dashboard/learn/analysis";
import { cn } from "~/lib/utils";

type ChatSidebarProps = {
  className?: string;
  analysisText?: string | null;
};

function getInitial(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

function buildSystemPrompt(character: AnalysisCharacter, context: string): string {
  const traits = character.traits.join(", ");
  const topics = character.notable_topics?.slice(0, 4).join(", ");

  const lines = [
    `You are role-playing as "${character.name}" (${character.kind}) from the analyzed video.`,
    `Stay in character at all times. Respond naturally and concisely.`,
    "",
    `## Character Profile`,
    `- **Name**: ${character.name}`,
    `- **Role**: ${character.kind}`,
    `- **Description**: ${character.description}`,
    `- **Traits**: ${traits}`,
    `- **Speaking Style**: ${character.speaking_style}`,
    topics ? `- **Topics**: ${topics}` : null,
    "",
    `## Guidelines`,
    `- Use the speaking style described above consistently.`,
    `- Only reference information from the video analysis context below.`,
    `- If unsure about something not in the analysis, say you don't know.`,
    `- Keep responses conversational and brief for voice interaction.`,
    "",
    `## Video Analysis Context`,
    context,
  ];

  return lines.filter((line) => line !== null).join("\n");
}

function ChatSidebarContent({ className, analysisText }: ChatSidebarProps) {
  const [selectedCharacterName, setSelectedCharacterName] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [pendingSystemPrompt, setPendingSystemPrompt] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const trimmedAnalysis = analysisText?.trim() ?? "";
  const parsedAnalysis = useMemo(() => parseAnalysisText(trimmedAnalysis), [trimmedAnalysis]);
  const characters = useMemo(() => parsedAnalysis?.characters ?? [], [parsedAnalysis]);
  const analysisContext = useMemo(
    () => parsedAnalysis?.contextWithoutCharacters || getAnalysisContextWithoutCharacters(trimmedAnalysis),
    [parsedAnalysis, trimmedAnalysis],
  );
  const hasContext = Boolean(analysisContext);

  const activeCharacter = useMemo(
    () => characters.find((character) => character.name === selectedCharacterName) || null,
    [characters, selectedCharacterName],
  );

  const { connect, disconnect, readyState, messages, sendSessionSettings } = useVoice();

  // Send session settings when connection is fully open
  useEffect(() => {
    if (readyState === VoiceReadyState.OPEN && pendingSystemPrompt) {
      console.log("[ChatSidebar] Sending session settings with systemPrompt");
      sendSessionSettings({ systemPrompt: pendingSystemPrompt });
      setPendingSystemPrompt(null);
    }
  }, [readyState, pendingSystemPrompt, sendSessionSettings]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages, readyState, activeCharacter?.name]);

  const fetchToken = useCallback(async () => {
    if (accessToken) return accessToken;
    setIsFetchingToken(true);
    setTokenError(null);
    try {
      const response = await fetch("/api/hume-token");
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to get access token");
      }
      const payload = (await response.json().catch(() => null)) as { accessToken?: string } | null;
      if (!payload?.accessToken) {
        throw new Error("Missing access token");
      }
      setAccessToken(payload.accessToken);
      return payload.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to fetch access token";
      setTokenError(message);
      throw error;
    } finally {
      setIsFetchingToken(false);
    }
  }, [accessToken]);

  const connectVoiceSession = useCallback(async () => {
    if (!hasContext || !activeCharacter || !analysisContext) {
      setSessionError("Select a character and ensure analysis is available.");
      return;
    }
    setSessionError(null);
    try {
      const token = await fetchToken();
      const systemPrompt = buildSystemPrompt(activeCharacter, analysisContext);

      // Store the prompt to be sent after connection is fully open
      setPendingSystemPrompt(systemPrompt);

      // Connect with config ID
      await connect({
        auth: { type: "accessToken", value: token },
        configId: import.meta.env.VITE_PUBLIC_HUME_CONFIG_ID,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start voice chat";
      setSessionError(message);
      setPendingSystemPrompt(null);
    }
  }, [activeCharacter, analysisContext, connect, fetchToken, hasContext]);

  const handleSelectCharacter = (name: string) => {
    if (readyState === VoiceReadyState.OPEN || readyState === VoiceReadyState.CONNECTING) {
      disconnect();
    }
    setSessionError(null);
    setSelectedCharacterName(name);
  };

  const handleBackToDirectory = () => {
    if (readyState === VoiceReadyState.OPEN || readyState === VoiceReadyState.CONNECTING) {
      disconnect();
    }
    setSelectedCharacterName(null);
    setSessionError(null);
  };

  const handleToggleSession = async () => {
    if (readyState === VoiceReadyState.OPEN || readyState === VoiceReadyState.CONNECTING) {
      disconnect();
      return;
    }
    await connectVoiceSession();
  };

  const canChat = Boolean(hasContext && activeCharacter);
  const noCharactersMessage = hasContext
    ? "No character profiles were returned in this analysis."
    : "Video analysis is not available yet. Generate analysis to enable character chat.";
  const transcriptMessages = useMemo(() => {
    return messages
      .map((msg, index) => {
        if (msg.type !== "user_message" && msg.type !== "assistant_message") {
          return null;
        }
        const role = msg.type === "assistant_message" ? "Assistant" : "User";
        const content = msg.message?.content;
        if (!content) return null;
        return {
          id: `${msg.type}-${index}`,
          role,
          content,
        };
      })
      .filter(Boolean) as Array<{ id: string; role: string; content: string }>;
  }, [messages]);

  const isActiveSession = readyState === VoiceReadyState.OPEN;
  const isConnecting = readyState === VoiceReadyState.CONNECTING;

  return (
    <aside className={cn("flex h-full flex-col", className)}>
      <div className="flex h-full flex-col overflow-hidden bg-background/50">
        {!activeCharacter ? (
          /* ========== Character Directory View ========== */
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                  <Users className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Characters</h2>
                  <p className="text-sm text-muted-foreground">
                    {characters.length ? `${characters.length} available` : "Awaiting analysis"}
                  </p>
                </div>
              </div>
            </div>

            {/* Character List */}
            <ScrollArea className="min-h-0 flex-1 px-4 pb-6">
              {characters.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <Sparkles className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="max-w-[240px] text-sm leading-relaxed text-muted-foreground">
                    {noCharactersMessage}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {characters.map((character) => (
                    <button
                      key={character.name}
                      type="button"
                      onClick={() => handleSelectCharacter(character.name)}
                      className={cn(
                        "group w-full rounded-2xl p-4 text-left transition-all",
                        "bg-card hover:bg-accent/50",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary transition-colors group-hover:bg-primary/15">
                          {getInitial(character.name)}
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-medium text-foreground">
                            {character.name}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {character.kind}
                          </p>
                        </div>
                        {/* Arrow indicator */}
                        <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground/50 transition-transform group-hover:translate-x-1" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          /* ========== Chat View ========== */
          <div className="flex h-full flex-col">
            {/* Header with character info */}
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                {/* Back button */}
                <button
                  type="button"
                  onClick={handleBackToDirectory}
                  className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Back to characters"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {/* Character info */}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-foreground">
                    {activeCharacter.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {activeCharacter.kind}
                  </p>
                </div>
              </div>
              {/* Speaking style - shown subtly below */}
              {activeCharacter.speaking_style && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground/80">
                  {activeCharacter.speaking_style}
                </p>
              )}
            </div>

            {/* Transcript area */}
            <ScrollArea className="min-h-0 flex-1 px-6 py-4">
              {!hasContext ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <Sparkles className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="max-w-[200px] text-sm leading-relaxed text-muted-foreground">
                    Video analysis is not available yet.
                  </p>
                </div>
              ) : transcriptMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Mic className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Ready to chat</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Start a voice session below
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {transcriptMessages.map((message) => {
                    const isUser = message.role?.toLowerCase() === "user";
                    return (
                      <div
                        key={message.id}
                        className={cn("flex", isUser ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-3xl px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                            isUser
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground",
                          )}
                        >
                          {message.content}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              )}
            </ScrollArea>

            {/* Voice control footer */}
            <div className="px-6 py-5">
              {/* Error message */}
              {(sessionError || tokenError) && (
                <p className="mb-3 rounded-xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
                  {sessionError || tokenError}
                </p>
              )}

              {/* Voice button */}
              <Button
                size="lg"
                className={cn(
                  "w-full h-14 rounded-2xl text-base font-medium transition-all",
                  isActiveSession
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                type="button"
                aria-label={isActiveSession ? "End voice session" : "Start voice session"}
                disabled={!canChat || isConnecting || isFetchingToken}
                onClick={handleToggleSession}
              >
                {isActiveSession ? (
                  <>
                    <MicOff className="mr-3 h-5 w-5" aria-hidden />
                    End Session
                  </>
                ) : (
                  <>
                    <Mic className="mr-3 h-5 w-5" aria-hidden />
                    {isConnecting || isFetchingToken ? "Connecting..." : "Start Voice Chat"}
                  </>
                )}
              </Button>

              {/* Status hint */}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {isActiveSession
                  ? "Listening... Speak to chat with the character"
                  : canChat
                    ? "Tap to start a voice conversation"
                    : "Analysis required to enable chat"}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// SSR-safe client detection using useSyncExternalStore
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function useIsClient() {
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
}

export function ChatSidebar(props: ChatSidebarProps) {
  const isClient = useIsClient();

  // VoiceProvider uses browser-only APIs, so we must skip SSR
  if (!isClient) {
    return (
      <aside className={cn("flex h-full flex-col", props.className)}>
        <div className="flex h-full flex-col items-center justify-center bg-background/50">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Mic className="h-7 w-7 text-muted-foreground animate-pulse" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading voice chat...</p>
        </div>
      </aside>
    );
  }

  return (
    <VoiceProvider>
      <ChatSidebarContent {...props} />
    </VoiceProvider>
  );
}
