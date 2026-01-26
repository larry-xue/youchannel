import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { MessageSquare, RefreshCw } from "lucide-react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/lib/components/ui/card";
import { Progress } from "~/lib/components/ui/progress";
import { getUserActiveQuotaFn } from "~/lib/server/quotas";
import * as m from "~/paraglide/messages";

import { Loading } from "~/lib/components/ui/loading";

export const Route = createFileRoute("/_layout/quotas")({
  component: QuotaPage,
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: "/signin" });
    }
  },
});

// Format seconds to human-readable duration
function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function QuotaPage() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["userQuota"],
    queryFn: () => getUserActiveQuotaFn(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          <MessageSquare className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-semibold">{m.quota_error()}</h3>
          <p className="text-sm text-muted-foreground">
            {m.connect_error_complete_failed()}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/">{m.not_found_go_back()}</Link>
        </Button>
      </div>
    );
  }

  const { summary: quota, grants } = data;

  const periodLabel = quota.periodEndAt
    ? quota.daysRemaining !== null
      ? `${quota.daysRemaining}d ${m.quota_remaining()}`
      : m.quota_period_long()
    : m.quota_period_long();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="type-h1 text-foreground">{m.quota_title()}</h1>
          <p className="type-body text-muted-foreground mt-2">
            {m.quota_page_description()}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={(e) => {
            e.preventDefault();
            refetch();
          }}
          disabled={isRefetching}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Quota Overview Area */}
      <div className="space-y-4">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Video Quota Card */}
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold">
                {m.quota_video_label()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between">
                  <div className="text-3xl font-semibold text-foreground">
                    {quota.videoPercent.toFixed(0)}
                    <span className="text-base text-muted-foreground">%</span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      {formatSeconds(quota.videoSecondsRemaining)}
                    </div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {m.quota_remaining()}
                    </div>
                  </div>
                </div>

                <Progress value={quota.videoPercent} className="h-2 w-full" />

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="font-mono opacity-80">
                    {m.quota_used_total({
                      used: formatSeconds(quota.videoSecondsUsed),
                      total: formatSeconds(quota.videoSecondsTotal),
                    })}
                  </span>
                  {quota.perVideoLimitSeconds !== null &&
                    quota.perVideoLimitSeconds > 0 && (
                      <Badge variant="secondary" className="font-normal rounded-full">
                        {m.quota_per_video({
                          limit: formatSeconds(quota.perVideoLimitSeconds),
                        })}
                      </Badge>
                    )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Chat Quota Card */}
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold">
                {m.quota_chat_label()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between">
                  <div className="text-3xl font-semibold text-foreground">
                    {quota.chatPercent.toFixed(0)}
                    <span className="text-base text-muted-foreground">%</span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      {formatSeconds(quota.chatSecondsRemaining)}
                    </div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {m.quota_remaining()}
                    </div>
                  </div>
                </div>

                <Progress
                  value={quota.chatPercent}
                  className="h-2 w-full bg-[color:var(--brand-blue)]/20"
                  indicatorClassName="bg-[color:var(--brand-blue)]"
                />

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="font-mono opacity-80">
                    {m.quota_used_total({
                      used: formatSeconds(quota.chatSecondsUsed),
                      total: formatSeconds(quota.chatSecondsTotal),
                    })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* active grants */}
      {grants.length > 0 && (
        <div className="space-y-4">
          <h2 className="type-h2 text-foreground">{m.quota_active_grants()}</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {grants.map((grant) => {
              const grantVideoUsed = Math.max(
                0,
                grant.videoSecondsTotal - grant.videoSecondsRemaining,
              );
              const grantVideoPercent =
                grant.videoSecondsTotal > 0
                  ? (grantVideoUsed / grant.videoSecondsTotal) * 100
                  : 0;

              const grantChatUsed = Math.max(
                0,
                grant.chatSecondsTotal - grant.chatSecondsRemaining,
              );
              const grantChatPercent =
                grant.chatSecondsTotal > 0
                  ? (grantChatUsed / grant.chatSecondsTotal) * 100
                  : 0;

              const expiryDate = grant.validTo ? new Date(grant.validTo) : null;
              const daysUntilExpiry = expiryDate
                ? Math.ceil(
                    (expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
                  )
                : null;

              let sourceLabel = grant.sourceType;
              if (grant.sourceType === "subscription")
                sourceLabel = m.quota_source_subscription();
              else if (grant.sourceType === "package")
                sourceLabel = m.quota_source_package();
              else if (grant.sourceType === "manual")
                sourceLabel = m.quota_source_manual();
              else if (grant.sourceType === "promo") sourceLabel = m.quota_source_promo();

              return (
                <Card
                  key={grant.id}
                  className="flex flex-col rounded-2xl border-border/60"
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{sourceLabel}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-medium">
                            {expiryDate
                              ? daysUntilExpiry && daysUntilExpiry <= 7
                                ? m.quota_grant_expires_soon({ days: daysUntilExpiry })
                                : m.quota_grant_expires({
                                    date: expiryDate.toLocaleDateString(),
                                  })
                              : m.quota_grant_no_expiry()}
                          </span>
                        </div>
                        {grant.sourceRef && (
                          <span className="font-mono text-xs text-muted-foreground/50">
                            #{grant.sourceRef.slice(0, 6)}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-6">
                    {/* Video Section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-muted-foreground">
                            {m.quota_video_label()}
                          </span>
                        </div>
                        {grant.maxVideoSeconds === 0 ? (
                          <span className="text-xs text-muted-foreground/50">
                            {m.quota_video_not_supported()}
                          </span>
                        ) : (
                          <span className="font-mono font-bold">
                            {formatSeconds(grant.videoSecondsRemaining)}{" "}
                            <span className="text-muted-foreground font-normal">
                              / {formatSeconds(grant.videoSecondsTotal)}
                            </span>
                          </span>
                        )}
                      </div>
                      {grant.maxVideoSeconds > 0 && (
                        <Progress value={grantVideoPercent} className="h-1.5 w-full" />
                      )}
                    </div>

                    {/* Chat Section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-muted-foreground">
                            {m.quota_chat_label()}
                          </span>
                        </div>
                        <span className="font-mono font-bold">
                          {formatSeconds(grant.chatSecondsRemaining)}{" "}
                          <span className="text-muted-foreground font-normal">
                            / {formatSeconds(grant.chatSecondsTotal)}
                          </span>
                        </span>
                      </div>
                      <Progress
                        value={grantChatPercent}
                        className="h-1.5 w-full bg-[color:var(--brand-blue)]/20"
                        indicatorClassName="bg-[color:var(--brand-blue)]"
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
