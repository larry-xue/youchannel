import { cn } from "~/lib/utils";

type LoadingProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  text?: string;
};

const sizeMap = {
  sm: { container: "w-12 h-12" }, // Was w-8 h-8
  md: { container: "w-20 h-20" }, // Was w-12 h-12
  lg: { container: "w-32 h-32" }, // Was w-16 h-16
};

export function Loading({ className, size = "md", text }: LoadingProps) {
  const sizes = sizeMap[size];

  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 py-8", className)}
    >
      <div className={cn("relative", sizes.container)}>
        <img
          src="/loading.png"
          alt="Loading..."
          className="w-full h-full animate-[spin_3s_steps(8)_infinite]"
        />
      </div>
    </div>
  );
}
