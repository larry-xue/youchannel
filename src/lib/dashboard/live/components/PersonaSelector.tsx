import { ChevronDown } from "lucide-react";
import { Button } from "~/lib/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/lib/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import { PERSONAS, type Persona } from "../constants";

interface PersonaSelectorProps {
  selectedId: string;
  onSelect: (persona: Persona) => void;
  disabled?: boolean;
  className?: string;
}

export function PersonaSelector({
  selectedId,
  onSelect,
  disabled = false,
  className,
}: PersonaSelectorProps) {
  const selectedPersona = PERSONAS.find((p) => p.id === selectedId) ?? PERSONAS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-20 w-full justify-between rounded-[2rem] px-6 text-left bg-surface/30 backdrop-blur-md hover:bg-surface/50 transition-all duration-300 shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/10",
            className,
          )}
          disabled={disabled}
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl filter drop-shadow-md">
              {selectedPersona.emoji}
            </span>
            <div className="flex flex-col items-start gap-0.5">
              <span className="font-semibold text-lg text-foreground tracking-tight">
                {selectedPersona.name}
              </span>
              <span className="text-xs font-medium text-muted-foreground/80">
                {selectedPersona.description}
              </span>
            </div>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[--radix-dropdown-menu-trigger-width] rounded-[2rem] p-3 shadow-2xl bg-surface/80 backdrop-blur-2xl"
        sideOffset={8}
      >
        {PERSONAS.map((persona) => (
          <DropdownMenuItem
            key={persona.id}
            onClick={() => onSelect(persona)}
            className="flex items-center gap-4 rounded-3xl p-4 cursor-pointer focus:bg-white/10 transition-colors"
          >
            <span className="text-2xl filter drop-shadow-sm">{persona.emoji}</span>
            <div className="flex flex-col flex-1 gap-0.5">
              <span className="font-medium text-foreground">{persona.name}</span>
              <span className="text-xs text-muted-foreground/80">
                {persona.description}
              </span>
            </div>
            {selectedId === persona.id && (
              <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
