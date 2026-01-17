import { cn } from "~/lib/utils";

type LoadingProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  text?: string;
};

const sizeMap = {
  sm: { container: "w-10 h-10" },
  md: { container: "w-16 h-16" },
  lg: { container: "w-24 h-24" },
};

export function Loading({ className, size = "md" }: LoadingProps) {
  const sizes = sizeMap[size];

  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 py-8", className)}
    >
      <div className={cn("relative", sizes.container)}>
        <img
          src="/loading.png"
          alt="Loading..."
          className="w-full h-full animate-spin"
          style={{
            animationDuration: "3s",
            animationTimingFunction: "steps(8)",
          }}
        />
      </div>
    </div>
  );
}
