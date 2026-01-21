import { Check, ChevronDown, Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import supabase from "~/lib/auth-client";
import { Button } from "~/lib/components/ui/button";
import { Loading } from "~/lib/components/ui/loading";
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
  { code: "ar-EG", label: "Arabic (Egypt)" },
  { code: "de-DE", label: "German" },
  { code: "en-US", label: "English (US)" },
  { code: "es-US", label: "Spanish (US)" },
  { code: "fr-FR", label: "French" },
  { code: "hi-IN", label: "Hindi" },
  { code: "id-ID", label: "Indonesian" },
  { code: "it-IT", label: "Italian" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "ru-RU", label: "Russian" },
  { code: "nl-NL", label: "Dutch" },
  { code: "pl-PL", label: "Polish" },
  { code: "th-TH", label: "Thai" },
  { code: "tr-TR", label: "Turkish" },
  { code: "vi-VN", label: "Vietnamese" },
  { code: "ro-RO", label: "Romanian" },
  { code: "uk-UA", label: "Ukrainian" },
  { code: "bn-BD", label: "Bengali" },
  { code: "en-IN", label: "English (India)" },
  { code: "mr-IN", label: "Marathi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
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
        <Loading size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-medium">{m.learning_settings_title()}</Label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-10 w-full justify-between px-3 text-left font-normal"
            >
              <span className="text-sm">{selectedLanguage.label}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[300px] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
            {LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onSelect={() => setTargetLang(lang.code)}
                className="flex items-center gap-2 py-2 cursor-pointer"
              >
                <span className="flex-1 text-sm">{lang.label}</span>
                {targetLang === lang.code && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button onClick={handleSave} disabled={updating} className="w-full">
          {updating && <Loader2 className="mr-2 h-4 w-4" />}
          {m.learning_settings_save()}
        </Button>
      </div>
    </div>
  );
}
