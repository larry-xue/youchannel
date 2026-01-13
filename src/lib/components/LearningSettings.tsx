import { Check, Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import supabase from "~/lib/auth-client";
import { Button } from "~/lib/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/lib/components/ui/dropdown-menu";
import { Label } from "~/lib/components/ui/label";
import { useAuthUser } from "~/lib/store/auth";
import * as m from "~/paraglide/messages";

const LANGUAGES = [
  { code: "ar-EG", label: "العربية (مصر)", flag: "🇪🇬" },
  { code: "de-DE", label: "Deutsch", flag: "🇩🇪" },
  { code: "en-US", label: "English (US)", flag: "🇺🇸" },
  { code: "es-US", label: "Español (US)", flag: "🇺🇸" },
  { code: "fr-FR", label: "Français", flag: "🇫🇷" },
  { code: "hi-IN", label: "हिन्दी", flag: "🇮🇳" },
  { code: "id-ID", label: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "it-IT", label: "Italiano", flag: "🇮🇹" },
  { code: "ja-JP", label: "日本語", flag: "🇯🇵" },
  { code: "ko-KR", label: "한국어", flag: "🇰🇷" },
  { code: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { code: "ru-RU", label: "Русский", flag: "🇷🇺" },
  { code: "nl-NL", label: "Nederlands", flag: "🇳🇱" },
  { code: "pl-PL", label: "Polski", flag: "🇵🇱" },
  { code: "th-TH", label: "ไทย", flag: "🇹🇭" },
  { code: "tr-TR", label: "Türkçe", flag: "🇹🇷" },
  { code: "vi-VN", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "ro-RO", label: "Română", flag: "🇷🇴" },
  { code: "uk-UA", label: "Українська", flag: "🇺🇦" },
  { code: "bn-BD", label: "বাংলা", flag: "🇧🇩" },
  { code: "en-IN", label: "English (India)", flag: "🇮🇳" },
  { code: "mr-IN", label: "मराठी", flag: "🇮🇳" },
  { code: "ta-IN", label: "தமிழ்", flag: "🇮🇳" },
  { code: "te-IN", label: "తెలుగు", flag: "🇮🇳" },
];

export function LearningSettings({ onSuccess }: { onSuccess?: () => void }) {
  const user = useAuthUser();
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);
  const [targetLang, setTargetLang] = React.useState("en-US");

  React.useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("learning_profiles")
          .select("target_language")
          .eq("user_id", user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          console.error("Error fetching profile:", error);
          return;
        }

        if (data) {
          setTargetLang(data.target_language);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setUpdating(true);

    try {
      const { error } = await supabase.from("learning_profiles").upsert(
        {
          user_id: user.id,
          target_language: targetLang,
        },
        { onConflict: "user_id" },
      );

      if (error) throw error;
      toast.success(m.learning_settings_success());
      onSuccess?.();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(m.learning_settings_error());
    } finally {
      setUpdating(false);
    }
  };

  const selectedLanguage = LANGUAGES.find((l) => l.code === targetLang) || LANGUAGES[0];

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-col gap-4">
        <Label className="text-base font-medium">{m.learning_settings_title()}</Label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between px-3 text-left font-normal h-12"
            >
              <span className="flex items-center gap-2">
                <span className="text-xl">{selectedLanguage.flag}</span>
                <span className="text-base">{selectedLanguage.label}</span>
              </span>
              <Check className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[300px] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
            {LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onSelect={() => setTargetLang(lang.code)}
                className="flex items-center gap-2 py-3 cursor-pointer"
              >
                <span className="text-xl">{lang.flag}</span>
                <span className="flex-1 text-base">{lang.label}</span>
                {targetLang === lang.code && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          onClick={handleSave}
          disabled={updating}
          className="w-full h-11 text-base"
        >
          {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {m.learning_settings_save()}
        </Button>
      </div>
    </div>
  );
}
