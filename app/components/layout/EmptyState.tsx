import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Illustration } from "@/components/brand/Illustration";

export type EmptyStateProps = {
  symbol?: ReactNode;
  illustration?: "tray" | "search";
  titel: string;
  beschreibung?: string;
  aktion?: ReactNode;
};

export function EmptyState({ symbol, illustration, titel, beschreibung, aktion }: EmptyStateProps) {
  return (
    <Empty>
      <EmptyHeader>
        {illustration ? <Illustration kind={illustration} className="mb-2" /> : null}
        {symbol && !illustration ? <EmptyMedia variant="icon">{symbol}</EmptyMedia> : null}
        <EmptyTitle>{titel}</EmptyTitle>
        {beschreibung ? <EmptyDescription>{beschreibung}</EmptyDescription> : null}
      </EmptyHeader>
      {aktion ? <EmptyContent>{aktion}</EmptyContent> : null}
    </Empty>
  );
}
