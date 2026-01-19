export type ToolOutput = {
  toolName: string;
  input: Record<string, any>;
  output: Record<string, any>;
};

export interface ObserverResponse {
  toolResult: ToolOutput | null;
  explanation?: Array<{ term: string; note: string; example: string }> | null;
  finishReason?: string | null;
}
