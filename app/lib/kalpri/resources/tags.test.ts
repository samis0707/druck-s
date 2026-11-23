import { describe, expect, it } from 'vitest';
import { leeresLager } from './lager';
import { tagAnlegen } from './tags';

describe('Tag-Katalog (T69)', () => {
  it('legt einen Tag an und hängt ihn an den Katalog', () => {
    const e = tagAnlegen(leeresLager(), { id: 'rec', name: 'Recycling' });
    if (!e.ok) throw new Error(JSON.stringify(e.fehler));
    expect(e.wert.tags).toEqual([{ id: 'rec', name: 'Recycling' }]);
  });

  it('leitet die ID aus dem Namen ab, wenn keine angegeben ist', () => {
    const e = tagAnlegen(leeresLager(), { name: 'Vegan & Bio' });
    if (!e.ok) throw new Error(JSON.stringify(e.fehler));
    expect(e.wert.tags).toEqual([{ id: 'vegan-bio', name: 'Vegan & Bio' }]);
  });

  it('kumuliert Tags in der Reihenfolge des Anlegens', () => {
    let lager = leeresLager();
    for (const tag of [
      { id: 'rec', name: 'Recycling' },
      { id: 'vegan', name: 'Vegan' },
    ]) {
      const e = tagAnlegen(lager, tag);
      if (!e.ok) throw new Error(JSON.stringify(e.fehler));
      lager = e.wert;
    }
    expect(lager.tags?.map((t) => t.id)).toEqual(['rec', 'vegan']);
  });

  it('lehnt eine doppelte ID ab (ausdrücklich und abgeleitet)', () => {
    // ausdrücklich: dieselbe ID zweimal
    const a = tagAnlegen(leeresLager(), { id: 'rec', name: 'Recycling' });
    if (!a.ok) throw new Error(JSON.stringify(a.fehler));
    expect(tagAnlegen(a.wert, { id: 'rec', name: 'anderer Name' })).toEqual({
      ok: false,
      fehler: [{ pfad: 'id', meldung: 'ID doppelt: rec' }],
    });
    // abgeleitet: derselbe Name → dieselbe ID
    const b = tagAnlegen(leeresLager(), { name: 'Recycling' });
    if (!b.ok) throw new Error(JSON.stringify(b.fehler));
    expect(b.wert.tags?.[0]?.id).toBe('recycling');
    expect(tagAnlegen(b.wert, { name: 'Recycling' })).toEqual({
      ok: false,
      fehler: [{ pfad: 'id', meldung: 'ID doppelt: recycling' }],
    });
  });

  it('prüft die Eingabe: Name fehlt und Umlaut in der ID sind Fehler am Feld', () => {
    const ohneName = tagAnlegen(leeresLager(), { id: 'rec' });
    expect(ohneName.ok).toBe(false);
    if (!ohneName.ok) {
      expect(ohneName.fehler).toEqual([{ pfad: 'name', meldung: 'Pflichtfeld' }]);
    }
    const umlaut = tagAnlegen(leeresLager(), { id: 'Öko', name: 'Öko Papier' });
    expect(umlaut.ok).toBe(false);
    if (!umlaut.ok) {
      expect(umlaut.fehler).toEqual([{ pfad: 'id', meldung: 'nur Buchstaben, Ziffern, _ und -' }]);
    }
  });
});
