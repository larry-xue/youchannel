import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AmbientGlowBackdrop } from "~/lib/dashboard/live/components/AmbientGlowBackdrop";
import { LiveVoiceSession } from "~/lib/dashboard/live/components/LiveVoiceSession";
import { PersonaSelector } from "~/lib/dashboard/live/components/PersonaSelector";
import {
  DEFAULT_PERSONA_ID,
  getPersonaById,
  type Persona,
} from "~/lib/dashboard/live/constants";

export const Route = createFileRoute("/_layout/live")({
  component: LivePage,
  head: () => ({
    meta: [
      {
        title: "Live Voice Chat | Fluentlyby.ai",
      },
      {
        name: "description",
        content: "Practice speaking with AI-powered conversation partners",
      },
    ],
  }),
});

function LivePage() {
  const [selectedPersona, setSelectedPersona] = useState<Persona>(
    getPersonaById(DEFAULT_PERSONA_ID),
  );
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const handleLevelChange = (input: number, output: number) => {
    setInputLevel(input);
    setOutputLevel(output);
  };

  return (
    <div className="relative min-h-[calc(100vh-6rem)] overflow-hidden">
      {/* Dynamic ambient background */}
      <AmbientGlowBackdrop
        inputLevel={inputLevel}
        outputLevel={outputLevel}
        className="absolute inset-0 -z-10"
      />

      {/* Main content */}
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-6rem)] px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Glassmorphism card */}
          <div className="rounded-3xl bg-surface/40 backdrop-blur-xl border border-border-soft/50 shadow-lll-lg p-6 sm:p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
                Live Voice Chat
              </h1>
              <p className="text-sm text-muted-foreground">
                Practice speaking with an AI conversation partner
              </p>
            </div>

            {/* Persona selector */}
            <div className="mb-6">
              <PersonaSelector
                selectedId={selectedPersona.id}
                onSelect={setSelectedPersona}
              />
            </div>

            {/* Voice session */}
            <LiveVoiceSession
              persona={selectedPersona}
              onLevelChange={handleLevelChange}
            />
          </div>

          {/* Footer hint */}
          <p className="text-center text-xs text-muted-foreground/60 mt-4">
            Your conversations are not stored
          </p>
        </div>
      </div>
    </div>
  );
}
