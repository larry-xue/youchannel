import { useNavigate } from "@tanstack/react-router";
import { CopyPlus, PlaySquare, AlertCircle, RefreshCw, Youtube } from "lucide-react";
import { Button } from "~/lib/components/ui/button";
import { ReactNode } from "react";

interface EmptyStateProps {
    title?: string;
    description?: string;
    icon?: React.ElementType;
    action?: {
        label: string;
        onClick: () => void;
        isLoading?: boolean;
        loadingText?: string;
        icon?: React.ElementType;
    };
    colorClass?: string;
}

export function EmptyVideoState({
    title = "No videos found",
    description = "You haven't added any videos yet. Go to your playlists to add videos to your library.",
    icon: Icon = PlaySquare,
    action,
    colorClass = "blue",
}: EmptyStateProps) {
    const navigate = useNavigate();

    const defaultAction = {
        label: "Manage Playlists",
        onClick: () => navigate({ to: "/playlists" }),
        icon: CopyPlus,
        isLoading: false,
        loadingText: "",
    };

    const activeAction = { ...defaultAction, ...action };
    const ActionIcon = activeAction.icon || CopyPlus;

    // Map color names to tailwind classes
    const colorMap: Record<string, { bg: string; text: string; }> = {
        blue: { bg: "bg-blue-500/20", text: "text-blue-600" },
        red: { bg: "bg-red-500/20", text: "text-red-600" },
        amber: { bg: "bg-amber-500/20", text: "text-amber-600" },
        emerald: { bg: "bg-emerald-500/20", text: "text-emerald-600" },
    };

    const colors = colorMap[colorClass] || colorMap.blue;

    return (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-muted/20 px-4 py-16 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="relative mb-6">
                <div className={`absolute inset-0 animate-pulse rounded-full ${colors.bg} blur-xl`} />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-background to-muted shadow-xl ring-1 ring-border/50">
                    <Icon className={`h-10 w-10 ${colors.text}`} />
                </div>
            </div>

            <h3 className="mb-2 font-display text-xl font-semibold text-foreground">
                {title}
            </h3>
            <p className="mb-8 max-w-sm text-sm text-muted-foreground">
                {description}
            </p>

            <Button
                size="lg"
                onClick={activeAction.onClick}
                disabled={activeAction.isLoading}
                className="h-11 rounded-full px-8 shadow-lg transition-all hover:shadow-primary/25"
            >
                {activeAction.isLoading ? (
                    <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        {activeAction.loadingText || "Loading..."}
                    </>
                ) : (
                    <>
                        <ActionIcon className="mr-2 h-4 w-4" />
                        {activeAction.label}
                    </>
                )}
            </Button>
        </div>
    );
}
