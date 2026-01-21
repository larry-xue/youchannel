/**
 * Retry utilities for handling transient network failures
 */

export type RetryOptions = {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  onRetry?: (attempt: number, error: unknown) => void;
};

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 8000,
};

/**
 * Executes a function with exponential backoff retry logic
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(opts.baseDelay * Math.pow(2, attempt), opts.maxDelay);

      if (opts.onRetry) {
        opts.onRetry(attempt + 1, error);
      }

      console.warn(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms`, error);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Message sync status
 */
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

export type MessageSyncState = {
  id: string;
  status: SyncStatus;
  retryCount: number;
  lastError?: string;
};

export class MessageSyncQueue {
  private messageStates = new Map<string, MessageSyncState>();
  private onStateChange?: (states: Map<string, MessageSyncState>) => void;

  constructor(onStateChange?: (states: Map<string, MessageSyncState>) => void) {
    this.onStateChange = onStateChange;
  }

  /**
   * Mark messages as pending sync
   */
  markPending(messageIds: string[]): void {
    messageIds.forEach((id) => {
      if (!this.messageStates.has(id)) {
        this.messageStates.set(id, {
          id,
          status: "pending",
          retryCount: 0,
        });
      }
    });
    this.notifyChange();
  }

  /**
   * Mark messages as currently syncing
   */
  markSyncing(messageIds: string[]): void {
    messageIds.forEach((id) => {
      const state = this.messageStates.get(id);
      if (state) {
        state.status = "syncing";
      }
    });
    this.notifyChange();
  }

  /**
   * Mark messages as successfully synced
   */
  markSynced(messageIds: string[]): void {
    messageIds.forEach((id) => {
      this.messageStates.delete(id);
    });
    this.notifyChange();
  }

  /**
   * Mark messages as failed with retry increment
   */
  markFailed(messageIds: string[], error: string): void {
    messageIds.forEach((id) => {
      const state = this.messageStates.get(id);
      if (state) {
        state.status = "failed";
        state.retryCount++;
        state.lastError = error;
      }
    });
    this.notifyChange();
  }

  /**
   * Get messages that are pending or failed and eligible for retry
   */
  getPendingMessages(): string[] {
    return Array.from(this.messageStates.values())
      .filter((state) => state.status === "pending" || (state.status === "failed" && state.retryCount < 3))
      .map((state) => state.id);
  }

  /**
   * Get messages that have permanently failed (exceeded retry limit)
   */
  getFailedMessages(): MessageSyncState[] {
    return Array.from(this.messageStates.values()).filter(
      (state) => state.status === "failed" && state.retryCount >= 3,
    );
  }

  /**
   * Get the current status of a message
   */
  getStatus(messageId: string): SyncStatus | undefined {
    return this.messageStates.get(messageId)?.status;
  }

  /**
   * Get all sync states
   */
  getAllStates(): Map<string, MessageSyncState> {
    return new Map(this.messageStates);
  }

  /**
   * Clear all states
   */
  clear(): void {
    this.messageStates.clear();
    this.notifyChange();
  }

  /**
   * Reset failed messages to pending for manual retry
   */
  retryFailed(): string[] {
    const failedIds: string[] = [];
    this.messageStates.forEach((state) => {
      if (state.status === "failed") {
        state.status = "pending";
        state.retryCount = 0;
        state.lastError = undefined;
        failedIds.push(state.id);
      }
    });
    this.notifyChange();
    return failedIds;
  }

  private notifyChange(): void {
    if (this.onStateChange) {
      this.onStateChange(new Map(this.messageStates));
    }
  }
}
