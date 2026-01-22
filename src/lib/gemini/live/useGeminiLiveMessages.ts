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
      return nextMessages.slice(-messageWindowSize);
    },
    [messageWindowSize],
  );

  const resetMessages = useCallback((nextSequenceNumber: number) => {
    sequenceCounterRef.current = nextSequenceNumber;
    currentUserMessageIdRef.current = null;
    currentModelMessageIdRef.current = null;
    setMessages([]);
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
      let outputText = message.serverContent?.outputTranscription?.text;
      if (!outputText) return;

      const isFinalChunk = Boolean(message.serverContent?.turnComplete);

      setMessages((prev) => {
        const existingIdx = resolveStreamingAssistantIndex(prev);

        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          const updated: Message = {
            ...existing,
            content: existing.content + outputText,
            isStreaming: isFinalChunk || existing.isStreaming === false ? false : true,
          };
          const newArr = [...prev];
          newArr[existingIdx] = updated;
          return applyMessageWindow(newArr);
        }

        const newId = crypto.randomUUID();
        currentModelMessageIdRef.current = newId;

        const prevUserMsgId = currentUserMessageIdRef.current;
        currentUserMessageIdRef.current = null;

        const updatedPrev = finalizeStreamingMessage(prev, prevUserMsgId);

        const newMessage: Message = {
          id: newId,
          role: "assistant",
          content: outputText,
          timestamp: new Date(),
          sequenceNumber: getNextSequenceNumber(),
          isStreaming: isFinalChunk ? false : true,
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

        const newId = crypto.randomUUID();
        currentUserMessageIdRef.current = newId;

        const prevModelMsgId = currentModelMessageIdRef.current;
        currentModelMessageIdRef.current = null;

        const updatedPrev = finalizeStreamingMessage(prev, prevModelMsgId);

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
      if (!message.serverContent?.turnComplete) return;
      const currentModelId = currentModelMessageIdRef.current;
      if (!currentModelId) return;

      setMessages((prev) =>
        applyMessageWindow(finalizeStreamingMessage(prev, currentModelId)),
      );
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
    handleInputText,
    handleOutputText,
    handleTurnComplete,
    resetMessages,
  };
}
