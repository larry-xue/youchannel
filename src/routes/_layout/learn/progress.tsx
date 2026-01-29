import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import { Loading } from "~/lib/components/ui/loading";
import { getShadowingProgressFn } from "~/lib/dashboard/learn/practice";
import { useLearningProfile } from "~/lib/hooks/useLearningProfile";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

export const Route = createFileRoute("/_layout/learn/progress")({
  component: ProgressPage,
});

const Sparkline = ({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) => {
  const points = useMemo(() => {
    if (values.length < 2) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((value, idx) => {
        const x = (idx / (values.length - 1)) * 100;
        const y = 30 - ((value - min) / span) * 30;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [values]);

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

function ProgressPage() {
  const { profile, loading: profileLoading } = useLearningProfile();
  const preferredLanguage = profile?.target_language ?? "en-US";
  const [language, setLanguage] = useState(preferredLanguage);

  useEffect(() => {
    setLanguage((current) => (current ? current : preferredLanguage));
  }, [preferredLanguage]);

  const progressQuery = useQuery({
    queryKey: ["shadowing-progress", language],
    queryFn: () => getShadowingProgressFn({ data: { language, days: 30 } }),
    enabled: Boolean(language) && profileLoading === false,
  });

  const series = progressQuery.data?.series ?? [];
  const values = series.map((point) => point.avgOverall);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="type-h1 text-foreground">{m.progress()}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {m.progress_description()}
            </p>
          </div>

          <Button asChild className="h-9 rounded-lg px-4">
            <Link to="/learn/practice">{m.progress_go_practice()}</Link>
          </Button>
        </div>

        {progressQuery.isLoading ? (
          <Loading text={m.progress_loading()} className="py-14" />
        ) : progressQuery.isError ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {m.progress_error_load()}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-muted/10 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {m.progress_best_short()}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {progressQuery.data?.bestOverall ?? "--"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/10 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {m.progress_last_short()}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {progressQuery.data?.lastOverall ?? "--"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/10 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {m.progress_trend_short()}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {progressQuery.data?.emaOverall
                    ? Math.round(progressQuery.data.emaOverall)
                    : "--"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/10 px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {m.progress_chart_title()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.progress_attempts_count({ count: progressQuery.data?.attemptsCount ?? 0 })}
                </p>
              </div>
              <div className="mt-4 h-16 rounded-xl border border-border bg-background p-3 text-foreground/70">
                {values.length >= 2 ? (
                  <Sparkline values={values} className="h-full w-full" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    {m.progress_chart_empty()}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/10 px-5 py-5">
              <p className="text-sm font-semibold text-foreground">
                {m.progress_recent_title()}
              </p>

              <div className="mt-4 space-y-3">
                {(progressQuery.data?.recentAttempts ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{m.progress_recent_empty()}</p>
                ) : (
                  progressQuery.data?.recentAttempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      className={cn(
                        "rounded-xl border border-border bg-background px-4 py-3",
                        "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{attempt.targetText}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(attempt.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-sm font-semibold text-foreground">
                        {attempt.overall}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
