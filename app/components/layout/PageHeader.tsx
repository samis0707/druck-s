import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export type BrotkrumenEintrag = {
  bezeichnung: string;
  href?: string;
};

export type PageHeaderProps = {
  titel: string;
  beschreibung?: string;
  brotkrumen?: BrotkrumenEintrag[];
  aktionen?: ReactNode;
};

export function PageHeader({ titel, beschreibung, brotkrumen, aktionen }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {brotkrumen && brotkrumen.length > 0 ? (
          <Breadcrumb aria-label="Brotkrumen" className="mb-2">
            <BreadcrumbList>
              {brotkrumen.map((eintrag, index) => {
                const istLetzter = index === brotkrumen.length - 1;
                return (
                  <Fragment key={`${eintrag.bezeichnung}-${index}`}>
                    {index > 0 ? <BreadcrumbSeparator /> : null}
                    <BreadcrumbItem>
                      {eintrag.href && !istLetzter ? (
                        <BreadcrumbLink render={<Link href={eintrag.href} />} className="max-w-48 truncate">
                          {eintrag.bezeichnung}
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage className="max-w-48 truncate">{eintrag.bezeichnung}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{titel}</h1>
        {beschreibung ? <p className="mt-1 text-muted-foreground">{beschreibung}</p> : null}
      </div>
      {aktionen ? <div className="flex shrink-0 flex-wrap items-center gap-2">{aktionen}</div> : null}
    </div>
  );
}
