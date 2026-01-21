import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "./ui/button";

export default function ThemeToggle() {
  function toggleTheme() {
    if (
      document.documentElement.classList.contains("dark") ||
      (!("theme" in localStorage) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      document.documentElement.classList.remove("dark");
      localStorage.theme = "light";
    } else {
      document.documentElement.classList.add("dark");
      localStorage.theme = "dark";
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      onClick={toggleTheme}
      className="relative h-9 w-9 rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
    >
      <SunIcon className="h-4 w-4 transition-opacity duration-150 dark:opacity-0" />
      <MoonIcon className="absolute h-4 w-4 opacity-0 transition-opacity duration-150 dark:opacity-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
