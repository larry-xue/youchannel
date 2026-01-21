import { Languages } from "lucide-react";
import { getLocale, locales, setLocale } from "~/paraglide/runtime";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const localeNames: Record<string, string> = {
  en: "English",
  de: "German",
  ja: "Japanese",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  es: "Spanish",
};

export function LanguageSwitcher() {
  const currentLocale = getLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2 rounded-lg px-2 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        >
          <Languages className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            {currentLocale}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[200px] rounded-xl p-1.5 shadow-sm border-border/60 bg-background"
      >
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => setLocale(locale)}
            className={
              currentLocale === locale
                ? "bg-muted/70 text-foreground font-semibold rounded-lg"
                : "rounded-lg font-medium text-muted-foreground focus:text-foreground"
            }
            data-active-locale={currentLocale === locale}
          >
            {localeNames[locale] || locale}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
