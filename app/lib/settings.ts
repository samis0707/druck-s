import { query, withTx } from "./db";

export interface SettingRecord {
  value: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface SettingHistoryEntry {
  id: string;
  value: string;
  updatedBy: string | null;
  createdAt: string;
}

/** Aktueller Wert eines Schlüssels oder null, wenn nie gesetzt (bzw. zurückgesetzt). */
export async function getSetting(key: string): Promise<SettingRecord | null> {
  const res = await query<SettingRecord>(
    `SELECT value, updated_by AS "updatedBy", updated_at AS "updatedAt" FROM app_settings WHERE key = $1`,
    [key],
  );
  return res.rows[0] ?? null;
}

/** Setzt den Wert und schreibt dieselbe Version in einer Transaktion in den Verlauf. */
export async function setSetting(key: string, value: string, updatedBy: string | null): Promise<void> {
  await withTx(async (client) => {
    await client.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, value, updatedBy],
    );
    await client.query(`INSERT INTO app_settings_history (key, value, updated_by) VALUES ($1, $2, $3)`, [
      key,
      value,
      updatedBy,
    ]);
  });
}

/**
 * Stellt den Standard wieder her: entfernt den gespeicherten Wert. Der Verlauf erhält einen
 * Eintrag mit dem dann gültigen Standardtext, damit die Rücknahme nachvollziehbar bleibt.
 */
export async function resetSetting(key: string, defaultValue: string, updatedBy: string | null): Promise<void> {
  await withTx(async (client) => {
    await client.query(`DELETE FROM app_settings WHERE key = $1`, [key]);
    await client.query(`INSERT INTO app_settings_history (key, value, updated_by) VALUES ($1, $2, $3)`, [
      key,
      defaultValue,
      updatedBy,
    ]);
  });
}

/** Neueste Verlaufseinträge zuerst. */
export async function listSettingHistory(key: string, limit = 20): Promise<SettingHistoryEntry[]> {
  const res = await query<SettingHistoryEntry>(
    `SELECT id::text AS id, value, updated_by AS "updatedBy", created_at AS "createdAt"
     FROM app_settings_history WHERE key = $1 ORDER BY id DESC LIMIT $2`,
    [key, limit],
  );
  return res.rows;
}
