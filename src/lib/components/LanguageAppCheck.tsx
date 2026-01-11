import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/lib/components/ui/dialog";
import { LearningSettings } from "~/lib/components/LearningSettings";
import { useLearningProfile } from "~/lib/hooks/useLearningProfile";
import * as m from "~/paraglide/messages";

export function LanguageAppCheck({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useLearningProfile();
  // If loading, we can decide to show nothing, or show the app (and pop up later).
  // Showing nothing avoids flickering, but might feel slow. 
  // Given this is a blocking "onboarding" step, showing a loader is safer.

  // However, purely optional: if we want to avoid blocking the whole app while checking,
  // we can just return children and let the dialog pop up on top.
  // But if the goal is "must select before using", blocking is better.

  // Add local state to manually close the dialog upon success,
  // in case the subscription update is slow or disconnected.
  const [manuallyClosed, setManuallyClosed] = React.useState(false);

  if (loading) {
    return <>{children}</>;
  }

  const hasLanguage = !!profile?.target_language;

  if (hasLanguage || manuallyClosed) {
    return <>{children}</>;
  }

  return (
    <>
      <Dialog open={true} onOpenChange={() => { }}>
        {/* Prevent closing by passing empty onOpenChange and removing close button via CSS or custom content */}
        <DialogContent
          className="sm:max-w-[625px] [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{m.user_settings()}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              {m.learning_settings_modal_instruction()}
            </p>
            <LearningSettings onSuccess={() => setManuallyClosed(true)} />
          </div>
        </DialogContent>
      </Dialog>
      {/* We render children regardless, but the modal will overlay/block interaction if active. 
          Actually, if we want to strictly block "entering the page", maybe we shouldn't render children? 
          But the user said "enter page then appear window", implying the page might be visible behind.
      */}
      {children}
    </>
  );
}
