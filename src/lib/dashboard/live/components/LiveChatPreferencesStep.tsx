import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Textarea } from "~/lib/components/ui/textarea";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

import {
  type ChatDislike,
  type ChatLowEnergyStyle,
  type ChatPace,
  type ChatPartnerStyle,
  type ChatStartStyle,
  type ChatSupportStyle,
  type LiveChatPreferences,
  createEmptyChatPreferences,
} from "~/lib/dashboard/live/preferences";

export const LIVE_CHAT_PREFERENCES_QUESTION_TOTAL = 7;

export type LiveChatPreferencesStepTransition = { from: number; to: number };

type LiveChatPreferencesStepProps = {
  value: LiveChatPreferences;
  onChange: (next: LiveChatPreferences) => void;
  questionIndex: number;
  transition?: LiveChatPreferencesStepTransition | null;
  onSkipStep?: () => void;
  disabled?: boolean;
  className?: string;
};

type RenderState = "single" | "incoming" | "outgoing";

const clampQuestionIndex = (index: number) =>
  Math.min(
    LIVE_CHAT_PREFERENCES_QUESTION_TOTAL - 1,
    Math.max(0, Math.floor(index)),
  );

export function LiveChatPreferencesStep({
  value,
  onChange,
  questionIndex,
  transition = null,
  onSkipStep,
  disabled = false,
  className,
}: LiveChatPreferencesStepProps) {
  const safeDisplayIndex = clampQuestionIndex(transition?.from ?? questionIndex);
  const safeIncomingIndex =
    transition === null ? null : clampQuestionIndex(transition.to);
  const safeQuestionIndex = safeIncomingIndex ?? safeDisplayIndex;

  const toggleDislike = (dislike: ChatDislike) => {
    const hasValue = value.dislikes.includes(dislike);
    onChange({
      ...value,
      dislikes: hasValue
        ? value.dislikes.filter((entry) => entry !== dislike)
        : [...value.dislikes, dislike],
    });
  };

  const reset = () => onChange(createEmptyChatPreferences());

  const setStartStyle = (next: ChatStartStyle) =>
    onChange({ ...value, start_style: next });

  const setChatPace = (next: ChatPace) => onChange({ ...value, chat_pace: next });

  const setPartnerStyle = (next: ChatPartnerStyle) =>
    onChange({ ...value, partner_style: next });

  const setSupportStyle = (next: ChatSupportStyle) =>
    onChange({ ...value, support_style: next });

  const setLowEnergyStyle = (next: ChatLowEnergyStyle) =>
    onChange({ ...value, low_energy_style: next });

  const setFreeformNote = (next: string) => {
    const trimmed = next.trim();
    onChange({
      ...value,
      freeform_note: trimmed.length === 0 ? null : next,
    });
  };

  const renderQuestion = (index: number) => {
    switch (index) {
      case 0:
        return (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">
              {m.live_personalize_pref_start_title()}
            </p>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-start-style"
                  checked={value.start_style === "slow_daily"}
                  onChange={() => setStartStyle("slow_daily")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_start_slow_daily()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_start_slow_daily_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-start-style"
                  checked={value.start_style === "direct_topic"}
                  onChange={() => setStartStyle("direct_topic")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_start_direct_topic()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_start_direct_topic_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-start-style"
                  checked={value.start_style === "you_start_i_follow"}
                  onChange={() => setStartStyle("you_start_i_follow")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_start_you_start_i_follow()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_start_you_start_i_follow_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-start-style"
                  checked={value.start_style === "ask_more"}
                  onChange={() => setStartStyle("ask_more")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_start_ask_more()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_start_ask_more_desc()}
                  </p>
                </div>
              </label>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">
              {m.live_personalize_pref_pace_title()}
            </p>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-chat-pace"
                  checked={value.chat_pace === "slow_pauses_ok"}
                  onChange={() => setChatPace("slow_pauses_ok")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_pace_slow_pauses_ok()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_pace_slow_pauses_ok_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-chat-pace"
                  checked={value.chat_pace === "more_backchannel"}
                  onChange={() => setChatPace("more_backchannel")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_pace_more_backchannel()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_pace_more_backchannel_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-chat-pace"
                  checked={value.chat_pace === "avoid_silence"}
                  onChange={() => setChatPace("avoid_silence")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_pace_avoid_silence()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_pace_avoid_silence_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-chat-pace"
                  checked={value.chat_pace === "go_with_flow"}
                  onChange={() => setChatPace("go_with_flow")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_pace_go_with_flow()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_pace_go_with_flow_desc()}
                  </p>
                </div>
              </label>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {m.live_personalize_pref_partner_title()}
              </p>
              <p className="text-sm text-muted-foreground">
                {m.live_personalize_pref_partner_note()}
              </p>
            </div>

            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-partner-style"
                  checked={value.partner_style === "gentle_no_push"}
                  onChange={() => setPartnerStyle("gentle_no_push")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_partner_gentle_no_push()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_partner_gentle_no_push_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-partner-style"
                  checked={value.partner_style === "slightly_proactive"}
                  onChange={() => setPartnerStyle("slightly_proactive")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_partner_slightly_proactive()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_partner_slightly_proactive_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-partner-style"
                  checked={value.partner_style === "calm_low_emotion"}
                  onChange={() => setPartnerStyle("calm_low_emotion")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_partner_calm_low_emotion()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_partner_calm_low_emotion_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-partner-style"
                  checked={value.partner_style === "light_jokes"}
                  onChange={() => setPartnerStyle("light_jokes")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_partner_light_jokes()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_partner_light_jokes_desc()}
                  </p>
                </div>
              </label>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">
              {m.live_personalize_pref_support_title()}
            </p>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-support-style"
                  checked={value.support_style === "just_listen"}
                  onChange={() => setSupportStyle("just_listen")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_support_just_listen()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_support_just_listen_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-support-style"
                  checked={value.support_style === "push_sometimes"}
                  onChange={() => setSupportStyle("push_sometimes")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_support_push_sometimes()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_support_push_sometimes_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-support-style"
                  checked={value.support_style === "depends"}
                  onChange={() => setSupportStyle("depends")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_support_depends()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_support_depends_desc()}
                  </p>
                </div>
              </label>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {m.live_personalize_pref_dislikes_title()}
              </p>
              <p className="text-sm text-muted-foreground">
                {m.live_personalize_pref_dislikes_note()}
              </p>
            </div>

            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="checkbox"
                  checked={value.dislikes.includes("rapid_questions")}
                  onChange={() => toggleDislike("rapid_questions")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <p className="text-sm font-semibold text-foreground">
                  {m.live_personalize_pref_dislikes_rapid_questions()}
                </p>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="checkbox"
                  checked={value.dislikes.includes("frequent_corrections")}
                  onChange={() => toggleDislike("frequent_corrections")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <p className="text-sm font-semibold text-foreground">
                  {m.live_personalize_pref_dislikes_frequent_corrections()}
                </p>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="checkbox"
                  checked={value.dislikes.includes("long_monologue")}
                  onChange={() => toggleDislike("long_monologue")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <p className="text-sm font-semibold text-foreground">
                  {m.live_personalize_pref_dislikes_long_monologue()}
                </p>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="checkbox"
                  checked={value.dislikes.includes("too_positive")}
                  onChange={() => toggleDislike("too_positive")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <p className="text-sm font-semibold text-foreground">
                  {m.live_personalize_pref_dislikes_too_positive()}
                </p>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="checkbox"
                  checked={value.dislikes.includes("too_goal_oriented")}
                  onChange={() => toggleDislike("too_goal_oriented")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <p className="text-sm font-semibold text-foreground">
                  {m.live_personalize_pref_dislikes_too_goal_oriented()}
                </p>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="checkbox"
                  checked={value.dislikes.includes("pace_controlled")}
                  onChange={() => toggleDislike("pace_controlled")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <p className="text-sm font-semibold text-foreground">
                  {m.live_personalize_pref_dislikes_pace_controlled()}
                </p>
              </label>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">
              {m.live_personalize_pref_low_energy_title()}
            </p>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-low-energy-style"
                  checked={value.low_energy_style === "normal"}
                  onChange={() => setLowEnergyStyle("normal")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_low_energy_normal()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_low_energy_normal_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-low-energy-style"
                  checked={value.low_energy_style === "slow_soft"}
                  onChange={() => setLowEnergyStyle("slow_soft")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_low_energy_slow_soft()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_low_energy_slow_soft_desc()}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/10 p-4">
                <input
                  type="radio"
                  name="live-pref-low-energy-style"
                  checked={value.low_energy_style === "check_in_no_dig"}
                  onChange={() => setLowEnergyStyle("check_in_no_dig")}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {m.live_personalize_pref_low_energy_check_in_no_dig()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.live_personalize_pref_low_energy_check_in_no_dig_desc()}
                  </p>
                </div>
              </label>
            </div>
          </div>
        );
      case 6:
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {m.live_personalize_pref_note_title()}
              </p>
              <p className="text-sm text-muted-foreground">
                {m.live_personalize_pref_note_desc()}
              </p>
            </div>

            <Textarea
              value={value.freeform_note ?? ""}
              onChange={(event) => setFreeformNote(event.currentTarget.value)}
              disabled={disabled}
              placeholder={m.live_personalize_pref_note_placeholder()}
              rows={4}
              maxLength={1000}
              className="bg-muted/10"
            />

            <div className="rounded-md border border-border bg-muted/10 p-4">
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {m.live_personalize_pref_footer_note()}
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const entries: Array<{ key: number; state: RenderState }> =
    safeIncomingIndex === null
      ? [{ key: safeDisplayIndex, state: "single" }]
      : [
          { key: safeDisplayIndex, state: "outgoing" },
          { key: safeIncomingIndex, state: "incoming" },
        ];

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {m.live_personalize_preferences_title()}
            </p>
            <Badge variant="secondary" className="bg-secondary/60">
              {m.live_personalize_optional_badge()}
            </Badge>
            <Badge
              variant="outline"
              className="tabular-nums border-border bg-muted/10 text-xs text-muted-foreground"
            >
              {safeQuestionIndex + 1}/{LIVE_CHAT_PREFERENCES_QUESTION_TOTAL}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            {onSkipStep && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSkipStep}
                disabled={disabled}
                className="px-2"
              >
                {m.action_skip()}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={disabled}
              className="px-2"
            >
              {m.action_clear()}
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {m.live_personalize_preferences_desc()}
        </p>
      </div>

      <div className="grid">
        {entries.map((entry) => (
          <div
            key={entry.key}
            className={cn(
              "col-start-1 row-start-1",
              entry.state === "incoming" && "animate-in fade-in-0 duration-200",
              entry.state === "outgoing" &&
                "animate-out fade-out-0 duration-200",
            )}
          >
            {renderQuestion(entry.key)}
          </div>
        ))}
      </div>
    </div>
  );
}
