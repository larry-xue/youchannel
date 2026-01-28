import { useCallback, useRef, useState } from "react";
import type { LiveServerMessage } from "@google/genai";
import type { Message } from "~/lib/gemini/live/types";

type UseGeminiLiveMessagesOptions = {
  initialSequenceNumber: number;
  messageWindowSize: number;
};

const finalizeStreamingMessage = (messages: Message[], messageId: string | null) => {
  if (!messageId) return messages;
  const idx = messages.findIndex((message) => message.id === messageId);
  if (idx < 0 || messages[idx].isStreaming === false) return messages;

  const next = [...messages];
  next[idx] = { ...next[idx], isStreaming: false };
  return next;
};

const revokeObjectUrl = (url: string | undefined) => {
  if (!url) return;
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  if (!url.startsWith("blob:")) return;
  URL.revokeObjectURL(url);
};

const findRecentUserAudioPlaceholderIndex = (messages: Message[]) => {
  const now = Date.now();
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;
    if (message.content.trim()) continue;
    const ageMs = now - message.timestamp.getTime();
    if (ageMs > 30000) continue;
    return i;
  }
  return -1;
};

const findRecentAssistantIndexForContinuation = (messages: Message[]) => {
  const now = Date.now();
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const ageMs = now - message.timestamp.getTime();
    if (ageMs > 15000) continue;
    if (!message.content.trim()) continue;
    return i;
  }
  return -1;
};

const shouldInsertSpaceBetween = (prevText: string, nextText: string) => {
  if (!prevText || !nextText) return false;
  const prevLast = prevText.slice(-1);
  const nextFirst = nextText.slice(0, 1);
  if (!prevLast || !nextFirst) return false;
  if (/\s/.test(prevLast) || /\s/.test(nextFirst)) return false;
  if (/^[,.;:!?]/.test(nextFirst)) return false;

  const isAsciiWordChar = (char: string) => /^[A-Za-z0-9]$/.test(char);
  const isSentencePunct = (char: string) => /^[.!?]$/.test(char);

  if (isAsciiWordChar(prevLast) && isAsciiWordChar(nextFirst)) return true;
  if (isSentencePunct(prevLast) && isAsciiWordChar(nextFirst)) return true;
  return false;
};

const appendTranscriptionText = (prevText: string, nextText: string) =>
  shouldInsertSpaceBetween(prevText, nextText) ? `${prevText} ${nextText}` : prevText + nextText;

export function useGeminiLiveMessages({
  initialSequenceNumber,
  messageWindowSize,
}: UseGeminiLiveMessagesOptions) {
  const [messages, setMessages] = useState<Message[]>([]);

  const sequenceCounterRef = useRef<number>(initialSequenceNumber);
  const currentUserMessageIdRef = useRef<string | null>(null);
  const currentModelMessageIdRef = useRef<string | null>(null);

  const getNextSequenceNumber = useCallback(() => {
    sequenceCounterRef.current += 1;
    return sequenceCounterRef.current;
  }, []);

  const applyMessageWindow = useCallback(
    (nextMessages: Message[]): Message[] => {
      if (nextMessages.length <= messageWindowSize) {
        return nextMessages;
      }
      const removed = nextMessages.slice(0, nextMessages.length - messageWindowSize);
      removed.forEach((message) => revokeObjectUrl(message.audioUrl));
      return nextMessages.slice(-messageWindowSize);
    },
    [messageWindowSize],
  );

  const resetMessages = useCallback((nextSequenceNumber: number) => {
    sequenceCounterRef.current = nextSequenceNumber;
    currentUserMessageIdRef.current = null;
    currentModelMessageIdRef.current = null;
    setMessages((prev) => {
      prev.forEach((message) => revokeObjectUrl(message.audioUrl));
      return [];
    });
  }, []);

  const resolveStreamingAssistantIndex = useCallback((nextMessages: Message[]) => {
    const currentModelId = currentModelMessageIdRef.current;
    if (currentModelId) {
      const idx = nextMessages.findIndex((message) => message.id === currentModelId);
      if (idx >= 0) return idx;
    }

    if (nextMessages.length > 0) {
      const lastMessage = nextMessages[nextMessages.length - 1];
      if (lastMessage.role === "assistant" && lastMessage.isStreaming) {
        currentModelMessageIdRef.current = lastMessage.id;
        return nextMessages.length - 1;
      }
    }

    return -1;
  }, []);

  const resolveStreamingUserIndex = useCallback((nextMessages: Message[]) => {
    const currentUserId = currentUserMessageIdRef.current;
    if (currentUserId) {
      const idx = nextMessages.findIndex((message) => message.id === currentUserId);
      if (idx >= 0) return idx;
    }

    if (nextMessages.length > 0) {
      const lastMessage = nextMessages[nextMessages.length - 1];
      if (lastMessage.role === "user" && lastMessage.isStreaming) {
        currentUserMessageIdRef.current = lastMessage.id;
        return nextMessages.length - 1;
      }
    }

    return -1;
  }, []);

  const handleOutputText = useCallback(
    (message: LiveServerMessage) => {
      const outputText = message.serverContent?.outputTranscription?.text;
      if (!outputText) return;

      setMessages((prev) => {
        const existingIdx = resolveStreamingAssistantIndex(prev);

        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          const updated: Message = {
            ...existing,
            content: appendTranscriptionText(existing.content, outputText),
            isStreaming: existing.isStreaming,
          };
          const newArr = [...prev];
          newArr[existingIdx] = updated;
          return applyMessageWindow(newArr);
        }

        if (/^\s/.test(outputText)) {
          const recentAssistantIdx = findRecentAssistantIndexForContinuation(prev);
          if (recentAssistantIdx >= 0) {
            const existing = prev[recentAssistantIdx];
            const updated: Message = {
              ...existing,
              content: appendTranscriptionText(existing.content, outputText),
            };
            const newArr = [...prev];
            newArr[recentAssistantIdx] = updated;
            return applyMessageWindow(newArr);
          }
        }

        const newId = crypto.randomUUID();
        currentModelMessageIdRef.current = newId;

        const updatedPrev = prev;

        const newMessage: Message = {
          id: newId,
          role: "assistant",
          content: outputText,
          timestamp: new Date(),
          sequenceNumber: getNextSequenceNumber(),
          isStreaming: true,
        };
        return applyMessageWindow([...updatedPrev, newMessage]);
      });
    },
    [applyMessageWindow, getNextSequenceNumber, resolveStreamingAssistantIndex],
  );

  const handleInputText = useCallback(
    (message: LiveServerMessage) => {
      const inputText = message.serverContent?.inputTranscription?.text;
      if (!inputText) return;

      setMessages((prev) => {
        const existingIdx = resolveStreamingUserIndex(prev);

        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          const updated: Message = {
            ...existing,
            content: existing.content + inputText,
            isStreaming: true,
          };
          const newArr = [...prev];
          newArr[existingIdx] = updated;
          return applyMessageWindow(newArr);
        }

        if (!inputText.trim()) {
          return prev;
        }

        const placeholderIdx = findRecentUserAudioPlaceholderIndex(prev);
        if (placeholderIdx >= 0) {
          const placeholder = prev[placeholderIdx];
          currentUserMessageIdRef.current = placeholder.id;

          const updated: Message = {
            ...placeholder,
            content: placeholder.content + inputText,
            isStreaming: true,
          };
          const newArr = [...prev];
          newArr[placeholderIdx] = updated;
          return applyMessageWindow(newArr);
        }

        const newId = crypto.randomUUID();
        currentUserMessageIdRef.current = newId;

        const updatedPrev = prev;

        const newMessage: Message = {
          id: newId,
          role: "user",
          content: inputText,
          timestamp: new Date(),
          sequenceNumber: getNextSequenceNumber(),
          isStreaming: true,
        };
        return applyMessageWindow([...updatedPrev, newMessage]);
      });
    },
    [applyMessageWindow, getNextSequenceNumber, resolveStreamingUserIndex],
  );

  const handleTurnComplete = useCallback(
    (message: LiveServerMessage) => {
      const isTurnComplete = message.serverContent?.turnComplete;
      const isInterrupted = message.serverContent?.interrupted;

      if (!isTurnComplete && !isInterrupted) return;
      const currentModelId = currentModelMessageIdRef.current;
      const currentUserId = currentUserMessageIdRef.current;
      if (!currentModelId && !currentUserId) return;

      if (currentUserId) {
        currentUserMessageIdRef.current = null;
      }
      if (currentModelId) {
        currentModelMessageIdRef.current = null;
      }

      setMessages((prev) => {
        let next = prev;
        if (currentUserId) {
          next = finalizeStreamingMessage(next, currentUserId);
        }
        if (currentModelId) {
          next = finalizeStreamingMessage(next, currentModelId);
        }
        return applyMessageWindow(next);
      });
    },
    [applyMessageWindow],
  );

  const appendUserMessage = useCallback(
    (text: string) => {
      setMessages((prev) => {
        const newId = crypto.randomUUID();
        currentUserMessageIdRef.current = newId;
        currentModelMessageIdRef.current = null;

        const newMessage: Message = {
          id: newId,
          role: "user",
          content: text,
          timestamp: new Date(),
          sequenceNumber: getNextSequenceNumber(),
          isStreaming: false,
        };
        return applyMessageWindow([...prev, newMessage]);
      });
    },
    [applyMessageWindow, getNextSequenceNumber],
  );

  const beginUserAudioMessage = useCallback((): string => {
    const previousUserId = currentUserMessageIdRef.current;
    const previousModelId = currentModelMessageIdRef.current;
    const newId = crypto.randomUUID();
    currentUserMessageIdRef.current = newId;

    setMessages((prev) => {
      let nextPrev = prev;
      if (previousUserId) {
        nextPrev = finalizeStreamingMessage(nextPrev, previousUserId);
      }
      if (previousModelId) {
        nextPrev = finalizeStreamingMessage(nextPrev, previousModelId);
      }
      const newMessage: Message = {
        id: newId,
        role: "user",
        content: "",
        timestamp: new Date(),
        sequenceNumber: getNextSequenceNumber(),
        isStreaming: true,
      };
      return applyMessageWindow([...nextPrev, newMessage]);
    });

    return newId;
  }, [applyMessageWindow, getNextSequenceNumber]);

  const ensureAssistantMessage = useCallback((): string => {
    const currentModelId = currentModelMessageIdRef.current;
    if (currentModelId) return currentModelId;

    const newId = crypto.randomUUID();
    currentModelMessageIdRef.current = newId;

    setMessages((prev) => {
      const newMessage: Message = {
        id: newId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        sequenceNumber: getNextSequenceNumber(),
        isStreaming: true,
      };
      return applyMessageWindow([...prev, newMessage]);
    });

    return newId;
  }, [applyMessageWindow, getNextSequenceNumber]);

  const attachAudioToMessage = useCallback(
    (messageId: string, audioUrl: string) => {
      setMessages((prev) => {
        const idx = prev.findIndex((message) => message.id === messageId);
        if (idx < 0) return prev;

        const existing = prev[idx];
        if (existing.audioUrl && existing.audioUrl !== audioUrl) {
          revokeObjectUrl(existing.audioUrl);
        }

        const next = [...prev];
        next[idx] = { ...existing, audioUrl };
        return next;
      });
    },
    [],
  );

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((message) => message.id === messageId);
      if (idx < 0) return prev;

      const message = prev[idx];
      revokeObjectUrl(message.audioUrl);

      if (currentUserMessageIdRef.current === messageId) {
        currentUserMessageIdRef.current = null;
      }
      if (currentModelMessageIdRef.current === messageId) {
        currentModelMessageIdRef.current = null;
      }

      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  }, []);

  const appendTurns = useCallback(
    (turns: Array<{ role: "user" | "assistant"; content: string }>) => {
      setMessages((prev) =>
        applyMessageWindow([
          ...prev,
          ...turns.map(
            (turn): Message => ({
              id: crypto.randomUUID(),
              role: turn.role,
              content: turn.content,
              timestamp: new Date(),
              sequenceNumber: getNextSequenceNumber(),
              isStreaming: false,
            }),
          ),
        ]),
      );
    },
    [applyMessageWindow, getNextSequenceNumber],
  );

  return {
    messages,
    appendTurns,
    appendUserMessage,
    beginUserAudioMessage,
    ensureAssistantMessage,
    attachAudioToMessage,
    removeMessage,
    handleInputText,
    handleOutputText,
    handleTurnComplete,
    resetMessages,
  };
}
