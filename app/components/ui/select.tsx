import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="z-50 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-xl py-1.5 pl-8 pr-4 text-sm focus:bg-muted"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
