import { cn } from "~/lib/utils";

interface AmbientGlowBackdropProps {
  inputLevel?: number; // 0-1, user speaking intensity
  outputLevel?: number; // 0-1, AI speaking intensity
  className?: string;
}

export function AmbientGlowBackdrop({
  inputLevel = 0,
  outputLevel = 0,
  className,
}: AmbientGlowBackdropProps) {
  // Map levels to visual properties
  const userGlowOpacity = 0.15 + inputLevel * 0.35; // 0.15 to 0.5
  const userGlowScale = 1 + inputLevel * 0.25; // 1 to 1.25
  const aiGlowOpacity = 0.2 + outputLevel * 0.4; // 0.2 to 0.6
  const aiGlowScale = 1 + outputLevel * 0.3; // 1 to 1.3

  return (
    <div
      className={cn("pointer-events-none overflow-hidden", className)}
      aria-hidden="true"
    >
      {/* Layer 1: Base ambient - large, slow drift */}
      <div
        className="absolute -inset-[20%] rounded-full bg-primary/5 blur-3xl animate-ambient-drift motion-reduce:animate-none"
        style={{ animationDelay: "0s" }}
      />

      {/* Layer 2: Accent - medium, reverse drift */}
      <div
        className="absolute top-1/4 left-1/4 w-[80%] h-[80%] rounded-full bg-accent/10 blur-3xl animate-ambient-drift-reverse motion-reduce:animate-none"
        style={{ animationDelay: "-5s" }}
      />

      {/* Layer 3: Pulse layer - breathes continuously */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50%] h-[50%] rounded-full bg-primary/15 blur-3xl animate-ambient-breathe motion-reduce:animate-none" />

      {/* Layer 4: User speaking glow (cool color - sky) */}
      <div
        className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[35%] h-[35%] rounded-full bg-sky-400/20 blur-3xl transition-all duration-150 ease-out"
        style={{
          opacity: userGlowOpacity,
          transform: `translate(-50%, -50%) scale(${userGlowScale})`,
        }}
      />

      {/* Layer 5: AI speaking glow (warm color - amber) */}
      <div
        className="absolute top-1/2 right-1/3 translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] rounded-full bg-amber-400/25 blur-3xl transition-all duration-150 ease-out"
        style={{
          opacity: aiGlowOpacity,
          transform: `translate(50%, -50%) scale(${aiGlowScale})`,
        }}
      />
    </div>
  );
}
