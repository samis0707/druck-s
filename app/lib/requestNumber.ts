import type { PoolClient } from "pg";

/** Auftragsnummer DDMMJJ-NNN (Tag in Europe/Berlin, NNN je Tag fortlaufend, ab 1000 vierstellig). */
export function formatRequestNumber(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

/**
 * Nächste Nummer vergeben und am Auftrag speichern. Läuft in der Transaktion des
 * Eingangs-Events (Zeile ist dort bereits gesperrt); bestehende Nummern bleiben unangetastet.
 */
export async function assignRequestNumber(client: PoolClient, requestId: string): Promise<string> {
  const existing = await client.query<{ number: string | null }>(
    "SELECT number FROM requests WHERE id = $1",
    [requestId],
  );
  if (existing.rows[0]?.number) return existing.rows[0].number;
  const counter = await client.query<{ prefix: string; seq: number }>(
    `INSERT INTO request_number_counters (day, last_seq)
     VALUES ((now() AT TIME ZONE 'Europe/Berlin')::date, 1)
     ON CONFLICT (day) DO UPDATE SET last_seq = request_number_counters.last_seq + 1
     RETURNING to_char(day, 'DDMMYY') AS prefix, last_seq AS seq`,
  );
  const number = formatRequestNumber(counter.rows[0].prefix, counter.rows[0].seq);
  await client.query("UPDATE requests SET number = $1 WHERE id = $2", [number, requestId]);
  return number;
}

/** Anzeige-Referenz: Auftragsnummer, für Altdaten/Entwürfe ersatzweise die Kurz-ID. */
export function requestRef(request: { number?: string | null; id: string }): string {
  return request.number ?? request.id.slice(0, 8);
}
