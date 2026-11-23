-- Richtpreis zur offenen Anfrage (openspec/changes/kalkulation-richtpreis). Die Angaben des
-- Interessenten (Artikel, Antworten, Auflagen) werden mit dem Entwurf gespeichert und erst beim
-- Bestätigen serverseitig zu einem Richtpreis-Snapshot (request_quotes) berechnet.
-- Form: { "artikel": "...", "antworten": { ... }, "auflagen": [500, 1000] }. Keine Preise vom Client.
ALTER TABLE requests ADD COLUMN inquiry_quote jsonb;

--DOWN--
ALTER TABLE requests DROP COLUMN IF EXISTS inquiry_quote;
