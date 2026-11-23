import { describe, expect, it } from 'vitest';
import { listenAbschnitte, listenTreffer, type ListenBeschreibung } from './index';

type Probe = { id: string; such: string; platz: boolean; tags: string[] };

const b: ListenBeschreibung<Probe> = {
  id: 'probe',
  suchfelder: (e) => [e.such],
  zusammenhang: { titel: 'passt auf', passt: (e, id) => e.platz && id === 'P1' },
  tags: (e) => e.tags,
  spalten: [{ titel: 'ID', wert: (e) => e.id }],
};

const R = (): Probe[] => [
  { id: 'A', such: 'Bilderdruck Alpha', platz: true, tags: ['rec'] },
  { id: 'B', such: 'Bilderdruck Beta', platz: true, tags: [] },
  { id: 'C', such: 'Offset Gamma', platz: false, tags: ['rec'] },
  { id: 'D', such: 'Offset Delta', platz: false, tags: ['vegan'] },
  { id: 'E', such: 'Offset Epsilon', platz: true, tags: ['rec', 'vegan'] },
];

describe('Listenmuster: Suche, Zusammenhang und Tags wirken zusammen (T69)', () => {
  it('ohne Filter: alle Einträge in unveränderter Reihenfolge', () => {
    const filter = { suchbegriff: '', zusammenhang: null, tags: [] };
    expect(listenTreffer(R(), b, filter)).toEqual(R());
  });

  it('nur Suche (ohne Groß-/Kleinschreibung, Teil von ID, Nummer oder Name)', () => {
    const filter = { suchbegriff: 'BILDERdruck', zusammenhang: null, tags: [] };
    expect(listenTreffer(R(), b, filter).map((e) => e.id)).toEqual(['A', 'B']);
  });

  it('nur Zusammenhang', () => {
    const filter = { suchbegriff: '', zusammenhang: 'P1', tags: [] };
    expect(listenTreffer(R(), b, filter).map((e) => e.id)).toEqual(['A', 'B', 'E']);
    // eine andere Option trifft niemanden
    const anders = { suchbegriff: '', zusammenhang: 'P2', tags: [] };
    expect(listenTreffer(R(), b, anders)).toEqual([]);
  });

  it('nur Tags (UND unter den gewählten Tags)', () => {
    const eins = { suchbegriff: '', zusammenhang: null, tags: ['rec'] };
    expect(listenTreffer(R(), b, eins).map((e) => e.id)).toEqual(['A', 'C', 'E']);
    const beide = { suchbegriff: '', zusammenhang: null, tags: ['rec', 'vegan'] };
    expect(listenTreffer(R(), b, beide).map((e) => e.id)).toEqual(['E']);
  });

  it('UND aus Suche, Zusammenhang und Tags', () => {
    const filter = { suchbegriff: 'bilderdruck', zusammenhang: 'P1', tags: ['rec'] };
    expect(listenTreffer(R(), b, filter).map((e) => e.id)).toEqual(['A']);
  });
});

describe('Listenmuster: Gliederung (T69)', () => {
  it('Abschnitte in der festen Reihenfolge; leere Gliederungs-Werte bleiben weg', () => {
    const g: ListenBeschreibung<Probe> = {
      id: 'probe',
      suchfelder: () => [],
      gliederung: (e) =>
        e.platz ? { schluessel: 'a', titel: 'Passt' } : { schluessel: 'b', titel: 'Passt nicht' },
      gliederungsReihenfolge: ['a', 'b', 'c'],
      spalten: [],
    };
    expect(listenAbschnitte(R(), g)).toEqual([
      {
        schluessel: 'a',
        titel: 'Passt',
        eintraege: R().filter((e) => e.platz),
      },
      {
        schluessel: 'b',
        titel: 'Passt nicht',
        eintraege: R().filter((e) => !e.platz),
      },
    ]);
    // „c“ hat keine Einträge und bleibt weg
  });

  it('ohne feste Reihenfolge: Reihenfolge des ersten Auftretens', () => {
    const g: ListenBeschreibung<Probe> = {
      id: 'probe',
      suchfelder: () => [],
      gliederung: (e) => ({ schluessel: e.such.slice(0, 1), titel: e.such.slice(0, 1) }),
      spalten: [],
    };
    expect(listenAbschnitte(R(), g).map((a) => a.schluessel)).toEqual(['B', 'O']);
  });
});
