import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "~/lib/components/ui/button";
import { Label } from "~/lib/components/ui/label";
import supabase from "~/lib/auth-client";
import { useAuthUser } from "~/lib/store/auth";
import { toast } from "sonner";
import { cn } from "~/lib/utils";

const LANGUAGES = [
  { code: "ar-EG", label: "Arabic (Egypt)", flag: "🇪🇬" },
  { code: "de-DE", label: "German", flag: "🇩🇪" },
  { code: "en-US", label: "English (US)", flag: "🇺🇸" },
  { code: "es-US", label: "Spanish (US)", flag: "🇺🇸" },
  { code: "fr-FR", label: "French", flag: "🇫🇷" },
  { code: "hi-IN", label: "Hindi", flag: "🇮🇳" },
  { code: "id-ID", label: "Indonesian", flag: "🇮🇩" },
  { code: "it-IT", label: "Italian", flag: "🇮🇹" },
  { code: "ja-JP", label: "Japanese", flag: "🇯🇵" },
  { code: "ko-KR", label: "Korean", flag: "🇰🇷" },
  { code: "pt-BR", label: "Portuguese (Brazil)", flag: "🇧🇷" },
  { code: "ru-RU", label: "Russian", flag: "🇷🇺" },
  { code: "nl-NL", label: "Dutch", flag: "🇳🇱" },
  { code: "pl-PL", label: "Polish", flag: "🇵🇱" },
  { code: "th-TH", label: "Thai", flag: "🇹🇭" },
  { code: "tr-TR", label: "Turkish", flag: "🇹🇷" },
  { code: "vi-VN", label: "Vietnamese", flag: "🇻🇳" },
  { code: "ro-RO", label: "Romanian", flag: "🇷🇴" },
  { code: "uk-UA", label: "Ukrainian", flag: "🇺🇦" },
  { code: "bn-BD", label: "Bengali", flag: "🇧🇩" },
  { code: "en-IN", label: "English (India)", flag: "🇮🇳" },
  { code: "mr-IN", label: "Marathi", flag: "🇮🇳" },
  { code: "ta-IN", label: "Tamil", flag: "🇮🇳" },
  { code: "te-IN", label: "Telugu", flag: "🇮🇳" },
];

export function LearningSettings() {
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
          // PGRST116 is "The result contains 0 rows"
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

  const handleLanguageSelect = async (code: string) => {
    if (!user) return;
    setUpdating(true);
    setTargetLang(code); // Optimistic update

    try {
      const { error } = await supabase.from("learning_profiles").upsert(
        {
          user_id: user.id,
          target_language: code,
        },
        { onConflict: "user_id" },
      );

      if (error) throw error;
      toast.success("Learning preferences updated");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update preferences");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label className="text-base font-medium">I want to learn...</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LANGUAGES.map((lang) => (
            <Button
              key={lang.code}
              variant="outline"
              className={cn(
                "h-auto flex-col gap-1 p-3 transition-all hover:bg-accent hover:text-accent-foreground",
                targetLang === lang.code &&
                "border-primary bg-primary/5 ring-1 ring-primary",
              )}
              onClick={() => handleLanguageSelect(lang.code)}
              disabled={updating}
            >
              <span className="text-2xl">{lang.flag}</span>
              <span className="font-medium">{lang.label}</span>
              {targetLang === lang.code && (
                <div className="absolute right-2 top-2">
                  <Check className="h-3 w-3 text-primary" />
                </div>
              )}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
