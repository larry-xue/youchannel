import { useBlocker, useRouteContext } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Mic,
  MicOff,
  Sparkles,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "~/lib/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/lib/components/ui/dropdown-menu";
import { Input } from "~/lib/components/ui/input";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import {
  CHARACTER_LANGUAGE_LABELS,
  CHARACTER_LANGUAGE_OPTIONS,
  getAnalysisContextWithoutCharacters,
  parseAnalysisText,
  type AnalysisCharacter,
  type CharacterLanguage,
} from "~/lib/dashboard/learn/analysis";
import { useGeminiLive } from "~/lib/gemini/useGeminiLive";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

type ChatSidebarProps = {
  className?: string;
  analysisText?: string | null;
};

function getInitial(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

function buildSystemPrompt(
  character: AnalysisCharacter,
  context: string,
  language?: string,
): string {
  const traits = character.traits.join(", ");
  const topics = character.notable_topics.slice(0, 4).join(", ");
  const vibe =
    character.traits.length > 0
      ? character.traits.join(", ")
      : "focused and professional";
  const preferredLanguageLabel =
    language && language in CHARACTER_LANGUAGE_LABELS
      ? CHARACTER_LANGUAGE_LABELS[language as CharacterLanguage]
      : language;
  const languageGuidance = [
    "8. **Language**: Always reply in the same language as the user's",
    "most recent message. If the user mixes languages, mirror the mix.",
    "If the user asks you to switch languages, switch immediately.",
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");

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
    `Instruction: You possess real feelings, opinions, and memories based on the context below.`,
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
    `7. **Initiative**: Start the conversation by briefly introducing yourself and bringing up an interesting topic from your memories to discuss with the user.`,
    languageGuidance,
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

const DEFAULT_LANGUAGE: CharacterLanguage = "en-US";

type CharacterSelection = {
  voice: string;
  language: CharacterLanguage;
};

function ChatSidebarContent({ className, analysisText }: ChatSidebarProps) {
  const [selectedCharacterName, setSelectedCharacterName] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [characterSelections, setCharacterSelections] = useState<
    Record<string, CharacterSelection>
  >({});
  const [debugInput, setDebugInput] = useState("");
  const { targetLanguage, user } = useRouteContext({ from: "/_layout" });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const hasSentHelloRef = useRef(false);

  const trimmedAnalysis = analysisText?.trim() ?? "";
  const parsedAnalysis = useMemo(
    () => parseAnalysisText(trimmedAnalysis),
    [trimmedAnalysis],
  );
  const characters = useMemo(() => parsedAnalysis?.characters ?? [], [parsedAnalysis]);
  const analysisContext = useMemo(
    () =>
      parsedAnalysis?.contextWithoutCharacters ||
      getAnalysisContextWithoutCharacters(trimmedAnalysis),
    [parsedAnalysis, trimmedAnalysis],
  );
  const hasContext = Boolean(analysisContext);

  const activeCharacter = useMemo(
    () =>
      characters.find((character) => character.name === selectedCharacterName) || null,
    [characters, selectedCharacterName],
  );

  const activeSelection = useMemo(() => {
    if (!activeCharacter) return null;
    const saved = characterSelections[activeCharacter.name];
    return {
      voice: saved?.voice ?? activeCharacter.voice,
      language: saved?.language ?? activeCharacter.language,
    };
  }, [activeCharacter, characterSelections]);

  const activeVoice = activeSelection?.voice ?? VOICES[0].name;
  const activeLanguage =
    activeSelection?.language ?? activeCharacter?.language ?? DEFAULT_LANGUAGE;
  const promptLanguage =
    activeSelection?.language ??
    activeCharacter?.language ??
    targetLanguage ??
    DEFAULT_LANGUAGE;

  // Removed hardcoded API key dependency
  const {
    connect,
    disconnect,
    startRecording,
    sendText,
    status,
    error,
    isRecording,
    messages,
  } = useGeminiLive({
    apiKey: "", // We will provide token at connection time
    voiceName: activeVoice,
  });

  // Sync internal error state
  useEffect(() => {
    if (error) setSessionError(error);
  }, [error]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    status,
    activeCharacter?.name,
    messages.length,
    messages[messages.length - 1]?.content,
  ]);

  // When connected, start recording automatically (simulating seamless voice chat)
  useEffect(() => {
    if (status === "connected") {
      if (!isRecording) {
        startRecording();
      }
      // Automaticaly send greeting in the user's interface language to trigger the character's introduction
      if (!hasSentHelloRef.current) {
        sendText(m.chat_sidebar_initial_greeting(), true);
        hasSentHelloRef.current = true;
      }
    } else {
      hasSentHelloRef.current = false;
    }
  }, [status, isRecording, startRecording, sendText]);

  const updateCharacterSelection = useCallback(
    (updates: Partial<CharacterSelection>) => {
      if (!activeCharacter) return;
      setCharacterSelections((prev) => {
        const current = prev[activeCharacter.name] ?? {
          voice: activeCharacter.voice,
          language: activeCharacter.language,
        };
        return {
          ...prev,
          [activeCharacter.name]: { ...current, ...updates },
        };
      });
    },
    [activeCharacter],
  );

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

      const systemPrompt = buildSystemPrompt(
        activeCharacter,
        analysisContext,
        promptLanguage,
      );
      await connect(systemPrompt, token);
    } catch (error) {
      console.error("Client: Connection error", error);
      const message =
        error instanceof Error ? error.message : "Failed to start voice chat";
      setSessionError(message);
    } finally {
      setIsFetchingToken(false);
    }
  }, [activeCharacter, analysisContext, connect, hasContext, promptLanguage]);

  const handleSelectCharacter = (name: string) => {
    if (status === "connected" || status === "connecting") {
      disconnect();
    }
    setSessionError(null);
    setSelectedCharacterName(name);
  };

  const handleBackToDirectory = () => {
    if (status === "connected" || status === "connecting") {
      disconnect();
    }
    setSelectedCharacterName(null);
    setSessionError(null);
  };

  const handleToggleSession = async () => {
    if (status === "connected" || status === "connecting") {
      disconnect();
      return;
    }
    await connectVoiceSession();
  };

  const canChat = Boolean(hasContext && activeCharacter);
  const noCharactersMessage = hasContext
    ? m.chat_sidebar_no_characters()
    : m.chat_sidebar_analysis_unavailable();

  const isActiveSession = status === "connected";
  const isConnecting = status === "connecting" || isFetchingToken;

  // Intercept page exit/refresh when session is active
  useEffect(() => {
    if (!isActiveSession) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // Chrome requires this to show the prompt
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isActiveSession]);

  useBlocker({
    shouldBlockFn: () => {
      if (status !== "connected") return false;
      // eslint-disable-next-line no-alert
      const shouldLeave = window.confirm(
        "You have an active call. Do you want to end it?",
      );
      if (shouldLeave) {
        disconnect();
        return false;
      }
      return true;
    },
  });

  return (
    <aside className={cn("flex h-full flex-col", className)}>
      <div className="flex h-full flex-col bg-background/50 overflow-auto">
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
                  <h2 className="text-base font-semibold text-foreground">
                    {m.chat_sidebar_characters()}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {characters.length
                      ? m.chat_sidebar_available_count({ count: characters.length })
                      : m.chat_sidebar_awaiting_analysis()}
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
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
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
                  <p className="text-sm text-muted-foreground">{activeCharacter.kind}</p>
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
                    {m.chat_sidebar_analysis_unavailable_short()}
                  </p>
                </div>
              ) : (
                <div className="flex h-full flex-col justify-end min-h-full">
                  {/* Messages List */}
                  <div className="flex flex-col gap-4 py-4">
                    {messages.map((message) => {
                      const isModel = message.role === "model";
                      // rudimentary grouping: if same role and within 1 min, hide header?
                      // Simplified for now: always show header or just distinct blocks.
                      // Discord style: Avatar left.
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "group flex gap-3 px-2",
                            isModel ? "" : "flex-row-reverse",
                          )}
                        >
                          {/* Avatar */}
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full select-none overflow-hidden",
                              isModel
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {isModel ? (
                              getInitial(activeCharacter.name)
                            ) : user?.user_metadata?.avatar_url ? (
                              <img
                                src={user.user_metadata.avatar_url}
                                alt="User"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              getInitial(
                                user?.user_metadata?.full_name || user?.email || "You",
                              )
                            )}
                          </div>

                          {/* Content */}
                          <div
                            className={cn(
                              "flex flex-col min-w-0 max-w-[85%]",
                              isModel ? "items-start" : "items-end",
                            )}
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-foreground">
                                {isModel
                                  ? activeCharacter.name
                                  : user?.user_metadata?.full_name || "You"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {message.timestamp.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <div
                              className={cn(
                                "rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word",
                                isModel
                                  ? "bg-muted/50 text-foreground rounded-tl-sm"
                                  : "bg-primary text-primary-foreground rounded-tr-sm",
                              )}
                            >
                              {message.content}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Typing indicator or Mic status when empty */}
                    {messages.length === 0 && isActiveSession && (
                      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/20 animate-pulse flex items-center justify-center">
                          <Mic className="h-4 w-4 text-primary" />
                        </div>
                        <p className="text-sm">{m.chat_sidebar_listening_active()}</p>
                      </div>
                    )}

                    {!isActiveSession && messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center p-8 text-center gap-4">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                          <Mic className="h-9 w-9 text-primary" />
                        </div>
                        <p className="text-sm text-muted-foreground max-w-[200px]">
                          {m.chat_sidebar_start_session_hint()}
                        </p>
                      </div>
                    )}
                  </div>
                  <div ref={bottomRef} />
                </div>
              )}
            </ScrollArea>

            {/* Voice control footer */}
            <div className="px-6 py-5">
              {import.meta.env.DEV && (
                <div className="flex gap-2 mb-4">
                  <Input
                    value={debugInput}
                    onChange={(e) => setDebugInput(e.target.value)}
                    placeholder="Debug text..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && debugInput.trim()) {
                        sendText(debugInput);
                        setDebugInput("");
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (debugInput.trim()) {
                        sendText(debugInput);
                        setDebugInput("");
                      }
                    }}
                  >
                    Send
                  </Button>
                </div>
              )}
              {/* Error message */}
              {sessionError && (
                <p className="mb-3 rounded-xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
                  {sessionError}
                </p>
              )}

              {/* Voice button group */}
              <div className="flex flex-col gap-3">
                {/* Toolbar */}
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 min-w-[120px] flex-1 justify-between rounded-xl px-3 text-sm"
                        disabled={isActiveSession || isConnecting}
                        aria-label={m.chat_sidebar_voice_select()}
                        title={activeVoice}
                      >
                        <span className="font-medium truncate">{activeVoice}</span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="w-[200px] max-h-[300px] overflow-y-auto"
                    >
                      {VOICES.map((voice) => (
                        <DropdownMenuItem
                          key={voice.name}
                          onClick={() => updateCharacterSelection({ voice: voice.name })}
                          className="flex items-center justify-between gap-4"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{voice.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {voice.style}
                            </span>
                          </div>
                          {activeVoice === voice.name && <Check className="h-4 w-4" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 min-w-[120px] flex-1 justify-between rounded-xl px-3 text-sm"
                        disabled={isActiveSession || isConnecting}
                        aria-label={m.chat_sidebar_language_select()}
                        title={
                          CHARACTER_LANGUAGE_LABELS[activeLanguage] || activeLanguage
                        }
                      >
                        <span className="font-medium truncate">
                          {CHARACTER_LANGUAGE_LABELS[activeLanguage] || activeLanguage}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[200px] max-h-[300px] overflow-y-auto"
                    >
                      {Array.from(
                        new Set([activeLanguage, ...CHARACTER_LANGUAGE_OPTIONS]),
                      ).map((language) => (
                        <DropdownMenuItem
                          key={language}
                          onClick={() => updateCharacterSelection({ language })}
                          className="flex items-center justify-between gap-4"
                        >
                          <span className="font-medium">
                            {CHARACTER_LANGUAGE_LABELS[language] || language}
                          </span>
                          {activeLanguage === language && <Check className="h-4 w-4" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Button
                  size="lg"
                  className={cn(
                    "h-14 w-full rounded-2xl text-base font-medium transition-all shadow-sm",
                    isActiveSession
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                  type="button"
                  aria-label={
                    isActiveSession ? "End voice session" : "Start voice session"
                  }
                  disabled={!canChat || isConnecting}
                  onClick={handleToggleSession}
                >
                  {isActiveSession ? (
                    <>
                      <MicOff className="mr-3 h-5 w-5" aria-hidden />
                      {m.chat_sidebar_end_session()}
                    </>
                  ) : (
                    <>
                      <Mic className="mr-3 h-5 w-5" aria-hidden />
                      {isConnecting
                        ? m.chat_sidebar_connecting()
                        : m.chat_sidebar_chat_button({ voice: activeVoice })}
                    </>
                  )}
                </Button>
              </div>

              {/* Status hint */}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {isActiveSession
                  ? ""
                  : canChat
                    ? m.chat_sidebar_status_tap()
                    : m.chat_sidebar_status_analysis_required()}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// SSR-safe client detection
const emptySubscribe = () => () => {};
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
          <p className="mt-4 text-sm text-muted-foreground">{m.chat_sidebar_loading()}</p>
        </div>
      </aside>
    );
  }

  // Removed VoiceProvider since we use our custom hook
  return <ChatSidebarContent {...props} />;
}
