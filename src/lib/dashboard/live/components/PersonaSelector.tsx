import { Check, ChevronDown } from "lucide-react";
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
          variant="outline"
          className={cn(
            "h-14 w-full justify-between rounded-2xl px-4 text-left border-border-soft bg-surface/60 hover:bg-surface-2/80 hover:border-primary/20 transition-all duration-200",
            className,
          )}
          disabled={disabled}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{selectedPersona.emoji}</span>
            <div className="flex flex-col items-start">
              <span className="font-medium text-foreground">{selectedPersona.name}</span>
              <span className="text-xs text-muted-foreground">
                {selectedPersona.description}
              </span>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[--radix-dropdown-menu-trigger-width] rounded-2xl p-2 shadow-lll-lg border-border-soft bg-surface/95 backdrop-blur-xl"
      >
        {PERSONAS.map((persona) => (
          <DropdownMenuItem
            key={persona.id}
            onClick={() => onSelect(persona)}
            className="flex items-center gap-3 rounded-xl p-3 cursor-pointer focus:bg-surface-2"
          >
            <span className="text-2xl">{persona.emoji}</span>
            <div className="flex flex-col flex-1">
              <span className="font-medium">{persona.name}</span>
              <span className="text-xs text-muted-foreground">{persona.description}</span>
            </div>
            {selectedId === persona.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
