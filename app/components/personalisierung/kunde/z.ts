"use client";

import { api, KUNDE_API } from "@/lib/personalisierung/ui/api";
import type { Variable } from "@/lib/personalisierung/schema";

/** Kundenansicht der Vorlage (GET /api/personalisierung/z/[ref]). */
export interface Ansicht {
  id: string;
  name: string;
  beschreibung: string;
  version: number;
  endformat: { breite: number; hoehe: number };
  beschnitt: number;
  hatRueckseite: boolean;
  variablen: Variable[];
  grenzen: { maxDatensaetze: number; maxNutzen: number };
  akteur: "gast" | "kunde" | "mitarbeiter";
  entwurfStunden: number;
}

export interface EntwurfRef {
  id: string;
  token: string;
  expiresAt: string;
}

/** Aufrufe an den Kundenweg: hängt den Entwurf an, damit die Vorlagen-Version zum Entwurf passt. */
export class Z {
  constructor(
    public readonly ref: string,
    public entwurf: EntwurfRef | null,
  ) {}

  setzeEntwurf(e: EntwurfRef | null) {
    this.entwurf = e;
  }

  url(pfad = "", params: Record<string, string> = {}): string {
    const q = new URLSearchParams(params);
    if (this.entwurf) q.set("entwurf", this.entwurf.id);
    const s = q.toString();
    return `${KUNDE_API}/${this.ref}${pfad}${s ? `?${s}` : ""}`;
  }

  kopf(): Record<string, string> {
    return this.entwurf ? { "x-entwurf-token": this.entwurf.token } : {};
  }

  get<T>(pfad = "", params?: Record<string, string>) {
    return api<T>(this.url(pfad, params), { headers: this.kopf() });
  }

  post<T>(pfad: string, json: unknown, params?: Record<string, string>, signal?: AbortSignal) {
    return api<T>(this.url(pfad, params), { method: "POST", json, headers: this.kopf(), signal });
  }
}
