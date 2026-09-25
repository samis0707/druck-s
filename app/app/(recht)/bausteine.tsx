import type { ReactNode } from "react";
import { STAND } from "./stand";

/** Seitenkopf der Rechtstexte: Markenstrich, Titel, Stand-Datum. */
export function RechtKopf({ titel }: { titel: string }) {
  return (
    <header className="recht-kopf">
      <p className="recht-kicker">Rechtliches</p>
      <h1>{titel}</h1>
      <p className="recht-stand">Stand: {STAND}</p>
    </header>
  );
}

/** Inhaltsverzeichnis mit Sprungmarken zu den h2-Abschnitten. */
export function Inhalt({ eintraege }: { eintraege: { id: string; titel: string }[] }) {
  return (
    <nav className="recht-toc" aria-label="Inhalt">
      <p className="recht-toc-titel">Inhalt</p>
      <ol>
        {eintraege.map((e) => (
          <li key={e.id}>
            <a href={`#${e.id}`}>{e.titel}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Nummerierter Absatz (z. B. 2.1) mit hängender Nummer. */
export function Abs({ nr, children }: { nr: string; children: ReactNode }) {
  return (
    <div className="recht-abs">
      <span className="recht-nr">{nr}</span>
      <div>{children}</div>
    </div>
  );
}
