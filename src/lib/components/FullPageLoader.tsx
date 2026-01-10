import * as m from "~/paraglide/messages";

export function FullPageLoader() {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="relative">
                    <div className="h-12 w-12 rounded-full border-4 border-primary/20" />
                    <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-4 border-transparent border-t-primary" />
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">{m.full_page_loading()}</p>
            </div>
        </div>
    );
}
