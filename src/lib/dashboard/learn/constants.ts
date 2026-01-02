export const TAB_OPTIONS = [
  { key: "info", label: "Info" },
  { key: "wiki", label: "Wiki" },
  { key: "summary", label: "Summary" },
  { key: "captions", label: "Captions" },
] as const;

export const ACTIVITY_ITEMS = [{ key: "chat", label: "Chat" }] as const;

export const DEMO_WIKI = [
  {
    tag: "Concept",
    title: "Signal flow",
    description: "A quick map of how the main ideas connect across chapters.",
  },
  {
    tag: "Reference",
    title: "Key formulas",
    description: "A compact list of formulas used in the walkthrough.",
  },
  {
    tag: "Case",
    title: "Practical example",
    description: "A short example you can adapt to your own project.",
  },
  {
    tag: "Glossary",
    title: "Terms to remember",
    description: "Short definitions for the words that show up often.",
  },
];

export const DEMO_SUMMARY = [
  "Start with the problem framing and build a short checklist of assumptions.",
  "Identify the primary signal, then trace the supporting evidence step by step.",
  "Collect a compact toolkit of formulas and shortcuts for quick validation.",
  "Apply the method to a real scenario and compare the expected outcome.",
  "Finish with a recap of pitfalls and the next practice task.",
];

export const DEMO_CAPTIONS = [
  { time: "00:42", text: "Framing the topic and the core question for today." },
  { time: "03:18", text: "Breaking the workflow into four distinct stages." },
  { time: "06:02", text: "Walking through the first real-world example." },
  { time: "09:44", text: "Refining the assumptions and testing the edge cases." },
  { time: "13:27", text: "Summary of takeaways and the next practice drill." },
];

export const DEMO_CHAT = [
  {
    role: "assistant",
    text: "I can track key moments and build notes as you watch.",
  },
  {
    role: "user",
    text: "Capture the main formula and flag any tricky steps.",
  },
  {
    role: "assistant",
    text: "Noted. I will highlight the formula around the 06:00 mark.",
  },
];

export const QUICK_ACTIONS = [
  "Generate study notes",
  "Extract key definitions",
  "Draft follow-up questions",
];

export const SIDEBAR_DEFAULT_WIDTH = 360;
export const SIDEBAR_MIN_WIDTH = 280;
export const SIDEBAR_COLLAPSED_WIDTH = 88;
export const CONTENT_MIN_WIDTH = 520;
export const WORKSPACE_MIN_HEIGHT = 560;
export const CONTENT_MIN_HEIGHT = 360;
export const SPLITTER_SIZE = 8;

export const BOTTOM_PANEL_DEFAULT_HEIGHT = 320;
export const BOTTOM_PANEL_MIN_HEIGHT = 180;
export const BOTTOM_PANEL_COLLAPSED_HEIGHT = 44;

export const PLAYER_ASPECT_RATIO = 16 / 9;
export const PLAYER_MIN_HEIGHT = 240;

export const STORAGE_KEYS = {
  sidebarCollapsed: "youchannel.learn.sidebarCollapsed",
  sidebarWidth: "youchannel.learn.sidebarWidth",
  bottomPanelCollapsed: "youchannel.learn.bottomPanelCollapsed",
  bottomPanelHeight: "youchannel.learn.bottomPanelHeight",
} as const;

export type TabKey = (typeof TAB_OPTIONS)[number]["key"];
