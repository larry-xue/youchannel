import { Link } from "@tanstack/react-router";
import { LogOut, Library, Play } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { UserPanel } from "./UserPanel";
import * as m from "~/paraglide/messages";

interface HeaderProps {
  onSignOut: () => Promise<void>;
}

export function Header({ onSignOut }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="container mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-3xl">🎓</span>
            <div className="flex items-baseline text-lg font-bold">
              <span className="bg-linear-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                {m.app_name_part1()}
              </span>
              <span className="bg-linear-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
                {m.app_name_part2()}
              </span>
              <span className="text-foreground">.ai</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <UserPanel onSignOut={onSignOut} />
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
