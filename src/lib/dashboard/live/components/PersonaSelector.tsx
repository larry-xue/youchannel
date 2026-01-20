import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/lib/components/ui/select";
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
  return (
    <Select
      value={selectedId}
      onValueChange={(value) => {
        const persona = PERSONAS.find((p) => p.id === value);
        if (persona) onSelect(persona);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "h-12 w-full min-w-[200px] border-border/50 bg-background/50 backdrop-blur-sm [&_.persona-desc]:hidden",
          className,
        )}
      >
        <SelectValue placeholder="Select a persona" />
      </SelectTrigger>
      <SelectContent>
        {PERSONAS.map((persona) => (
          <SelectItem key={persona.id} value={persona.id}>
            <PersonaInfo persona={persona} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PersonaInfo({ persona }: { persona: Persona }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0 text-left">
      <span className="shrink-0 text-xl leading-none filter drop-shadow-sm">
        {persona.emoji}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-medium text-foreground leading-none truncate">
          {persona.name}
        </span>
        <span className="persona-desc text-[10px] text-muted-foreground/80 truncate font-normal leading-tight">
          {persona.description}
        </span>
      </div>
    </div>
  );
}
