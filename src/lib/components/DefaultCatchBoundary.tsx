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
    <div className="flex min-w-0 flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5" />
        </div>

        <h2 className="mt-4 text-base font-semibold text-card-foreground">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred.
        </p>

        <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 text-left">
          <div className="max-h-[200px] overflow-auto p-4 text-xs font-mono text-muted-foreground">
            <ErrorComponent error={error} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            onClick={() => {
              router.invalidate();
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          {isRoot ? (
            <Button asChild variant="outline">
              <Link to="/">
                <Home className="mr-2 h-4 w-4" />
                Home
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
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
