export type ToolOutput = {
  toolName: string;
  input: Record<string, any>;
  output: Record<string, any>;
};

export interface ObserverResponse {
  toolResult: ToolOutput | null;
  finishReason?: string | null;
}
