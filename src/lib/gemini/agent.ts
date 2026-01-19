/**
 * Gemini Agent SDK
 *
 * Native Gemini tool-calling loop implementation:
 * generateContent → functionCalls → execute → functionResponse → generateContent ...
 *
 * Features:
 * - Full tool loop with automatic function response handling
 * - maxSteps to prevent infinite loops
 * - Multi-call support (multiple function calls per turn)
 * - Serial/parallel execution modes
 * - Zod schema → Gemini Schema conversion
 * - Streaming support (runAgentStream)
 * - Retry logic with exponential backoff
 * - Token/cost tracking
 */

import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Part,
  type Schema,
} from "@google/genai";
import type { z } from "zod";

// ============================================================================
// Types
// ============================================================================

/** Tool definition with Zod schema and execute function */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  description: string;
  parameters: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<TOutput> | TOutput;
}

/** Internal tool representation */
export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<TInput>;
  schema: Schema;
  execute: (input: TInput) => Promise<TOutput> | TOutput;
}

/** Single tool call record with full traceability */
export interface ToolCallRecord {
  name: string;
  /** Raw args from Gemini before parsing */
  rawArgs: unknown;
  /** Parsed args after Zod validation (undefined if parse failed) */
  parsedArgs: unknown | undefined;
  /** Execution result wrapped in { ok, data/error } */
  result: { ok: true; data: unknown } | { ok: false; error: string };
}

/** Step in the agent loop */
export interface AgentStep {
  type: "tool_calls" | "text";
  toolCalls?: ToolCallRecord[];
  text?: string;
}

/** Token usage statistics */
export interface TokenUsage {
  /** Input tokens (prompt) */
  promptTokens: number;
  /** Output tokens (completion) */
  completionTokens: number;
  /** Total tokens used */
  totalTokens: number;
  /** Thinking tokens (if using thinking budget) */
  thinkingTokens?: number;
}

/** Agent execution result */
export interface AgentResult {
  /** Final text output (if any) */
  text: string | null;
  /** All tool calls across all steps */
  toolCalls: ToolCallRecord[];
  /** Detailed step-by-step execution log */
  steps: AgentStep[];
  /** How the agent finished */
  finishReason: "stop" | "max_steps" | "error";
  /** Total steps taken */
  stepCount: number;
  /** Aggregated token usage across all steps */
  usage: TokenUsage;
}

/** Message format */
export interface AgentMessage {
  role: "user" | "model";
  /**
   * Message content: either plain text or full Gemini parts
   * (e.g., inlineData/fileData for images/audio).
   */
  content: string | Part[];
}

/** Tool choice mode */
export type ToolChoice = "auto" | "required" | "none";

/** Execution mode for multiple tool calls */
export type ExecutionMode = "serial" | "parallel";

/** Agent run options */
export interface RunAgentOptions {
  apiKey: string;
  model?: string;
  systemInstruction?: string;
  messages: AgentMessage[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: Record<string, Tool<any, any>>;
  toolChoice?: ToolChoice;
  /** Maximum tool-call loop iterations (default: 10) */
  maxSteps?: number;
  /** Gemini thinking budget */
  thinkingBudget?: number;
  /** Execution mode for multiple tool calls (default: "serial") */
  executionMode?: ExecutionMode;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Optional config passthrough merged into final config */
  config?: GenerateContentConfig;
  /** Maximum number of content entries to retain (prevents unbounded growth) */
  maxHistory?: number;
  /** Model context window size (tokens) for trimming decisions */
  maxContextTokens?: number;
  /** Trim when total tokens exceed this ratio (default: 0.8) */
  maxTokenUsageRatio?: number;
}

/** Retry configuration */
export interface RetryConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Retry on these status codes (default: [429, 500, 502, 503, 504]) */
  retryableStatusCodes?: number[];
}

// ============================================================================
// Zod → Gemini Schema Converter
// ============================================================================

/**
 * Check if a Zod field should be treated as optional.
 * Includes: ZodOptional, ZodNullable, ZodDefault
 */
function isOptionalish(def: any): boolean {
  const typeName = def.typeName;
  return (
    typeName === "ZodOptional" || typeName === "ZodNullable" || typeName === "ZodDefault"
  );
}

function zodToGeminiSchema(schema: z.ZodType): Schema {
  const def = (schema as any)._def;

  if (def.typeName === "ZodObject") {
    const shape = def.shape();
    const properties: Record<string, Schema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = zodPropertyToSchema(value as z.ZodType);
      const fieldDef = (value as any)._def;
      const optionalish = isOptionalish(fieldDef);
      properties[key] = optionalish ? withNullable(fieldSchema) : fieldSchema;
      // Exclude optional-ish types from required
      if (!optionalish) {
        required.push(key);
      }
    }

    return {
      type: Type.OBJECT,
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  throw new Error(`Root schema must be ZodObject, got: ${def.typeName}`);
}

function zodPropertyToSchema(schema: z.ZodType): Schema {
  const def = (schema as any)._def;
  const typeName = def.typeName;

  switch (typeName) {
    case "ZodString":
      return { type: Type.STRING, description: def.description };

    case "ZodNumber":
      return { type: Type.NUMBER, description: def.description };

    case "ZodBoolean":
      return { type: Type.BOOLEAN, description: def.description };

    case "ZodEnum":
      return { type: Type.STRING, enum: def.values, description: def.description };

    case "ZodArray":
      return {
        type: Type.ARRAY,
        items: zodPropertyToSchema(def.type),
        description: def.description,
      };

    case "ZodObject": {
      const shape = def.shape();
      const properties: Record<string, Schema> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = zodPropertyToSchema(value as z.ZodType);
        const fieldDef = (value as any)._def;
        const optionalish = isOptionalish(fieldDef);
        properties[key] = optionalish ? withNullable(fieldSchema) : fieldSchema;
        if (!optionalish) {
          required.push(key);
        }
      }

      return {
        type: Type.OBJECT,
        properties,
        ...(required.length > 0 ? { required } : {}),
        description: def.description,
      };
    }

    case "ZodOptional":
    case "ZodNullable":
      return zodPropertyToSchema(def.innerType);

    case "ZodDefault":
      // Unwrap default, the default value is handled at runtime
      return zodPropertyToSchema(def.innerType);

    case "ZodUnion": {
      const options = def.options as z.ZodType[];

      // Try to convert to enum if all options are string literals
      const allStringLiterals = options.every(
        (opt: any) =>
          opt._def.typeName === "ZodLiteral" && typeof opt._def.value === "string",
      );
      if (allStringLiterals) {
        const values = options.map((opt: any) => opt._def.value as string);
        return { type: Type.STRING, enum: values };
      }

      // Try to detect common base type
      const typeNames = options.map((opt: any) => opt._def.typeName);
      const uniqueTypes = [...new Set(typeNames)];

      if (uniqueTypes.length === 1) {
        // All same type, use first
        return zodPropertyToSchema(options[0]);
      }

      // Mixed types - conservative downgrade
      console.warn(
        `ZodUnion with mixed types [${uniqueTypes.join(", ")}] cannot be represented. ` +
          `Falling back to string schema.`,
      );
      return { type: Type.STRING };
    }

    case "ZodLiteral": {
      const value = def.value;
      if (typeof value === "string") return { type: Type.STRING, enum: [value] };
      if (typeof value === "number") return { type: Type.NUMBER };
      if (typeof value === "boolean") return { type: Type.BOOLEAN };
      return { type: Type.STRING };
    }

    // Extended Zod type support
    case "ZodEffects":
      // .refine(), .transform(), .preprocess() - unwrap to inner schema
      return zodPropertyToSchema(def.schema);

    case "ZodBranded":
      // z.string().brand<"MyBrand">() - unwrap to inner type
      return zodPropertyToSchema(def.type);

    case "ZodPipeline":
      // z.string().pipe(z.coerce.number()) - use output schema
      return zodPropertyToSchema(def.out);

    case "ZodLazy":
      // z.lazy(() => schema) - unwrap the getter
      return zodPropertyToSchema(def.getter());

    case "ZodCatch":
      // z.string().catch("default") - unwrap to inner type
      return zodPropertyToSchema(def.innerType);

    case "ZodPromise":
      // z.promise(z.string()) - use inner type
      return zodPropertyToSchema(def.type);

    case "ZodRecord":
      // z.record(z.string()) - map to object with additionalProperties
      return {
        type: Type.OBJECT,
        description: def.description,
        // Gemini doesn't support additionalProperties well, so we just mark it as object
      };

    case "ZodTuple": {
      // z.tuple([z.string(), z.number()]) - convert to array (loses type precision)
      const items = def.items as z.ZodType[];
      if (items.length > 0) {
        // Use first item as representative type
        return {
          type: Type.ARRAY,
          items: zodPropertyToSchema(items[0]),
          description: def.description,
        };
      }
      return { type: Type.ARRAY, description: def.description };
    }

    case "ZodIntersection":
      // z.intersection(a, b) - use left side (approximation)
      return zodPropertyToSchema(def.left);

    case "ZodDiscriminatedUnion": {
      // z.discriminatedUnion("type", [...]) - treat like union
      const duOptions = def.options as z.ZodType[];
      if (duOptions.length > 0) {
        return zodPropertyToSchema(duOptions[0]);
      }
      return { type: Type.OBJECT, description: def.description };
    }

    case "ZodNativeEnum": {
      // z.nativeEnum(MyEnum) - extract values as enum
      const enumValues = Object.values(def.values);
      const stringValues = enumValues.filter((v): v is string => typeof v === "string");
      if (stringValues.length > 0) {
        return { type: Type.STRING, enum: stringValues, description: def.description };
      }
      return { type: Type.NUMBER, description: def.description };
    }

    case "ZodDate":
      // z.date() - convert to string (ISO format expected)
      return {
        type: Type.STRING,
        description: def.description ?? "ISO 8601 date string",
      };

    case "ZodBigInt":
      // z.bigint() - convert to string (for precision)
      return { type: Type.STRING, description: def.description ?? "BigInt as string" };

    case "ZodAny":
    case "ZodUnknown":
      // z.any() / z.unknown() - allow any
      return { type: Type.STRING, description: def.description };

    case "ZodVoid":
    case "ZodUndefined":
    case "ZodNull":
    case "ZodNever":
      // These shouldn't appear in tool parameters, but handle gracefully
      return { type: Type.STRING };

    default:
      console.warn(`Unsupported Zod type: ${typeName}, defaulting to string`);
      return { type: Type.STRING };
  }
}

// ============================================================================
// Serialization Check
// ============================================================================

/**
 * Check if a value is JSON-serializable and serialize it.
 * Returns the serialized object or wraps error.
 */
function safeSerialize(value: unknown): Record<string, unknown> {
  try {
    // Ensure JSON serialization succeeds
    JSON.stringify(value);

    // Wrap primitives, arrays, and objects to keep response shape stable
    return { value };
  } catch (error) {
    return {
      error: "Result is not JSON-serializable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Message Helpers
// ============================================================================

function toParts(content: AgentMessage["content"]): Part[] {
  return typeof content === "string" ? [{ text: content }] : content;
}

function withNullable(schema: Schema): Schema {
  return { ...schema, nullable: true };
}

function shouldTrimByTokens(
  usage: TokenUsage | null | undefined,
  maxContextTokens?: number,
  maxTokenUsageRatio = 0.8,
): boolean {
  if (!usage || !maxContextTokens || maxContextTokens <= 0) return false;
  return usage.totalTokens >= maxContextTokens * maxTokenUsageRatio;
}

function trimHistory(
  contents: Content[],
  options: {
    maxHistory?: number;
    usage?: TokenUsage | null;
    maxContextTokens?: number;
    maxTokenUsageRatio?: number;
  },
): void {
  const { maxHistory, usage, maxContextTokens, maxTokenUsageRatio } = options;

  const overCount = !!maxHistory && maxHistory > 0 && contents.length > maxHistory;
  const overTokens = shouldTrimByTokens(usage, maxContextTokens, maxTokenUsageRatio);

  if (!overCount && !overTokens) return;

  if (overCount) {
    contents.splice(0, contents.length - maxHistory!);
  }

  if (overTokens && contents.length > 1) {
    const keepCount = Math.max(1, Math.ceil(contents.length * 0.5));
    contents.splice(0, contents.length - keepCount);
  }
}

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

/** Sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if an error is retryable */
function isRetryableError(error: unknown, statusCodes: number[]): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Check for rate limit / overload messages
    if (
      message.includes("rate limit") ||
      message.includes("quota") ||
      message.includes("overload") ||
      message.includes("503") ||
      message.includes("429")
    ) {
      return true;
    }
    // Check for status code in error
    for (const code of statusCodes) {
      if (message.includes(String(code))) {
        return true;
      }
    }
  }
  return false;
}

/** Execute with retry and exponential backoff */
async function withRetry<T>(
  fn: () => Promise<T>,
  config: Required<RetryConfig>,
  onRetry?: (attempt: number, delay: number, error: Error) => void,
): Promise<T> {
  let lastError: Error | undefined;
  let delay = config.initialDelayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If not retryable or last attempt, throw
      if (
        attempt >= config.maxRetries ||
        !isRetryableError(error, config.retryableStatusCodes)
      ) {
        throw lastError;
      }

      // Add jitter (±10%)
      const jitter = delay * 0.1 * (Math.random() * 2 - 1);
      const actualDelay = Math.min(delay + jitter, config.maxDelayMs);

      onRetry?.(attempt + 1, actualDelay, lastError);
      await sleep(actualDelay);

      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  throw lastError;
}

/** Extract token usage from response */
function extractUsage(response: GenerateContentResponse): TokenUsage {
  const usage = response.usageMetadata;
  return {
    promptTokens: usage?.promptTokenCount ?? 0,
    completionTokens: usage?.candidatesTokenCount ?? 0,
    totalTokens: usage?.totalTokenCount ?? 0,
    thinkingTokens: usage?.thoughtsTokenCount,
  };
}

/** Aggregate multiple token usages */
function aggregateUsage(usages: TokenUsage[]): TokenUsage {
  let thinkingTotal = 0;
  let hasThinking = false;

  for (const usage of usages) {
    if (usage.thinkingTokens !== undefined) {
      hasThinking = true;
      thinkingTotal += usage.thinkingTokens;
    }
  }

  const base = usages.reduce(
    (acc, u) => ({
      promptTokens: acc.promptTokens + u.promptTokens,
      completionTokens: acc.completionTokens + u.completionTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 } as TokenUsage,
  );

  return {
    ...base,
    ...(hasThinking ? { thinkingTokens: thinkingTotal } : {}),
  };
}

// ============================================================================
// defineTool - Create a named tool
// ============================================================================

/**
 * Define a tool with Zod schema and execute function.
 *
 * @example
 * ```typescript
 * const getWeather = defineTool("getWeather", {
 *   description: "Get weather for a location",
 *   parameters: z.object({ city: z.string() }),
 *   execute: async ({ city }) => ({ temp: 22, city }),
 * });
 * ```
 */
export function defineTool<TInput, TOutput>(
  name: string,
  definition: ToolDefinition<TInput, TOutput>,
): Tool<TInput, TOutput> {
  return {
    name,
    description: definition.description,
    parameters: definition.parameters,
    schema: zodToGeminiSchema(definition.parameters),
    execute: definition.execute,
  };
}

// ============================================================================
// runAgent - Execute agent with tool loop
// ============================================================================

/**
 * Run a Gemini agent with full tool-calling loop.
 *
 * Loop: generateContent → functionCalls → execute → functionResponse → repeat
 * Stops when: no more function calls OR maxSteps reached
 *
 * @example
 * ```typescript
 * const result = await runAgent({
 *   apiKey: process.env.GOOGLE_API_KEY!,
 *   model: "gemini-2.5-flash",
 *   systemInstruction: "You are a helpful assistant.",
 *   messages: [{ role: "user", content: "What's the weather in Tokyo and Paris?" }],
 *   tools: { getWeather },
 *   maxSteps: 5,
 *   executionMode: "serial", // or "parallel"
 * });
 *
 * console.log(result.toolCalls); // All executed tool calls
 * console.log(result.text);      // Final text response
 * ```
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const {
    apiKey,
    model = "gemini-2.5-flash",
    systemInstruction,
    messages,
    tools,
    toolChoice = "auto",
    maxSteps = 10,
    thinkingBudget,
    executionMode = "serial",
    retry,
    config: userConfig,
    maxHistory,
    maxContextTokens,
    maxTokenUsageRatio,
  } = options;

  const retryConfig: Required<RetryConfig> = { ...DEFAULT_RETRY_CONFIG, ...retry };
  const ai = new GoogleGenAI({ apiKey });

  // Build toolByName map for lookup by tool.name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolByName: Record<string, Tool<any, any>> = {};
  for (const tool of Object.values(tools)) {
    toolByName[tool.name] = tool;
  }

  // Build function declarations using tool.name
  const functionDeclarations: FunctionDeclaration[] = Object.values(tools).map(
    (tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    }),
  );

  // Extract allowed function names from tool.name (not object keys)
  const allowedFunctionNames = Object.values(tools).map((t) => t.name);

  // Map toolChoice to Gemini mode
  const modeMap: Record<ToolChoice, FunctionCallingConfigMode> = {
    auto: FunctionCallingConfigMode.AUTO,
    required: FunctionCallingConfigMode.ANY,
    none: FunctionCallingConfigMode.NONE,
  };

  // Build config (merge user config but preserve tool-loop control)
  const config: GenerateContentConfig = {
    ...userConfig,
    tools: [{ functionDeclarations }],
    toolConfig: {
      ...userConfig?.toolConfig,
      functionCallingConfig: {
        ...(userConfig?.toolConfig?.functionCallingConfig ?? {}),
        mode: modeMap[toolChoice],
        ...(toolChoice === "required" ? { allowedFunctionNames } : {}),
      },
    },
  };

  if (systemInstruction) {
    config.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (thinkingBudget !== undefined) {
    config.thinkingConfig = { thinkingBudget };
  }

  // Initialize contents from messages
  const contents: Content[] = messages.map((m) => ({
    role: m.role,
    parts: toParts(m.content),
  }));
  trimHistory(contents, { maxHistory, maxContextTokens, maxTokenUsageRatio });

  const allToolCalls: ToolCallRecord[] = [];
  const steps: AgentStep[] = [];
  const usages: TokenUsage[] = [];
  let stepCount = 0;
  let finalText: string | null = null;
  let lastUsage: TokenUsage | null = null;

  // Agent loop
  while (stepCount < maxSteps) {
    stepCount++;

    trimHistory(contents, {
      maxHistory,
      usage: lastUsage,
      maxContextTokens,
      maxTokenUsageRatio,
    });

    let response: GenerateContentResponse;
    try {
      response = await withRetry(
        () =>
          ai.models.generateContent({
            model,
            contents,
            config,
          }),
        retryConfig,
        (attempt, delay, error) => {
          console.warn(
            `Retry attempt ${attempt} after ${delay}ms due to: ${error.message}`,
          );
        },
      );
    } catch (error) {
      console.error("Agent generateContent failed:", error);
      return {
        text: finalText,
        toolCalls: allToolCalls,
        steps,
        finishReason: "error",
        stepCount,
        usage: aggregateUsage(usages),
      };
    }

    // Track token usage
    lastUsage = extractUsage(response);
    usages.push(lastUsage);

    const functionCalls = response.functionCalls;

    // No function calls → we're done
    if (!functionCalls || functionCalls.length === 0) {
      finalText = response.text ?? null;
      steps.push({ type: "text", text: finalText ?? undefined });
      return {
        text: finalText,
        toolCalls: allToolCalls,
        steps,
        finishReason: "stop",
        stepCount,
        usage: aggregateUsage(usages),
      };
    }

    const preludeText = response.text ?? null;
    if (preludeText) {
      steps.push({ type: "text", text: preludeText });
    }

    // Execute function calls
    const stepToolCalls: ToolCallRecord[] = [];
    const functionResponseParts: Part[] = [];

    // Helper to execute a single tool call
    const executeCall = async (
      call: FunctionCall,
    ): Promise<{
      record: ToolCallRecord;
      responsePart: Part;
    }> => {
      const toolName = call.name ?? "unknown";
      const rawArgs = call.args;

      const tool = toolByName[toolName];
      if (!tool) {
        const errorResult = { ok: false as const, error: `Unknown tool: ${toolName}` };
        return {
          record: {
            name: toolName,
            rawArgs,
            parsedArgs: undefined,
            result: errorResult,
          },
          responsePart: {
            functionResponse: {
              name: toolName,
              response: safeSerialize(errorResult),
            },
          },
        };
      }

      // Parse args
      let parsedArgs: unknown;
      try {
        parsedArgs = tool.parameters.parse(rawArgs);
      } catch (parseError) {
        const errorResult = {
          ok: false as const,
          error: `Argument parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        };
        return {
          record: {
            name: toolName,
            rawArgs,
            parsedArgs: undefined,
            result: errorResult,
          },
          responsePart: {
            functionResponse: {
              name: toolName,
              response: safeSerialize(errorResult),
            },
          },
        };
      }

      // Execute
      try {
        const data = await tool.execute(parsedArgs);
        const successResult = { ok: true as const, data };
        return {
          record: {
            name: toolName,
            rawArgs,
            parsedArgs,
            result: successResult,
          },
          responsePart: {
            functionResponse: {
              name: toolName,
              response: safeSerialize(successResult),
            },
          },
        };
      } catch (execError) {
        const errorResult = {
          ok: false as const,
          error: execError instanceof Error ? execError.message : String(execError),
        };
        return {
          record: {
            name: toolName,
            rawArgs,
            parsedArgs,
            result: errorResult,
          },
          responsePart: {
            functionResponse: {
              name: toolName,
              response: safeSerialize(errorResult),
            },
          },
        };
      }
    };

    // Execute based on mode
    if (executionMode === "parallel") {
      // Parallel execution
      const results = await Promise.all(functionCalls.map(executeCall));
      for (const { record, responsePart } of results) {
        stepToolCalls.push(record);
        functionResponseParts.push(responsePart);
      }
    } else {
      // Serial execution (default, safer)
      for (const call of functionCalls) {
        const { record, responsePart } = await executeCall(call);
        stepToolCalls.push(record);
        functionResponseParts.push(responsePart);
      }
    }

    allToolCalls.push(...stepToolCalls);
    steps.push({ type: "tool_calls", toolCalls: stepToolCalls });

    // Append model's function call turn
    contents.push({
      role: "model",
      parts: [
        ...(preludeText ? [{ text: preludeText }] : []),
        ...functionCalls.map((call) => ({ functionCall: call })),
      ],
    });

    // Append user's function response turn
    contents.push({
      role: "user",
      parts: functionResponseParts,
    });

    trimHistory(contents, {
      maxHistory,
      usage: lastUsage,
      maxContextTokens,
      maxTokenUsageRatio,
    });
  }

  // Reached maxSteps
  return {
    text: finalText,
    toolCalls: allToolCalls,
    steps,
    finishReason: "max_steps",
    stepCount,
    usage: aggregateUsage(usages),
  };
}

// ============================================================================
// Utilities
// ============================================================================

/** Truncate a string to max length */
export function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

// ============================================================================
// Streaming Types
// ============================================================================

/** Types of events emitted during streaming */
export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "text_done"; text: string }
  | { type: "tool_call_start"; name: string; callIndex: number }
  | { type: "tool_call_args"; callIndex: number; argsDelta: string }
  | { type: "tool_call_done"; record: ToolCallRecord }
  | { type: "step_done"; step: AgentStep }
  | { type: "done"; result: AgentResult }
  | { type: "error"; error: Error };

/** Streaming agent options (extends RunAgentOptions) */
export interface StreamAgentOptions extends RunAgentOptions {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

// ============================================================================
// runAgentStream - Streaming Agent Execution
// ============================================================================

/**
 * Run a Gemini agent with streaming support.
 *
 * Yields events as they occur:
 * - text_delta: Partial text chunks
 * - tool_call_start: Tool call begins
 * - tool_call_done: Tool call completed with result
 * - step_done: A full step (text or tool_calls) completed
 * - done: Agent finished with full result
 * - error: An error occurred
 *
 * @example
 * ```typescript
 * for await (const event of runAgentStream({
 *   apiKey: process.env.GOOGLE_API_KEY!,
 *   model: "gemini-2.5-flash",
 *   messages: [{ role: "user", content: "What's the weather?" }],
 *   tools: { getWeather },
 * })) {
 *   switch (event.type) {
 *     case "text_delta":
 *       process.stdout.write(event.delta);
 *       break;
 *     case "tool_call_done":
 *       console.log("Tool executed:", event.record.name);
 *       break;
 *     case "done":
 *       console.log("Finished:", event.result.finishReason);
 *       break;
 *   }
 * }
 * ```
 */
export async function* runAgentStream(
  options: StreamAgentOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const {
    apiKey,
    model = "gemini-2.5-flash",
    systemInstruction,
    messages,
    tools,
    toolChoice = "auto",
    maxSteps = 10,
    thinkingBudget,
    executionMode = "serial",
    retry,
    signal,
    config: userConfig,
    maxHistory,
    maxContextTokens,
    maxTokenUsageRatio,
  } = options;

  const retryConfig: Required<RetryConfig> = { ...DEFAULT_RETRY_CONFIG, ...retry };
  const ai = new GoogleGenAI({ apiKey });

  // Build toolByName map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolByName: Record<string, Tool<any, any>> = {};
  for (const tool of Object.values(tools)) {
    toolByName[tool.name] = tool;
  }

  // Build function declarations
  const functionDeclarations: FunctionDeclaration[] = Object.values(tools).map(
    (tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    }),
  );

  const allowedFunctionNames = Object.values(tools).map((t) => t.name);

  const modeMap: Record<ToolChoice, FunctionCallingConfigMode> = {
    auto: FunctionCallingConfigMode.AUTO,
    required: FunctionCallingConfigMode.ANY,
    none: FunctionCallingConfigMode.NONE,
  };

  const config: GenerateContentConfig = {
    ...userConfig,
    tools: [{ functionDeclarations }],
    toolConfig: {
      ...userConfig?.toolConfig,
      functionCallingConfig: {
        ...(userConfig?.toolConfig?.functionCallingConfig ?? {}),
        mode: modeMap[toolChoice],
        ...(toolChoice === "required" ? { allowedFunctionNames } : {}),
      },
    },
  };

  if (systemInstruction) {
    config.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (thinkingBudget !== undefined) {
    config.thinkingConfig = { thinkingBudget };
  }

  const contents: Content[] = messages.map((m) => ({
    role: m.role,
    parts: toParts(m.content),
  }));
  trimHistory(contents, { maxHistory, maxContextTokens, maxTokenUsageRatio });

  const allToolCalls: ToolCallRecord[] = [];
  const steps: AgentStep[] = [];
  const usages: TokenUsage[] = [];
  let stepCount = 0;
  let finalText: string | null = null;
  let lastUsage: TokenUsage | null = null;

  // Agent loop
  while (stepCount < maxSteps) {
    // Check for abort
    if (signal?.aborted) {
      yield {
        type: "error",
        error: new Error("Aborted"),
      };
      return;
    }

    stepCount++;

    trimHistory(contents, {
      maxHistory,
      usage: lastUsage,
      maxContextTokens,
      maxTokenUsageRatio,
    });

    let accumulatedText = "";
    let lastFunctionCalls: FunctionCall[] | null = null;
    let finalUsage: TokenUsage | null = null;

    try {
      // Use streaming API
      const streamResponse = await withRetry(
        () =>
          ai.models.generateContentStream({
            model,
            contents,
            config,
          }),
        retryConfig,
      );

      // Process stream chunks
      for await (const chunk of streamResponse) {
        if (signal?.aborted) {
          yield { type: "error", error: new Error("Aborted") };
          return;
        }

        // Handle text chunks
        if (chunk.text) {
          accumulatedText += chunk.text;
          yield { type: "text_delta", delta: chunk.text };
        }

        // Handle function calls (final chunk contains full calls)
        if (chunk.functionCalls) {
          lastFunctionCalls = chunk.functionCalls;
        }

        // Capture usage from final chunk (only once)
        if (chunk.usageMetadata) {
          finalUsage = extractUsage(chunk as GenerateContentResponse);
        }
      }

      if (finalUsage) {
        lastUsage = finalUsage;
        usages.push(finalUsage);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      yield { type: "error", error: err };
      yield {
        type: "done",
        result: {
          text: finalText,
          toolCalls: allToolCalls,
          steps,
          finishReason: "error",
          stepCount,
          usage: aggregateUsage(usages),
        },
      };
      return;
    }

    const functionCalls = lastFunctionCalls ?? [];

    // No function calls → text response, we're done
    if (functionCalls.length === 0) {
      finalText = accumulatedText || null;
      if (finalText) {
        yield { type: "text_done", text: finalText };
      }
      steps.push({ type: "text", text: finalText ?? undefined });
      yield { type: "step_done", step: steps[steps.length - 1] };
      yield {
        type: "done",
        result: {
          text: finalText,
          toolCalls: allToolCalls,
          steps,
          finishReason: "stop",
          stepCount,
          usage: aggregateUsage(usages),
        },
      };
      return;
    }

    const preludeText = accumulatedText || null;
    if (preludeText) {
      yield { type: "text_done", text: preludeText };
      steps.push({ type: "text", text: preludeText });
      yield { type: "step_done", step: steps[steps.length - 1] };
    }

    // Execute function calls
    const stepToolCalls: ToolCallRecord[] = [];
    const functionResponseParts: Part[] = [];

    const executeCall = async (
      call: FunctionCall,
    ): Promise<{ record: ToolCallRecord; responsePart: Part }> => {
      const toolName = call.name ?? "unknown";
      const rawArgs = call.args;

      const tool = toolByName[toolName];
      if (!tool) {
        const errorResult = { ok: false as const, error: `Unknown tool: ${toolName}` };
        const record: ToolCallRecord = {
          name: toolName,
          rawArgs,
          parsedArgs: undefined,
          result: errorResult,
        };
        return {
          record,
          responsePart: {
            functionResponse: { name: toolName, response: safeSerialize(errorResult) },
          },
        };
      }

      let parsedArgs: unknown;
      try {
        parsedArgs = tool.parameters.parse(rawArgs);
      } catch (parseError) {
        const errorResult = {
          ok: false as const,
          error: `Argument parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        };
        return {
          record: { name: toolName, rawArgs, parsedArgs: undefined, result: errorResult },
          responsePart: {
            functionResponse: { name: toolName, response: safeSerialize(errorResult) },
          },
        };
      }

      try {
        const data = await tool.execute(parsedArgs);
        const successResult = { ok: true as const, data };
        return {
          record: { name: toolName, rawArgs, parsedArgs, result: successResult },
          responsePart: {
            functionResponse: { name: toolName, response: safeSerialize(successResult) },
          },
        };
      } catch (execError) {
        const errorResult = {
          ok: false as const,
          error: execError instanceof Error ? execError.message : String(execError),
        };
        return {
          record: { name: toolName, rawArgs, parsedArgs, result: errorResult },
          responsePart: {
            functionResponse: { name: toolName, response: safeSerialize(errorResult) },
          },
        };
      }
    };

    // Execute tools and yield events
    if (executionMode === "parallel") {
      const promises = functionCalls.map(async (call) => {
        const result = await executeCall(call);
        return result;
      });

      for (const promiseResult of await Promise.all(promises)) {
        const { record, responsePart } = promiseResult;
        stepToolCalls.push(record);
        functionResponseParts.push(responsePart);
        yield { type: "tool_call_done", record };
      }
    } else {
      for (let idx = 0; idx < functionCalls.length; idx++) {
        yield {
          type: "tool_call_start",
          name: functionCalls[idx].name ?? "unknown",
          callIndex: idx,
        };
        const { record, responsePart } = await executeCall(functionCalls[idx]);
        stepToolCalls.push(record);
        functionResponseParts.push(responsePart);
        yield { type: "tool_call_done", record };
      }
    }

    allToolCalls.push(...stepToolCalls);
    steps.push({ type: "tool_calls", toolCalls: stepToolCalls });
    yield { type: "step_done", step: steps[steps.length - 1] };

    // Append to conversation
    contents.push({
      role: "model",
      parts: [
        ...(preludeText ? [{ text: preludeText }] : []),
        ...functionCalls.map((call) => ({ functionCall: call })),
      ],
    });
    contents.push({
      role: "user",
      parts: functionResponseParts,
    });

    trimHistory(contents, {
      maxHistory,
      usage: lastUsage,
      maxContextTokens,
      maxTokenUsageRatio,
    });
  }

  // Reached maxSteps
  yield {
    type: "done",
    result: {
      text: finalText,
      toolCalls: allToolCalls,
      steps,
      finishReason: "max_steps",
      stepCount,
      usage: aggregateUsage(usages),
    },
  };
}
