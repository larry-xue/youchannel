import { useEffect, useState } from "react";
import supabase from "~/lib/auth-client";
import { useAuthUser } from "~/lib/store/auth";

export interface LearningProfile {
  id: string;
  user_id: string;
  target_language: string;
}

export function useLearningProfile() {
  const user = useAuthUser();
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("learning_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          console.error("Error fetching learning profile:", error);
        }

        if (data) {
          setProfile(data);
        }
      } catch (error) {
        console.error("Unexpected error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    // Subscribe to changes
    const channel = supabase
      .channel("learning_profiles_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "learning_profiles",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setProfile(payload.new as LearningProfile);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { profile, loading };
}
