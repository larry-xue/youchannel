export type ChatStartStyle =
  | "slow_daily"
  | "direct_topic"
  | "you_start_i_follow"
  | "ask_more";

export type ChatPace =
  | "slow_pauses_ok"
  | "more_backchannel"
  | "avoid_silence"
  | "go_with_flow";

export type ChatPartnerStyle =
  | "gentle_no_push"
  | "slightly_proactive"
  | "calm_low_emotion"
  | "light_jokes";

export type ChatSupportStyle = "just_listen" | "push_sometimes" | "depends";

export type ChatDislike =
  | "rapid_questions"
  | "frequent_corrections"
  | "long_monologue"
  | "too_positive"
  | "too_goal_oriented"
  | "pace_controlled";

export type ChatLowEnergyStyle = "normal" | "slow_soft" | "check_in_no_dig";

export type LiveChatPreferences = {
  start_style: ChatStartStyle | null;
  chat_pace: ChatPace | null;
  partner_style: ChatPartnerStyle | null;
  support_style: ChatSupportStyle | null;
  dislikes: ChatDislike[];
  low_energy_style: ChatLowEnergyStyle | null;
  freeform_note: string | null;
};

export const createEmptyChatPreferences = (): LiveChatPreferences => ({
  start_style: null,
  chat_pace: null,
  partner_style: null,
  support_style: null,
  dislikes: [],
  low_energy_style: null,
  freeform_note: null,
});

export const hasAnyChatPreferences = (prefs: LiveChatPreferences) => {
  if (prefs.start_style) return true;
  if (prefs.chat_pace) return true;
  if (prefs.partner_style) return true;
  if (prefs.support_style) return true;
  if (prefs.low_energy_style) return true;
  if (prefs.freeform_note?.trim()) return true;
  return prefs.dislikes.length > 0;
};

export const countAnsweredChatPreferences = (prefs: LiveChatPreferences) => {
  let count = 0;
  if (prefs.start_style) count += 1;
  if (prefs.chat_pace) count += 1;
  if (prefs.partner_style) count += 1;
  if (prefs.support_style) count += 1;
  if (prefs.dislikes.length > 0) count += 1;
  if (prefs.low_energy_style) count += 1;
  if (prefs.freeform_note?.trim()) count += 1;
  return count;
};
