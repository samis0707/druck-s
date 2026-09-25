-- Sprechende Auftragsnummer (DDMMJJ-NNN, Europe/Berlin), vergeben beim Eingang (DRAFT -> RECEIVED).
ALTER TABLE requests ADD COLUMN IF NOT EXISTS number text UNIQUE;

CREATE TABLE IF NOT EXISTS request_number_counters (
  day date PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0
);

-- Bestand nachtragen: je Tag fortlaufend nach Eingangsreihenfolge (Drafts bleiben ohne Nummer).
WITH ranked AS (
  SELECT id,
         to_char(created_at AT TIME ZONE 'Europe/Berlin', 'DDMMYY') AS d,
         row_number() OVER (
           PARTITION BY (created_at AT TIME ZONE 'Europe/Berlin')::date
           ORDER BY created_at, id
         ) AS n
  FROM requests
  WHERE status <> 'DRAFT' AND number IS NULL
)
UPDATE requests r
SET number = ranked.d || '-' || lpad(ranked.n::text, 3, '0')
FROM ranked
WHERE r.id = ranked.id;

INSERT INTO request_number_counters (day, last_seq)
SELECT (created_at AT TIME ZONE 'Europe/Berlin')::date, count(*)
FROM requests
WHERE status <> 'DRAFT'
GROUP BY 1
ON CONFLICT (day) DO NOTHING;

-- Redaktionell pflegbare Einstellungen (z. B. Assistenten-Prompt) mit Verlauf.
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL,
  value text NOT NULL,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_settings_history_key_idx ON app_settings_history (key, id DESC);

--DOWN--
DROP TABLE IF EXISTS app_settings_history;
DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS request_number_counters;
ALTER TABLE requests DROP COLUMN IF EXISTS number;
