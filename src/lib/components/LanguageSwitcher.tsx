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
  de: "Deutsch",
  ja: "日本語",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  es: "Español",
};

export function LanguageSwitcher() {
  const currentLocale = getLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 gap-2 rounded-full px-3 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Languages className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            {currentLocale}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[200px] rounded-3xl p-1.5 shadow-xl border-border/50 bg-background/95 backdrop-blur-2xl"
      >
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => setLocale(locale)}
            className={
              currentLocale === locale
                ? "bg-secondary text-secondary-foreground font-semibold rounded-2xl"
                : "rounded-2xl font-medium text-muted-foreground focus:text-foreground"
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
