/**
 * Client-Adresse für Mengenbegrenzungen und Audit. Reine Funktion ohne Abhängigkeiten.
 *
 * Problem: Ein Client kann `X-Forwarded-For` selbst setzen. Jeder Proxy hängt die Adresse seines
 * Gegenübers HINTEN an. Glaubwürdig ist daher nur der Eintrag, den der erste eigene Proxy
 * angehängt hat: bei N vertrauenswürdigen Proxys der N-te Eintrag von rechts. Der linke Eintrag
 * (früher benutzt) ist frei erfindbar und hätte jede Begrenzung umgehbar gemacht.
 *
 * Besonderheit Website: digitalemedien.de leitet Anfragen über einen eigenen Caddy an druck-s. Für
 * den Railway-Rand wären das alle dieselbe Adresse (die des Website-Dienstes). Deshalb schickt die
 * Website zusätzlich die echte Besucher-Adresse in `X-Dmp-Client-Ip` und ein gemeinsames
 * Geheimnis in `X-Dmp-Proxy-Secret`. Nur mit passendem Geheimnis gilt diese Adresse.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const HEADER_WEBSITE_IP = "x-dmp-client-ip";
export const HEADER_WEBSITE_SECRET = "x-dmp-proxy-secret";
const MIN_SECRET = 16;

export interface ClientIpOptions {
  /** Anzahl vertrauenswürdiger Proxys, die anhängen (0 = X-Forwarded-For ignorieren). */
  trustedProxies: number;
  /** Geheimnis der Website; leer oder kürzer als 16 Zeichen = Weg ausgeschaltet. */
  websiteSecret: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Gültige IPv4/IPv6-Adresse (ohne Port) oder null. IPv4-in-IPv6 wird auf IPv4 vereinheitlicht. */
export function normalisiereIp(roh: string | null | undefined): string | null {
  if (!roh) return null;
  let v = roh.trim();
  if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1);
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(":"));
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  if (mapped) v = mapped[1];
  return isIP(v) ? v.toLowerCase() : null;
}

export function ermittleClientIp(headers: Pick<Headers, "get">, o: ClientIpOptions): string {
  if (o.websiteSecret.length >= MIN_SECRET) {
    const gesendet = headers.get(HEADER_WEBSITE_SECRET);
    if (gesendet && timingSafeEqual(sha(gesendet), sha(o.websiteSecret))) {
      const ip = normalisiereIp(headers.get(HEADER_WEBSITE_IP));
      if (ip) return ip;
    }
  }
  const n = Math.floor(o.trustedProxies);
  if (!(n >= 1)) return "unknown";
  const eintraege = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e !== "");
  if (eintraege.length === 0) return "unknown";
  // Kürzere Kette als erwartet (Proxy fehlt): dann ist nur der erste Eintrag noch etwas wert.
  const index = eintraege.length >= n ? eintraege.length - n : 0;
  return normalisiereIp(eintraege[index]) ?? "unknown";
}
