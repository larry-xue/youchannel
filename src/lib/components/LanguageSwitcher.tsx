import { Languages } from "lucide-react";
import { Button } from "./ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { getLocale, locales, setLocale } from "~/paraglide/runtime";

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
                <Button variant="outline" size="sm" className="gap-1.5">
                    <Languages className="size-4" />
                    <span className="uppercase text-xs font-medium">{currentLocale}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {locales.map((locale) => (
                    <DropdownMenuItem
                        key={locale}
                        onClick={() => setLocale(locale)}
                        className={currentLocale === locale ? "bg-accent" : ""}
                        data-active-locale={currentLocale === locale}
                    >
                        {localeNames[locale] || locale}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

