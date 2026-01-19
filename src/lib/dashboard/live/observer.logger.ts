import { appendFile } from "node:fs/promises";

export async function logObserver(event: Record<string, unknown>) {
  const line = `${new Date().toISOString()} ${JSON.stringify(event)}\n`;
  try {
    await appendFile("logs/observer.log", line, "utf8");
  } catch (err) {
    console.error("observer.log failed", err);
  }
}
