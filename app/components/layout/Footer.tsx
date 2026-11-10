import Link from "next/link";
import { company } from "@/lib/company";
import { StatistikEinstellungen } from "@/components/analytics/StatistikEinstellungen";

const rechtsLinks = [
  { href: "/hilfe", label: "Hilfe & Schulung" },
  { href: "/kontakt", label: "Kontakt" },
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/agb", label: "AGB" },
  { href: "/widerruf", label: "Widerruf" },
  { href: "/staff/login", label: "Staff-Login" },
] as const;

export function Footer() {
  return (
    <footer data-testid="footer-recht" className="px-6 pt-6 pb-9">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 text-center">
        <nav className="flex flex-wrap justify-center gap-x-[18px] gap-y-2 text-xs text-muted-foreground">
          {rechtsLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
          <StatistikEinstellungen className="cursor-pointer text-muted-foreground hover:text-foreground" />
        </nav>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} {company.name}</p>
      </div>
    </footer>
  );
}
