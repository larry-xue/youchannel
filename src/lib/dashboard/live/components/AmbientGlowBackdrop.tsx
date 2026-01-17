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
  const userGlowOpacity = 0.3 + inputLevel * 0.5; // 0.3 to 0.8
  const userGlowScale = 1 + inputLevel * 0.4; // 1 to 1.4
  const aiGlowOpacity = 0.3 + outputLevel * 0.5; // 0.3 to 0.8
  const aiGlowScale = 1 + outputLevel * 0.4; // 1 to 1.4

  return (
    <div
      className={cn("pointer-events-none overflow-hidden", className)}
      aria-hidden="true"
    >
      {/* Layer 1: Base gradient field - deep and rich */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background/80" />

      {/* Layer 2: Massive slow drifting orbs (background ambience) */}
      <div
        className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-indigo-500/20 blur-[150px] animate-ambient-drift motion-reduce:animate-none"
        style={{ animationDuration: "25s" }}
      />
      <div
        className="absolute top-[40%] -right-[20%] w-[80%] h-[80%] rounded-full bg-purple-500/15 blur-[180px] animate-ambient-drift-reverse motion-reduce:animate-none"
        style={{ animationDuration: "30s", animationDelay: "-5s" }}
      />
      <div
        className="absolute -bottom-[20%] left-[20%] w-[60%] h-[60%] rounded-full bg-blue-500/15 blur-[160px] animate-ambient-breathe motion-reduce:animate-none"
        style={{ animationDuration: "15s" }}
      />

      {/* Layer 3: Dynamic reacting orbs (Middle layer) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-3xl max-h-3xl">
        {/* User speaking glow (cool colors - cyan/blue) */}
        <div
          className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] rounded-full bg-gradient-radial from-cyan-400/30 via-blue-500/10 to-transparent blur-[100px] transition-all duration-200 ease-out will-change-transform"
          style={{
            opacity: userGlowOpacity,
            transform: `translate(-50%, -50%) scale(${userGlowScale})`,
          }}
        />

        {/* Intense core for user */}
        <div
          className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] rounded-full bg-cyan-300/20 blur-[60px] transition-all duration-150 ease-out"
          style={{
            opacity: Math.max(0, inputLevel * 0.8),
            transform: `translate(-50%, -50%) scale(${1 + inputLevel * 0.5})`,
          }}
        />

        {/* AI speaking glow (warm colors - violet/amber) */}
        <div
          className="absolute top-1/2 right-1/3 translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] rounded-full bg-gradient-radial from-violet-400/30 via-fuchsia-500/10 to-transparent blur-[100px] transition-all duration-200 ease-out will-change-transform"
          style={{
            opacity: aiGlowOpacity,
            transform: `translate(50%, -50%) scale(${aiGlowScale})`,
          }}
        />

        {/* Intense core for AI */}
        <div
          className="absolute top-1/2 right-1/3 translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] rounded-full bg-fuchsia-300/20 blur-[60px] transition-all duration-150 ease-out"
          style={{
            opacity: Math.max(0, outputLevel * 0.8),
            transform: `translate(50%, -50%) scale(${1 + outputLevel * 0.5})`,
          }}
        />
      </div>

      {/* Layer 4: Overlay texture/noise for depth (optional, keeping clean for now) */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background opacity-20" />
    </div>
  );
}
