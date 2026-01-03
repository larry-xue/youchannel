import { cn } from "~/lib/utils";

type LoadingProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  text?: string;
};

const sizeMap = {
  sm: { container: "w-8 h-8", viewBox: "0 0 40 40" },
  md: { container: "w-12 h-12", viewBox: "0 0 48 48" },
  lg: { container: "w-16 h-16", viewBox: "0 0 64 64" },
};

export function Loading({ className, size = "md", text }: LoadingProps) {
  const sizes = sizeMap[size];
  const isLarge = size === "lg";
  const radius = isLarge ? 28 : size === "md" ? 20 : 16;
  const strokeWidth = isLarge ? 4 : size === "md" ? 3 : 2.5;
  const circumference = 2 * Math.PI * radius;
  const dashArray = `${circumference * 0.25} ${circumference * 0.75}`;
  const center = isLarge ? 32 : size === "md" ? 24 : 20;

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 py-8", className)}>
      <div className={cn("relative", sizes.container)}>
        <svg
          className="animate-spin"
          viewBox={sizes.viewBox}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            className="text-primary/15"
          />
          {/* Animated arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={dashArray}
            strokeDashoffset={circumference * 0.125}
            className="text-primary"
            style={{
              transformOrigin: `${center}px ${center}px`,
            }}
          />
        </svg>
      </div>
      {text && (
        <p className="text-sm font-medium text-muted-foreground animate-pulse">{text}</p>
      )}
    </div>
  );
}
