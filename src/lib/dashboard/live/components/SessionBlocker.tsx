import { useBlocker } from "@tanstack/react-router";
import { useEffect } from "react";
import * as m from "~/paraglide/messages";

type SessionBlockerProps = {
  disconnect: () => void;
  getActiveLiveSessionId: () => string | null;
};

export function SessionBlocker({ disconnect, getActiveLiveSessionId }: SessionBlockerProps) {
  useBlocker({
    shouldBlockFn: ({ next }) => {
      const activeLiveSessionId = getActiveLiveSessionId();
      const nextSessionId =
        typeof next.params === "object" &&
        next.params !== null &&
        "sessionId" in next.params
          ? (next.params.sessionId as string | undefined)
          : null;

      // Allow internal URL updates for the currently active live session
      if (
        next.routeId === "/_layout/live/$sessionId" &&
        activeLiveSessionId &&
        nextSessionId === activeLiveSessionId
      ) {
        return false;
      }

      const shouldLeave = window.confirm(
        m.live_confirm_leave(),
      );
      if (shouldLeave) {
        disconnect();
        return false;
      }
      return true;
    },
  });

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return null;
}
