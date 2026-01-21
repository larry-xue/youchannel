import { useBlocker } from "@tanstack/react-router";
import { useEffect } from "react";

type SessionBlockerProps = {
  disconnect: () => void;
};

export function SessionBlocker({ disconnect }: SessionBlockerProps) {
  useBlocker({
    shouldBlockFn: () => {
      const shouldLeave = window.confirm(
        "You have an active call. Do you want to end it?",
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
