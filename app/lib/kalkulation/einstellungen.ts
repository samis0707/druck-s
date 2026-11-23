/** Preis-Einstellungen der Richtpreis-Kalkulation: gespeichert in app_settings (mit Verlauf). */
import { getSetting, setSetting } from "../settings";
import { STANDARD_PREIS_EINSTELLUNGEN, pruefeEinstellungen, type PreisEinstellungen } from "./richtpreis";

export const PREIS_EINSTELLUNGEN_KEY = "kalkulation.preis";

export async function ladePreisEinstellungen(): Promise<PreisEinstellungen> {
  const s = await getSetting(PREIS_EINSTELLUNGEN_KEY);
  if (s === null) return STANDARD_PREIS_EINSTELLUNGEN;
  try {
    const r = pruefeEinstellungen(JSON.parse(s.value));
    return r.ok ? r.wert : STANDARD_PREIS_EINSTELLUNGEN;
  } catch {
    return STANDARD_PREIS_EINSTELLUNGEN;
  }
}

export async function speicherePreisEinstellungen(
  roh: unknown,
  von: string,
): Promise<{ ok: true; wert: PreisEinstellungen } | { ok: false; fehler: string[] }> {
  const r = pruefeEinstellungen(roh);
  if (!r.ok) return r;
  await setSetting(PREIS_EINSTELLUNGEN_KEY, JSON.stringify(r.wert), von);
  return r;
}
