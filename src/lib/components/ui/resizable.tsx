import { GripVerticalIcon } from "lucide-react";
import * as React from "react";
import {
  Group,
  Panel,
  Separator,
  usePanelRef,
  type GroupProps,
  type PanelImperativeHandle,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";

import { cn } from "~/lib/utils";

type Direction = "horizontal" | "vertical";

const ResizableContext = React.createContext<Direction>("horizontal");

type ResizablePanelGroupProps = Omit<GroupProps, "orientation"> & {
  direction?: Direction;
};

function ResizablePanelGroup({
  className,
  direction = "horizontal",
  ...props
}: ResizablePanelGroupProps) {
  return (
    <ResizableContext value={direction}>
      <Group
        data-slot="resizable-panel-group"
        data-panel-group-direction={direction}
        orientation={direction}
        className={cn(
          "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
          className,
        )}
        {...props}
      />
    </ResizableContext>
  );
}

function ResizablePanel({ ...props }: PanelProps) {
  return <Panel data-slot="resizable-panel" {...props} />;
}

type ResizableHandleProps = Omit<SeparatorProps, "children"> & {
  withHandle?: boolean;
};

function ResizableHandle({ withHandle, className, ...props }: ResizableHandleProps) {
  const direction = React.use(ResizableContext);
  const isVertical = direction === "vertical";

  return (
    <Separator
      data-slot="resizable-handle"
      data-panel-group-direction={direction}
      className={cn(
        "bg-border relative flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
        isVertical ? "h-px w-full cursor-row-resize" : "h-full w-px cursor-col-resize",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            "z-10 flex items-center justify-center rounded-sm border bg-border",
            isVertical ? "h-3 w-4" : "h-4 w-3",
          )}
        >
          <GripVerticalIcon className={cn("h-2.5 w-2.5", isVertical && "rotate-90")} />
        </div>
      )}
    </Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup, usePanelRef };
export type { PanelImperativeHandle };
