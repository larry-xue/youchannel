import { cn } from "~/lib/utils";

interface AmbientGlowBackdropProps {
  inputLevel?: number;
  outputLevel?: number;
  className?: string;
}

export function AmbientGlowBackdrop({
  className,
}: AmbientGlowBackdropProps) {
  return <div className={cn("pointer-events-none", className)} aria-hidden="true" />;
}
