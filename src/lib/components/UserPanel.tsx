import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Library,
  Loader2,
  LogOut,
  MessageSquare,
  PieChart,
  Play,
  Video,
} from "lucide-react";
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

function UserQuotas() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["userQuota"],
    queryFn: () => getUserActiveQuotaFn(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <>
        <DropdownMenuSeparator />
        <div className="flex justify-center p-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <DropdownMenuSeparator />
        <div className="mx-2 mb-2 rounded-xl bg-destructive/10 p-3 text-center text-xs text-destructive">
          {m.quota_error()}
        </div>
      </>
    );
  }

  if (!data) return null;

  const { summary: quota } = data;

  // Show "no quota" state for zero totals
  if (quota.videoSecondsTotal === 0 && quota.chatSecondsTotal === 0) {
    return (
      <>
        <DropdownMenuSeparator />
        <Link to="/quotas" className="block outline-none">
          <div className="mx-2 mb-2 cursor-pointer rounded-xl bg-muted/40 p-3 text-center text-xs text-muted-foreground hover:bg-muted/60">
            {m.quota_none()}
          </div>
        </Link>
      </>
    );
  }

  return (
    <>
      <DropdownMenuSeparator />
      <Link to="/quotas" className="block outline-none">
        <div className="mx-2 mb-2 cursor-pointer rounded-xl bg-muted/40 p-3 transition-colors hover:bg-muted/60 active:bg-muted/80">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
              {m.quota_title()}
            </span>
            <div className="flex items-center gap-2">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-3">
            {/* Video Quota Summary */}
            {quota.videoSecondsTotal > 0 && (
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground/90">
                      {m.quota_video_label()}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {Math.round(quota.videoPercent)}%
                    </span>
                  </div>
                  <Progress value={quota.videoPercent} className="h-1.5 bg-indigo-500/10">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 transition-all duration-500"
                      style={{ width: `${quota.videoPercent}%` }}
                    />
                  </Progress>
                </div>
              </div>
            )}

            {/* Chat Quota Summary */}
            {quota.chatSecondsTotal > 0 && (
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground/90">
                      {m.quota_chat_label()}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {Math.round(quota.chatPercent)}%
                    </span>
                  </div>
                  <Progress value={quota.chatPercent} className="h-1.5 bg-emerald-500/10">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-500"
                      style={{ width: `${quota.chatPercent}%` }}
                    />
                  </Progress>
                </div>
              </div>
            )}
          </div>
        </div>
      </Link>
    </>
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
