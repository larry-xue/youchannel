import { Link } from "@tanstack/react-router";
import { Button } from "~/lib/components/ui/button";

type LearningHeaderProps = {
  title: string;
};

export function LearningHeader({ title }: LearningHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Learning Room
        </p>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          {title}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          A focused workspace for watching, annotating, and building study notes.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link to="/dashboard/playlists">Back to playlist</Link>
      </Button>
    </div>
  );
}
