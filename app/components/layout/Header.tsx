"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/LogoMark";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const links = [
  { href: "/upload", label: "Upload" },
  { href: "/requests", label: "Aufträge" },
  { href: "/konto", label: "Konto" },
] as const;

export function Header() {
  const pathname = usePathname();

  return (
    <header className="nav" style={{ viewTransitionName: "site-header" }}>
      <Link href="/" aria-label="dmp druckraum — Startseite" className="mr-2 flex shrink-0 items-center">
        <Wordmark />
      </Link>
      <nav aria-label="Hauptnavigation" className="hidden items-center gap-7 md:flex">
        {links.map((link) => {
          const aktiv = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link key={link.href} href={link.href} className={`nav-link ${aktiv ? "nav-active" : ""}`}>
              {link.label}
            </Link>
          );
        })}
      </nav>
      <span className="ml-auto hidden items-center gap-3 md:flex">
        <ThemeToggle />
        <Link href="/konto" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
          Konto
        </Link>
      </span>
      <span className="ml-auto flex items-center gap-1 md:hidden">
        <ThemeToggle />
        <Sheet>
          <SheetTrigger
            aria-label="Menü öffnen"
            className="flex size-9 items-center justify-center rounded-2xl transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <HugeiconsIcon icon={Menu01Icon} size={22} />
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>dmp druckraum</SheetTitle>
            </SheetHeader>
            <nav aria-label="Hauptnavigation" className="flex flex-col gap-1 px-6">
              {links.map((link) => {
                const aktiv = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <SheetClose
                    key={link.href}
                    render={
                      <Link href={link.href} className={`nav-link rounded-lg px-2 py-2.5 ${aktiv ? "nav-active" : ""}`} />
                    }
                  >
                    {link.label}
                  </SheetClose>
                );
              })}
            </nav>
            <div className="mt-4 flex flex-col items-stretch gap-2 px-6">
              <SheetClose render={<Link href="/konto" className={cn(buttonVariants({ variant: "secondary" }), "w-full")} />}>
                Konto
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </span>
    </header>
  );
}
