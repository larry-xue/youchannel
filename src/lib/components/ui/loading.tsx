import { cn } from "~/lib/utils";

type LoadingProps = {
  className?: string;
  text?: string;
};

export function Loading({ className, text }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-4 py-8", className)}
    >
      <div className="relative h-16 w-16 saturate-150">
        <div
          aria-hidden="true"
          className={cn(
            "absolute -inset-10 rounded-full blur-3xl opacity-25 dark:opacity-30",
            "bg-[radial-gradient(closest-side_at_30%_25%,var(--brand-orange)_0%,transparent_72%),radial-gradient(closest-side_at_72%_22%,var(--brand-blue)_0%,transparent_70%),radial-gradient(closest-side_at_50%_78%,var(--brand-green)_0%,transparent_75%)]",
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "absolute -inset-8 rounded-full blur-2xl opacity-30 dark:opacity-35",
            "bg-[radial-gradient(closest-side_at_25%_70%,var(--brand-blue)_0%,transparent_72%),radial-gradient(closest-side_at_78%_62%,var(--brand-orange)_0%,transparent_74%),radial-gradient(closest-side_at_45%_30%,var(--brand-green)_0%,transparent_75%)]",
            "motion-safe:animate-[spin_9s_linear_infinite] motion-reduce:animate-none",
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "absolute -inset-6 rounded-full blur-2xl opacity-25 dark:opacity-30",
            "bg-[radial-gradient(closest-side_at_50%_50%,var(--brand-orange)_0%,transparent_68%),radial-gradient(closest-side_at_55%_48%,var(--brand-blue)_0%,transparent_70%),radial-gradient(closest-side_at_48%_55%,var(--brand-green)_0%,transparent_72%)]",
            "motion-safe:animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite] motion-reduce:animate-none",
            "[animation-delay:-1.3s]",
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "absolute -inset-2 rounded-full blur-xl opacity-30 dark:opacity-35",
            "bg-[radial-gradient(closest-side_at_40%_40%,var(--brand-orange)_0%,transparent_70%),radial-gradient(closest-side_at_62%_38%,var(--brand-blue)_0%,transparent_72%),radial-gradient(closest-side_at_52%_64%,var(--brand-green)_0%,transparent_74%)]",
            "motion-safe:animate-[pulse_1.8s_ease-in-out_infinite] motion-reduce:animate-none",
          )}
        />
      </div>

      {text ? (
        <p className="font-display max-w-xs text-center text-sm font-medium text-muted-foreground">
          {text}
        </p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}
