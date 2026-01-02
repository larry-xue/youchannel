import { useState } from "react";
import { formatDate } from "~/lib/dashboard/utils";
import { cn } from "~/lib/utils";
import {
  DEMO_CAPTIONS,
  DEMO_SUMMARY,
  DEMO_WIKI,
  TAB_OPTIONS,
  type TabKey,
} from "../constants";

type LearningTabsProps = {
  title: string;
  description?: string | null;
  publishedAt?: string | null;
};

export function LearningTabs({ title, description, publishedAt }: LearningTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("info");

  return (
    <div className="rounded-3xl border border-border/60 bg-background/80 shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-border/60 px-4 pt-4">
        {TAB_OPTIONS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition",
              activeTab === tab.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-6">
        {activeTab === "info" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Video Details
              </p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Published {formatDate(publishedAt)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Description
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">
                {description?.trim() || "No description available yet."}
              </p>
            </div>
          </div>
        )}

        {activeTab === "wiki" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {DEMO_WIKI.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-border/60 bg-muted/30 p-4"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {item.tag}
                </p>
                <h3 className="mt-2 text-sm font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        )}

        {activeTab === "summary" && (
          <ol className="space-y-3 text-sm text-foreground/90">
            {DEMO_SUMMARY.map((item, index) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        )}

        {activeTab === "captions" && (
          <div className="space-y-2">
            {DEMO_CAPTIONS.map((item) => (
              <button
                key={`${item.time}-${item.text}`}
                type="button"
                className="flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-3 text-left text-sm text-foreground/90 transition hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {item.time}
                </span>
                <span>{item.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
