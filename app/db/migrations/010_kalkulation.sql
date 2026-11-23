-- Kalkulation (Richtpreis). Siehe openspec/changes/kalkulation-richtpreis.
-- Postgres-Pendant zur Schnittstellen-Datenbank der kalpri-Werkbank (bereiche, verlauf, dateien),
-- API-Schlüssel mit Scope und Richtpreis-Snapshots zu Anfragen.

-- Aktueller Stand je Datenbereich der Werkbank (Material, Produktion, Artikel, ...). Der Inhalt
-- liegt als Text vor (nicht jsonb), damit die Werkbank ihn Zeichen für Zeichen vergleichen kann.
-- version = optimistische Sperre: Schreiben nur mit der Version, die der Schreibende kennt.
CREATE TABLE kalkulation_bereiche (
  schluessel text PRIMARY KEY,
  json text NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  geaendert_am timestamptz NOT NULL DEFAULT now(),
  geaendert_von text NOT NULL
);

-- Jeder gespeicherte Stand wird angehängt, nie geändert oder gelöscht (Rückverfolgbarkeit).
CREATE TABLE kalkulation_verlauf (
  nr bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schluessel text NOT NULL,
  version integer NOT NULL,
  json text NOT NULL,
  zeit timestamptz NOT NULL DEFAULT now(),
  von text NOT NULL,
  anlass text NOT NULL
);
CREATE INDEX kalkulation_verlauf_schluessel_idx ON kalkulation_verlauf (schluessel, version);

CREATE FUNCTION kalkulation_verlauf_nur_anhaengen() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'kalkulation_verlauf ist nur anhängend (kein UPDATE/DELETE)';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER kalkulation_verlauf_unveraenderlich
  BEFORE UPDATE OR DELETE ON kalkulation_verlauf
  FOR EACH ROW EXECUTE FUNCTION kalkulation_verlauf_nur_anhaengen();

-- Dateien der Stammdaten (z. B. Stanzkonturen). id = SHA-256 des Inhalts. Der Inhalt liegt im
-- S3-Speicher von druck-s unter speicher_key; hier nur die Metadaten.
CREATE TABLE kalkulation_dateien (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  groesse bigint NOT NULL CHECK (groesse > 0),
  typ text NOT NULL,
  name text NOT NULL,
  speicher_key text NOT NULL,
  angelegt_am timestamptz NOT NULL DEFAULT now(),
  von text NOT NULL
);

-- API-Schlüssel für Maschinenzugriff (Authorization: Bearer kal_<64 hex>). Gespeichert wird nur
-- der SHA-256-Hash plus ein nicht geheimes Präfix; scopes begrenzen, was der Schlüssel darf.
CREATE TABLE kalkulation_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  key_prefix text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{kalkulation}',
  active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX kalkulation_api_keys_prefix_idx ON kalkulation_api_keys (key_prefix);

-- Richtpreis-Snapshot zu einer Anfrage: Eingaben, Ergebnis und die damals geltenden
-- Preis-Einstellungen, damit die Zahl später nachvollziehbar bleibt.
CREATE TABLE request_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  artikel_id text NOT NULL,
  antworten jsonb NOT NULL DEFAULT '{}',
  auflagen integer[] NOT NULL CHECK (cardinality(auflagen) BETWEEN 1 AND 6),
  ergebnis jsonb NOT NULL,
  preis_einstellungen jsonb NOT NULL,
  kalpri_herkunft jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_quotes_request_idx ON request_quotes (request_id, created_at DESC);

--DOWN--
DROP TABLE IF EXISTS request_quotes;
DROP TABLE IF EXISTS kalkulation_api_keys;
DROP TABLE IF EXISTS kalkulation_dateien;
DROP TRIGGER IF EXISTS kalkulation_verlauf_unveraenderlich ON kalkulation_verlauf;
DROP TABLE IF EXISTS kalkulation_verlauf;
DROP FUNCTION IF EXISTS kalkulation_verlauf_nur_anhaengen();
DROP TABLE IF EXISTS kalkulation_bereiche;
