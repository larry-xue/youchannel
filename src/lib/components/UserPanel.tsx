import * as React from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, Library, Play, Settings } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useAuthUser } from "~/lib/store/auth";
import * as m from "~/paraglide/messages";
import { LearningSettings } from "./LearningSettings";

interface UserPanelProps {
  onSignOut: () => Promise<void>;
  showMenuItems?: boolean;
}

export function UserPanel({ onSignOut, showMenuItems = true }: UserPanelProps) {
  const authUser = useAuthUser();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  if (!authUser) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/signin">{m.sign_in()}</Link>
      </Button>
    );
  }

  const userAvatar = authUser?.user_metadata?.avatar_url as
    | string
    | undefined;
  const userName =
    (authUser?.user_metadata?.full_name as string | undefined) ||
    authUser?.email?.split("@")[0] ||
    "User";
  const userInitial = userName[0]?.toUpperCase() || "U";

  return (
    <>
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>{m.user_settings()}</DialogTitle>
          </DialogHeader>
          <LearningSettings />
        </DialogContent>
      </Dialog>
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
                <Link
                  to="/playlists"
                  className="flex w-full cursor-pointer items-center"
                >
                  <Play className="mr-2 h-4 w-4" />
                  {m.playlists()}
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setIsSettingsOpen(true);
            }}
          >
            <Settings className="mr-2 h-4 w-4" />
            {m.user_settings()}
          </DropdownMenuItem>
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
