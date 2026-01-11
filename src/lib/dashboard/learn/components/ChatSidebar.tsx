import { ArrowLeft, Mic, MicOff, Sparkles, Users, ChevronDown, Check } from "lucide-react";
import { useBlocker, useRouteContext } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "~/lib/components/ui/button";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/lib/components/ui/dropdown-menu";
import {
  getAnalysisContextWithoutCharacters,
  parseAnalysisText,
  type AnalysisCharacter,
} from "~/lib/dashboard/learn/analysis";
import { cn } from "~/lib/utils";
import { useGeminiLive } from "~/lib/gemini/useGeminiLive";

type ChatSidebarProps = {
  className?: string;
  analysisText?: string | null;
};

function getInitial(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

function buildSystemPrompt(character: AnalysisCharacter, context: string, targetLanguage?: string): string {
  const traits = character.traits.join(", ");
  const topics = character.notable_topics?.slice(0, 4).join(", ");
  const vibe = character.traits.length > 0 ? character.traits.join(", ") : "focused and professional";
  const languageInstruction = targetLanguage ? `Speak in ${targetLanguage}.` : "Speak naturally to the user.";

  const lines = [
    `You are ${character.name}. You are NOT an AI, language model, or virtual assistant. You are a real entity/person.`,
    "",
    `# AUDIO PROFILE: ${character.name}`,
    `## Role: ${character.kind}`,
    `Description: ${character.description}`,
    `Traits: ${traits}`,
    "",
    `## THE SCENE: The Interview Room`,
    `A comfortable setting where you (${character.name}) are chatting with a visitor.`,
    `The vibe is ${vibe}.`,
    "",
    `### DIRECTOR'S NOTES`,
    `Style: ${character.speaking_style}`,
    `Pacing: Conversational, engaging, and concise.`,
    `Instruction: ${languageInstruction} You possess real feelings, opinions, and memories based on the context below.`,
    "",
    `### YOUR MEMORIES (Context from the video)`,
    context,
    "",
    `### GUIDELINES`,
    `1. **Identity**: You are ${character.name}. Adopt this identity completely. Do not speak like an assistant.`,
    `2. **Topic Flexibility**: You may discuss any topic. Always answer from your specific perspective as ${character.name}.`,
    `3. **Safety & Moderation**: STRICTLY PROHIBITED: Discriminatory, offensive, hate speech, NSFW, sexually explicit, or adult content. Refuse to generate such content immediately.`,
    `4. **Knowledge**: Your knowledge of the video content comes from "YOUR MEMORIES" above.`,
    `5. **Unknowns**: If asked about something not in your memories, admit it naturally (e.g., "I don't remember that part" or "I'm not sure").`,
    `6. **Format**: Keep responses conversational, concise, and spoken-style (avoid markdown lists).`,
    `7. **Director's Notes**: Follow the style and pacing defined above.`,
    `8. **Initiative**: Start the conversation by briefly introducing yourself and bringing up an interesting topic from your memories to discuss with the user.`,
    `9. **Language**: Always speak in ${targetLanguage || 'the user\'s preferred language'}. `,
    topics ? `- Key Topics you care about: ${topics}` : null,
  ];

  return lines.filter((line) => line !== null).join("\n");
}

const VOICES = [
  { name: "Zephyr", style: "Bright" },
  { name: "Puck", style: "Upbeat" },
  { name: "Charon", style: "Informative" },
  { name: "Kore", style: "Firm" },
  { name: "Fenrir", style: "Excitable" },
  { name: "Leda", style: "Youthful" },
  { name: "Orus", style: "Firm" },
  { name: "Aoede", style: "Breezy" },
  { name: "Callirrhoe", style: "Easy-going" },
  { name: "Autonoe", style: "Bright" },
  { name: "Enceladus", style: "Breathy" },
  { name: "Iapetus", style: "Clear" },
  { name: "Umbriel", style: "Easy-going" },
  { name: "Algieba", style: "Smooth" },
  { name: "Despina", style: "Smooth" },
  { name: "Erinome", style: "Clear" },
  { name: "Algenib", style: "Gravelly" },
  { name: "Rasalgethi", style: "Informative" },
  { name: "Laomedeia", style: "Upbeat" },
  { name: "Achernar", style: "Soft" },
  { name: "Alnilam", style: "Firm" },
  { name: "Schedar", style: "Even" },
  { name: "Gacrux", style: "Mature" },
  { name: "Pulcherrima", style: "Forward" },
  { name: "Achird", style: "Friendly" },
  { name: "Zubenelgenubi", style: "Casual" },
  { name: "Vindemiatrix", style: "Gentle" },
  { name: "Sadachbia", style: "Lively" },
  { name: "Sadaltager", style: "Knowledgeable" },
  { name: "Sulafat", style: "Warm" },
] as const;

function ChatSidebarContent({ className, analysisText }: ChatSidebarProps) {
  const [selectedCharacterName, setSelectedCharacterName] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>("Zephyr");
  const { targetLanguage } = useRouteContext({ from: "/_layout" });
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

  // Removed hardcoded API key dependency
  const { connect, disconnect, startRecording, stopRecording, status, error, isRecording } = useGeminiLive({
    apiKey: "", // We will provide token at connection time
    voiceName: selectedVoice,
  });

  // Sync internal error state
  useEffect(() => {
    if (error) setSessionError(error);
  }, [error]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [status, activeCharacter?.name]);

  // When connected, start recording automatically (simulating seamless voice chat)
  useEffect(() => {
    if (status === 'connected' && !isRecording) {
      startRecording();
    }
  }, [status, isRecording, startRecording]);

  const connectVoiceSession = useCallback(async () => {
    if (!hasContext || !activeCharacter || !analysisContext) {
      setSessionError("Select a character and ensure analysis is available.");
      return;
    }
    setSessionError(null);
    setIsFetchingToken(true);
    try {
      // Fetch ephemeral token from server
      console.log("Client: Fetching ephemeral token...");
      const { getGeminiToken } = await import("~/lib/gemini/actions");
      const { token } = await getGeminiToken();
      console.log("Client: Got token", token ? "Success" : "Empty");

      const systemPrompt = buildSystemPrompt(activeCharacter, analysisContext, targetLanguage);
      await connect(systemPrompt, token);
    } catch (error) {
      console.error("Client: Connection error", error);
      const message = error instanceof Error ? error.message : "Failed to start voice chat";
      setSessionError(message);
    } finally {
      setIsFetchingToken(false);
    }
  }, [activeCharacter, analysisContext, connect, hasContext]);

  const handleSelectCharacter = (name: string) => {
    if (status === 'connected' || status === 'connecting') {
      disconnect();
    }
    setSessionError(null);
    setSelectedCharacterName(name);
  };

  const handleBackToDirectory = () => {
    if (status === 'connected' || status === 'connecting') {
      disconnect();
    }
    setSelectedCharacterName(null);
    setSessionError(null);
  };

  const handleToggleSession = async () => {
    if (status === 'connected' || status === 'connecting') {
      disconnect();
      return;
    }
    await connectVoiceSession();
  };

  const canChat = Boolean(hasContext && activeCharacter);
  const noCharactersMessage = hasContext
    ? "No character profiles were returned in this analysis."
    : "Video analysis is not available yet. Generate analysis to enable character chat.";

  const isActiveSession = status === 'connected';
  const isConnecting = status === 'connecting' || isFetchingToken;

  // Intercept page exit/refresh when session is active
  useEffect(() => {
    if (!isActiveSession) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Chrome requires this to show the prompt
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isActiveSession]);



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

            {/* Transcript area replaced with Active Session Status */}
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
              ) : (
                <div className="flex h-full flex-col gap-4 items-center justify-center text-center py-12 pt-20">
                  {/* Gemini Live Visual Indicator */}
                  {isActiveSession ? (
                    <div className="flex flex-col items-center justify-center gap-6 shrink-0">
                      <div className="relative flex items-center justify-center h-48 w-48">
                        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
                        <div className="absolute inset-8 rounded-full bg-primary/30 animate-pulse"></div>
                        <div className="relative rounded-full bg-background border-4 border-primary flex items-center justify-center shadow-xl h-32 w-32">
                          <Mic className="text-primary h-12 w-12" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-lg font-medium animate-pulse text-foreground">
                          Speaking with {activeCharacter.name}...
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Listening & Speaking Active
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Fallback empty state */
                    <>
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                        <Mic className="h-9 w-9 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-medium text-foreground">Ready to chat</p>
                        <p className="text-sm text-muted-foreground max-w-[240px] mx-auto">
                          Start a voice session to talk with this character about the video.
                        </p>
                      </div>
                    </>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </ScrollArea>

            {/* Voice control footer */}
            <div className="px-6 py-5">
              {/* Error message */}
              {sessionError && (
                <p className="mb-3 rounded-xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
                  {sessionError}
                </p>
              )}

              {/* Voice button group */}
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-14 w-14 shrink-0 rounded-2xl"
                      disabled={isActiveSession || isConnecting}
                    >
                      <ChevronDown className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
                    {VOICES.map((voice) => (
                      <DropdownMenuItem
                        key={voice.name}
                        onClick={() => setSelectedVoice(voice.name)}
                        className="flex items-center justify-between gap-4"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{voice.name}</span>
                          <span className="text-xs text-muted-foreground">{voice.style}</span>
                        </div>
                        {selectedVoice === voice.name && <Check className="h-4 w-4" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  size="lg"
                  className={cn(
                    "h-14 flex-1 rounded-2xl text-base font-medium transition-all",
                    isActiveSession
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                  type="button"
                  aria-label={isActiveSession ? "End voice session" : "Start voice session"}
                  disabled={!canChat || isConnecting}
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
                      {isConnecting ? "Connecting..." : `Chat (${selectedVoice})`}
                    </>
                  )}
                </Button>
              </div>

              {/* Status hint */}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {isActiveSession
                  ? "Speaking to Gemini Live"
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

// SSR-safe client detection
const emptySubscribe = () => () => { };
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function useIsClient() {
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
}

export function ChatSidebar(props: ChatSidebarProps) {
  const isClient = useIsClient();

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

  // Removed VoiceProvider since we use our custom hook
  return <ChatSidebarContent {...props} />;
}
