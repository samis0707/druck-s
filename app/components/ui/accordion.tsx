"use client"

import * as React from "react"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { cn } from "@/lib/utils"

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex w-full flex-col", className)}
      {...props}
    />
  )
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("min-w-0", className)}
      {...props}
    />
  )
}

/** Überschrift (h3) mit Button; Kinder liefern Titel und Zusatzinfos. */
function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="m-0 flex text-base">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger flex flex-1 items-center gap-3 rounded-2xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed",
          className
        )}
        {...props}
      >
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

/** Panel mit sanfter Höhenanimation (nur bei erlaubter Bewegung). */
function AccordionPanel({
  className,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-panel"
      className={cn(
        "h-(--accordion-panel-height) overflow-hidden motion-safe:transition-[height] motion-safe:duration-300 motion-safe:ease-out data-ending-style:h-0 data-starting-style:h-0",
        className
      )}
      {...props}
    />
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionPanel }
