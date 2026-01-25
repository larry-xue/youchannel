export type GeminiLiveStatus = "disconnected" | "connecting" | "connected" | "error";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Optional object URL for the user's captured audio (e.g. blob:...). */
  audioUrl?: string;
  timestamp: Date;
  /** Monotonically increasing sequence number for ordering */
  sequenceNumber: number;
  /** Whether this message is still being streamed (content may change) */
  isStreaming?: boolean;
};
