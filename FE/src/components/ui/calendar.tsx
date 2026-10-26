// Adapted from shadcn/ui Calendar (MIT): https://ui.shadcn.com/docs/components/calendar
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames, type DayButton } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Calendar({ className, classNames, components, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  return <DayPicker showOutsideDays={showOutsideDays} className={cn("group/calendar w-full p-0 tabular-nums [--cell-size:2rem]", className)}
    classNames={{
      root: defaults.root,
      months: "relative flex flex-col gap-4",
      month: "flex w-full flex-col gap-3",
      nav: "absolute inset-x-0 top-0 flex items-center justify-between",
      button_previous: "inline-flex size-8 items-center justify-center rounded-md hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
      button_next: "inline-flex size-8 items-center justify-center rounded-md hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
      month_caption: "flex h-8 items-center justify-center px-9",
      caption_label: "text-sm font-medium",
      month_grid: "w-full border-collapse",
      weekdays: "flex",
      weekday: "flex-1 text-center text-xs font-normal text-muted-foreground",
      week: "mt-1 flex w-full",
      day: cn("group/day relative aspect-square w-full p-0 text-center", defaults.day),
      today: "rounded-md ring-1 ring-inset ring-border",
      outside: "text-muted-foreground opacity-50",
      disabled: "text-muted-foreground opacity-40",
      hidden: "invisible",
      range_start: "rounded-l-md bg-accent",
      range_middle: "bg-accent",
      range_end: "rounded-r-md bg-accent",
      ...classNames,
    }} components={{
      Root: ({ rootRef, ...rootProps }) => <div data-slot="calendar" ref={rootRef} {...rootProps} />,
      Chevron: ({ orientation, className, ...iconProps }) => orientation === "left" ? <ChevronLeft className={cn("size-4", className)} {...iconProps} /> : <ChevronRight className={cn("size-4", className)} {...iconProps} />,
      DayButton: CalendarDayButton,
      ...components,
    }} {...props} />;
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { if (modifiers.focused) ref.current?.focus(); }, [modifiers.focused]);
  return <Button ref={ref} variant="ghost" size="icon" data-day={day.date.toLocaleDateString("en-CA")}
    data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
    className={cn("relative aspect-square h-auto w-full min-w-8 font-normal group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-ring data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground", className)} {...props} />;
}

export { Calendar };
