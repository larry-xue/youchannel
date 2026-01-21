/**
 * Persistent storage utilities for live session sync state
 * Uses IndexedDB as primary storage with sessionStorage fallback
 */

const DB_NAME = "live_session_storage";
const DB_VERSION = 1;
const STORE_NAME = "sync_state";

type SyncState = {
  sessionId: string;
  syncedMessageIds: string[];
  lastUpdated: number;
};

class LiveSessionStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (this.db) return;

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        console.warn("[LiveStorage] IndexedDB not available, will use sessionStorage fallback");
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.warn("[LiveStorage] IndexedDB open failed, will use sessionStorage fallback", request.error);
        resolve();
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
        }
      };
    });

    return this.initPromise;
  }

  async saveSyncedIds(sessionId: string, ids: Set<string>): Promise<void> {
    await this.init();

    const state: SyncState = {
      sessionId,
      syncedMessageIds: [...ids],
      lastUpdated: Date.now(),
    };

    // Try IndexedDB first
    if (this.db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const request = store.put(state);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        return;
      } catch (err) {
        console.warn("[LiveStorage] IndexedDB save failed, falling back to sessionStorage", err);
      }
    }

    // Fallback to sessionStorage
    try {
      const key = `syncedMessageIds-${sessionId}`;
      sessionStorage.setItem(key, JSON.stringify(state.syncedMessageIds));
    } catch (err) {
      console.error("[LiveStorage] sessionStorage save failed", err);
    }
  }

  async loadSyncedIds(sessionId: string): Promise<Set<string>> {
    await this.init();

    // Try IndexedDB first
    if (this.db) {
      try {
        const state = await new Promise<SyncState | undefined>((resolve, reject) => {
          const tx = this.db!.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(sessionId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (state) {
          return new Set(state.syncedMessageIds);
        }
      } catch (err) {
        console.warn("[LiveStorage] IndexedDB load failed, falling back to sessionStorage", err);
      }
    }

    // Fallback to sessionStorage
    try {
      const key = `syncedMessageIds-${sessionId}`;
      const stored = sessionStorage.getItem(key);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (err) {
      console.warn("[LiveStorage] sessionStorage load failed", err);
    }

    return new Set();
  }

  async clearSyncedIds(sessionId: string): Promise<void> {
    await this.init();

    // Try IndexedDB first
    if (this.db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const request = store.delete(sessionId);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (err) {
        console.warn("[LiveStorage] IndexedDB clear failed", err);
      }
    }

    // Also clear from sessionStorage
    try {
      const key = `syncedMessageIds-${sessionId}`;
      sessionStorage.removeItem(key);
    } catch (err) {
      console.warn("[LiveStorage] sessionStorage clear failed", err);
    }
  }

  async cleanup(): Promise<void> {
    await this.init();

    // Remove entries older than 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    if (this.db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const request = store.openCursor();

          request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
              const state = cursor.value as SyncState;
              if (state.lastUpdated < cutoff) {
                cursor.delete();
              }
              cursor.continue();
            } else {
              resolve();
            }
          };
          request.onerror = () => reject(request.error);
        });
      } catch (err) {
        console.warn("[LiveStorage] Cleanup failed", err);
      }
    }
  }
}

export const liveSessionStorage = new LiveSessionStorage();
