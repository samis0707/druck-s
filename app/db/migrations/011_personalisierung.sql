-- Personalisierung (variable Daten in Druck-PDFs). Siehe openspec/changes/personalisierung.
-- Vorlagen sind versioniert: eine Version ist unveränderlich, sobald die Vorlage aktiv ist. Jede
-- Änderung einer aktiven Vorlage legt eine neue Version an; Gast-Entwürfe bleiben an ihrer Version.
-- Datensätze von Gästen (jsonb) liegen nur in pers_drafts und werden nach Ablauf gelöscht.

-- Hochgeladene PDFs/Bilder (Design, Überlagerung, Logos); Inhalt liegt im Objektspeicher.
CREATE TABLE pers_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('design', 'ueberlagerung', 'bild')),
  storage_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  pages integer,
  width_mm numeric(8, 2),
  height_mm numeric(8, 2),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Schriftbibliothek: je Familie und Schnitt eine TTF/OTF-Datei.
CREATE TABLE pers_fonts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family text NOT NULL,
  style text NOT NULL CHECK (style IN ('regular', 'bold', 'italic', 'bolditalic')),
  file_name text NOT NULL,
  storage_key text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family, style)
);

-- Globale Farbpalette (CMYK in Prozent, optional Sonderfarbe).
CREATE TABLE pers_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  c numeric(5, 2) NOT NULL CHECK (c BETWEEN 0 AND 100),
  m numeric(5, 2) NOT NULL CHECK (m BETWEEN 0 AND 100),
  y numeric(5, 2) NOT NULL CHECK (y BETWEEN 0 AND 100),
  k numeric(5, 2) NOT NULL CHECK (k BETWEEN 0 AND 100),
  spot_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pers_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf', 'aktiv')),
  visibility text NOT NULL DEFAULT 'mitarbeiter' CHECK (visibility IN ('mitarbeiter', 'kunden', 'oeffentlich')),
  current_version integer NOT NULL DEFAULT 1,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

-- Unveränderlicher Inhalt je Version: das Vorlagen-Schema (lib/personalisierung/schema.ts) und ein
-- Schnappschuss der verwendeten Farben (spätere Änderungen der Palette ändern alte Versionen nicht).
CREATE TABLE pers_template_versions (
  template_id uuid NOT NULL REFERENCES pers_templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  spec jsonb NOT NULL,
  colors jsonb NOT NULL DEFAULT '[]',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, version)
);

-- Sichtbarkeit "bestimmte Kunden".
CREATE TABLE pers_template_customers (
  template_id uuid NOT NULL REFERENCES pers_templates(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, customer_id)
);
CREATE INDEX pers_template_customers_customer_idx ON pers_template_customers (customer_id);

-- Zugriffs-Links für "öffentlich per Link": zufälliges Token, nur der SHA-256-Hash wird gespeichert.
CREATE TABLE pers_access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES pers_templates(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX pers_access_links_template_idx ON pers_access_links (template_id);

-- Entwürfe von Gästen (und Kunden): Datensätze als jsonb, kurze Lebensdauer. Zugriff nur mit dem
-- Entwurfs-Token (Hash gespeichert). Abgelaufene Zeilen löscht der Sweep.
CREATE TABLE pers_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  template_version integer NOT NULL,
  link_id uuid REFERENCES pers_access_links(id) ON DELETE SET NULL,
  access_hash text NOT NULL,
  records jsonb NOT NULL DEFAULT '[]',
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (template_id, template_version) REFERENCES pers_template_versions(template_id, version) ON DELETE CASCADE
);
CREATE INDEX pers_drafts_expires_idx ON pers_drafts (expires_at);

-- Erzeugte Druckdaten einer Anfrage: PDF und Datentabelle liegen als request_files; hier steht, mit
-- welcher Vorlagen-Version sie entstanden sind.
CREATE TABLE pers_request_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  template_id uuid REFERENCES pers_templates(id) ON DELETE SET NULL,
  template_version integer NOT NULL,
  pdf_file_id uuid REFERENCES request_files(id) ON DELETE SET NULL,
  data_file_id uuid REFERENCES request_files(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('einzeln', 'ausgeschossen')),
  record_count integer NOT NULL,
  nutzen_count integer NOT NULL,
  page_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pers_request_outputs_request_idx ON pers_request_outputs (request_id);

-- Retorix-Import: idempotent über die ID des Quellprodukts.
ALTER TABLE pers_templates ADD COLUMN import_source text UNIQUE;
ALTER TABLE pers_fonts ADD COLUMN import_source text UNIQUE;
ALTER TABLE pers_colors ADD COLUMN import_source text UNIQUE;
ALTER TABLE pers_files ADD COLUMN import_source text UNIQUE;

--DOWN--
DROP TABLE IF EXISTS pers_request_outputs;
DROP TABLE IF EXISTS pers_drafts;
DROP TABLE IF EXISTS pers_access_links;
DROP TABLE IF EXISTS pers_template_customers;
DROP TABLE IF EXISTS pers_template_versions;
DROP TABLE IF EXISTS pers_templates;
DROP TABLE IF EXISTS pers_colors;
DROP TABLE IF EXISTS pers_fonts;
DROP TABLE IF EXISTS pers_files;
