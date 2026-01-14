import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Library, Loader2, LogOut, PieChart, Play, RefreshCw } from "lucide-react";
import { getUserActiveQuotaFn } from "~/lib/server/quotas";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Progress } from "./ui/progress";

import { useAuthUser } from "~/lib/store/auth";
import * as m from "~/paraglide/messages";

interface UserPanelProps {
  onSignOut: () => Promise<void>;
  showMenuItems?: boolean;
}

// ... (other imports remain similar)

function UserQuotas() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["userQuota"],
    queryFn: () => getUserActiveQuotaFn(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const handleRefresh = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-2 mb-2 rounded-xl bg-destructive/10 p-3 text-center text-xs text-destructive">
        {m.quota_error()}
      </div>
    );
  }

  if (!data) return null;

  const { summary: quota } = data;

  // Show "no quota" state slightly differently but consistent style
  if (quota.videoSecondsTotal === 0 && quota.chatSecondsTotal === 0) {
    return (
      <div className="px-2 py-1.5">
        <Link
          to="/quotas"
          className="group flex items-center justify-between rounded-md p-2 hover:bg-muted/50"
        >
          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">
            {m.quota_title()}
          </span>
          <span className="text-xs text-muted-foreground">{m.quota_none()}</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="px-2 py-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <Link
          to="/quotas"
          className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:underline"
        >
          {m.quota_title()}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 hover:bg-transparent"
          onClick={handleRefresh}
          disabled={isRefetching}
        >
          <RefreshCw
            className={`h-3 w-3 text-muted-foreground transition-all hover:text-foreground ${isRefetching ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Video Quota */}
        <Link
          to="/quotas"
          className="group rounded-lg border border-border/40 bg-card/50 p-2 text-center transition-all hover:border-indigo-500/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20"
        >
          <div className="mb-1 text-lg">🎬</div>
          <div className="text-xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            {quota.videoPercent.toFixed(0)}
            <span className="text-xs font-normal text-muted-foreground">%</span>
          </div>
          <Progress
            value={quota.videoPercent}
            className="mt-2 h-1 bg-indigo-100 dark:bg-indigo-950 [&>[data-slot=progress-indicator]]:bg-indigo-500"
          />
        </Link>

        {/* Chat Quota */}
        <Link
          to="/quotas"
          className="group rounded-lg border border-border/40 bg-card/50 p-2 text-center transition-all hover:border-emerald-500/30 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
        >
          <div className="mb-1 text-lg">💬</div>
          <div className="text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
            {quota.chatPercent.toFixed(0)}
            <span className="text-xs font-normal text-muted-foreground">%</span>
          </div>
          <Progress
            value={quota.chatPercent}
            className="mt-2 h-1 bg-emerald-100 dark:bg-emerald-950 [&>[data-slot=progress-indicator]]:bg-emerald-500"
          />
        </Link>
      </div>
    </div>
  );
}

export function UserPanel({ onSignOut, showMenuItems = true }: UserPanelProps) {
  const authUser = useAuthUser();

  if (!authUser) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/signin">{m.sign_in()}</Link>
      </Button>
    );
  }

  const userAvatar = authUser?.user_metadata?.avatar_url as string | undefined;
  const userName =
    (authUser?.user_metadata?.full_name as string | undefined) ||
    authUser?.email?.split("@")[0] ||
    "User";
  const userInitial = userName[0]?.toUpperCase() || "U";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 transition hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt="Avatar"
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {userInitial}
            </div>
          )}
          <span className="hidden text-sm font-medium text-foreground sm:inline">
            {userName}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs text-muted-foreground">{authUser?.email}</p>
            </div>
          </DropdownMenuLabel>
          <UserQuotas />
          {showMenuItems && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  to="/library"
                  search={{ page: 1 }}
                  className="flex w-full cursor-pointer items-center"
                >
                  <Library className="mr-2 h-4 w-4" />
                  {m.library()}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/playlists" className="flex w-full cursor-pointer items-center">
                  <Play className="mr-2 h-4 w-4" />
                  {m.playlists()}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/quotas" className="flex w-full cursor-pointer items-center">
                  <PieChart className="mr-2 h-4 w-4" />
                  {m.quota_title()}
                </Link>
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut} variant="destructive">
            <LogOut className="mr-2 h-4 w-4" />
            {m.sign_out()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
