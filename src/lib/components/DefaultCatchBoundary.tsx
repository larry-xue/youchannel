import {
  ErrorComponent,
  type ErrorComponentProps,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from "@tanstack/react-router";
import { AlertCircle, Home, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";

export function DefaultCatchBoundary({ error }: Readonly<ErrorComponentProps>) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  console.error(error);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4 bg-background">
      <div className="w-full max-w-lg rounded-3xl bg-card p-8 shadow-xl shadow-black/5 ring-1 ring-border/5 flex flex-col items-center gap-6 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="rounded-full bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-medium tracking-tight text-card-foreground">
            Something went wrong
          </h2>
          <p className="text-muted-foreground">An unexpected error occurred.</p>
        </div>

        <div className="w-full overflow-hidden rounded-xl bg-muted/50 text-left">
          <div className="max-h-[200px] overflow-auto p-4 text-xs font-mono text-muted-foreground">
            <ErrorComponent error={error} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              router.invalidate();
            }}
            className="rounded-full shadow-md hover:shadow-lg transition-[background-color,color,border-color,box-shadow,translate,scale,rotate]"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          {isRoot ? (
            <Button
              asChild
              variant="secondary"
              className="rounded-full shadow-sm hover:shadow-md transition-[background-color,color,border-color,box-shadow,translate,scale,rotate]"
            >
              <Link to="/">
                <Home className="mr-2 h-4 w-4" />
                Home
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              variant="secondary"
              className="rounded-full shadow-sm hover:shadow-md transition-[background-color,color,border-color,box-shadow,translate,scale,rotate]"
            >
              <Link
                to="/"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.back();
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Go Back
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
