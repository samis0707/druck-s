import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_PRODUKTION,
  farbwerkAusKlickpreisen,
  guenstigsteGruppen,
  planeDruck,
  pruefeProduktion,
  type Druck,
  type Farbwerk,
  type Klickpreis,
} from './index';

const MIN = 60_000;
const A4 = { breiteUm: 210_000, hoeheUm: 297_000 };
const A3_UEBER = { breiteUm: 330_000, hoeheUm: 487_000 };
const SRA3 = { breiteUm: 325_000, hoeheUm: 460_000 };

const CMYK = [
  { name: 'Cyan', art: 'cyan' },
  { name: 'Magenta', art: 'magenta' },
  { name: 'Gelb', art: 'gelb' },
  { name: 'Schwarz', art: 'schwarz' },
] as const;

/** Ricoh: wechselbare Station vorne, dann C M Y K. */
const RICOH: Farbwerk = {
  farben: [
    ...CMYK,
    { name: 'Weiß', art: 'sonder' },
    { name: 'Lack', art: 'sonder' },
    { name: 'Gold', art: 'sonder' },
  ],
  stationen: [{}, { farbe: 'Cyan' }, { farbe: 'Magenta' }, { farbe: 'Gelb' }, { farbe: 'Schwarz' }],
  gruppen: [
    {
      name: '4c',
      farben: ['Cyan', 'Magenta', 'Gelb', 'Schwarz'],
      klicks: [
        { bisFormat: A4, zehntelcent: 22 },
        { bisFormat: A3_UEBER, zehntelcent: 37 },
      ],
    },
    { name: 'Schwarz', farben: ['Schwarz'], klicks: [{ zehntelcent: 9 }] },
    { name: 'Weiß', farben: ['Weiß'], klicks: [{ zehntelcent: 40 }] },
    { name: 'Lack', farben: ['Lack'], klicks: [{ zehntelcent: 16 }] },
  ],
  wechselMs: 20 * MIN,
};

/** 6 Farben: wechselbar, C M Y K, wechselbar. */
const SECHS: Farbwerk = {
  ...RICOH,
  stationen: [...RICOH.stationen, {}],
};

function plan(werk: Farbwerk, druck: Druck) {
  const p = planeDruck(werk, druck);
  if (!p.ok) throw new Error(p.meldung);
  return p.plan;
}

const farben = (werk: Farbwerk, druck: Druck) =>
  plan(werk, druck).seiten.map((s) => s.durchgaenge.map((d) => d.belegung.map((b) => b.farbe)));

describe('Durchgänge aus Stationen', () => {
  it('4/4 ohne Sonderfarbe: ein Durchgang je Seite, kein Wechsel', () => {
    const p = plan(RICOH, { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } });
    expect([p.durchgaenge, p.wechsel]).toEqual([2, 0]);
  });

  it('Weiß unterlegt auf der Ricoh (Station vorne): ein Durchgang', () => {
    const p = plan(RICOH, {
      vorne: { farbe: 'farbig', sonder: [{ name: 'Weiß', lage: 'unter' }] },
    });
    expect(p.seiten[0]?.durchgaenge).toEqual([
      {
        belegung: [
          { station: 0, farbe: 'Weiß' },
          { station: 1, farbe: 'Cyan' },
          { station: 2, farbe: 'Magenta' },
          { station: 3, farbe: 'Gelb' },
          { station: 4, farbe: 'Schwarz' },
        ],
      },
    ]);
    expect([p.durchgaenge, p.wechsel]).toEqual([1, 1]);
  });

  it('Lack über 4c auf der Ricoh: zwei Durchgänge (Lack danach)', () => {
    expect(farben(RICOH, { vorne: { farbe: 'farbig', sonder: [{ name: 'Lack' }] } })).toEqual([
      [['Cyan', 'Magenta', 'Gelb', 'Schwarz'], ['Lack']],
    ]);
  });

  it('vorne 4c + Weiß unterlegt, hinten 4c + Lack: 3 Durchgänge, 2 Wechsel', () => {
    const druck: Druck = {
      vorne: { farbe: 'farbig', sonder: [{ name: 'Weiß', lage: 'unter' }] },
      hinten: { farbe: 'farbig', sonder: [{ name: 'Lack', lage: 'ueber' }] },
    };
    const p = plan(RICOH, druck);
    expect([p.durchgaenge, p.wechsel]).toEqual([3, 2]);
    expect(farben(RICOH, druck)).toEqual([
      [['Weiß', 'Cyan', 'Magenta', 'Gelb', 'Schwarz']],
      [['Cyan', 'Magenta', 'Gelb', 'Schwarz'], ['Lack']],
    ]);
  });

  it('6-Farben-Maschine: Weiß unten und Lack oben in einem Durchgang, 2 Wechsel', () => {
    const p = plan(SECHS, {
      vorne: {
        farbe: 'farbig',
        sonder: [
          { name: 'Weiß', lage: 'unter' },
          { name: 'Lack', lage: 'ueber' },
        ],
      },
    });
    expect(p.seiten[0]?.durchgaenge[0]?.belegung.map((b) => b.station)).toEqual([0, 1, 2, 3, 4, 5]);
    expect([p.durchgaenge, p.wechsel]).toEqual([1, 2]);
  });

  it('zwei Sonderfarben unterlegt, eine Station: zwei Durchgänge', () => {
    expect(
      farben(RICOH, {
        vorne: {
          farbe: 'farbig',
          sonder: [
            { name: 'Weiß', lage: 'unter' },
            { name: 'Gold', lage: 'unter' },
          ],
        },
      }),
    ).toEqual([[['Weiß'], ['Gold', 'Cyan', 'Magenta', 'Gelb', 'Schwarz']]]);
  });

  it('Weiß vorne und hinten: nur ein Wechsel (die Farbe bleibt in der Station)', () => {
    const weiss = { farbe: 'farbig' as const, sonder: [{ name: 'Weiß', lage: 'unter' as const }] };
    expect(plan(RICOH, { vorne: weiss, hinten: weiss }).wechsel).toBe(1);
  });

  it('schwarz auf der Ricoh: nur die Schwarz-Station', () => {
    expect(farben(RICOH, { vorne: { farbe: 'schwarz' } })).toEqual([[['Schwarz']]]);
  });

  it('Meldungen: Farbe fehlt im Pool, passt auf keine Station, alte Sonderfarbe ohne Namen', () => {
    const einfarbig: Farbwerk = {
      farben: [{ name: 'Schwarz', art: 'schwarz' }],
      stationen: [{ farbe: 'Schwarz' }],
    };
    const vierfarbig: Farbwerk = {
      farben: [...CMYK, { name: 'Weiß', art: 'sonder' }],
      stationen: [{ farbe: 'Cyan' }, { farbe: 'Magenta' }, { farbe: 'Gelb' }, { farbe: 'Schwarz' }],
    };
    expect(planeDruck(einfarbig, { vorne: { farbe: 'farbig' } })).toEqual({
      ok: false,
      meldung: 'vorne: Farbwerk hat kein Cyan',
    });
    expect(
      planeDruck(RICOH, {
        vorne: { farbe: 'farbig' },
        hinten: { farbe: 'farbig', sonder: [{ name: 'Silber' }] },
      }),
    ).toEqual({ ok: false, meldung: 'hinten: Silber ist nicht im Farbwerk der Maschine' });
    expect(
      planeDruck(vierfarbig, { vorne: { farbe: 'farbig', sonder: [{ name: 'weiß' }] } }),
    ).toEqual({ ok: false, meldung: 'vorne: Weiß passt auf keine Station der Maschine' });
    expect(planeDruck(RICOH, { vorne: { farbe: 'farbig', sonderfarben: 1 } })).toEqual({
      ok: false,
      meldung: 'vorne: Sonderfarbe ohne Namen – im Druck die Sonderfarbe wählen',
    });
  });
});

describe('Günstigste Gruppen je Durchgang', () => {
  const namen = (farbenListe: string[], format = SRA3) => {
    const w = guenstigsteGruppen(RICOH, farbenListe, format);
    if (!w.ok) throw new Error(w.meldung);
    return [w.gruppen.map((g) => `${g.name} ${g.zehntelcent}`), w.ohneGruppe];
  };

  it('4c auf SRA3 nimmt den A3-Klick, auf A4 den A4-Klick', () => {
    expect(namen(['Cyan', 'Magenta', 'Gelb', 'Schwarz'])).toEqual([['4c 37'], []]);
    expect(namen(['Cyan', 'Magenta', 'Gelb', 'Schwarz'], A4)).toEqual([['4c 22'], []]);
  });

  it('nur Schwarz zahlt Schwarz, Cyan und Schwarz zahlen 4c', () => {
    expect(namen(['Schwarz'])).toEqual([['Schwarz 9'], []]);
    expect(namen(['Cyan', 'Schwarz'])).toEqual([['4c 37'], []]);
  });

  it('4c mit Weiß zahlt 4c + Weiß, Gold ohne Gruppe kostet nur Toner', () => {
    expect(namen(['Weiß', 'Cyan', 'Magenta', 'Gelb', 'Schwarz'])).toEqual([
      ['4c 37', 'Weiß 40'],
      [],
    ]);
    expect(namen(['Gold'])).toEqual([[], ['Gold']]);
  });

  it('kein passender Klickpreis für das Format: Meldung', () => {
    const nurA4: Farbwerk = {
      ...RICOH,
      gruppen: [
        { name: '4c', farben: ['Cyan', 'Schwarz'], klicks: [{ bisFormat: A4, zehntelcent: 22 }] },
      ],
    };
    expect(guenstigsteGruppen(nurA4, ['Cyan'], SRA3)).toEqual({
      ok: false,
      meldung: 'Kein Klickpreis für Cyan bei diesem Bogenformat',
    });
  });
});

describe('Farbwerk aus den bisherigen Klickpreisen', () => {
  const KLICKS: Klickpreis[] = [
    { farbe: 'farbig', bisFormat: A4, zehntelcent: 22 },
    { farbe: 'farbig', bisFormat: A3_UEBER, zehntelcent: 37 },
    { farbe: 'schwarz', zehntelcent: 9 },
    {
      farbe: 'sonderfarbe',
      zehntelcent: 16,
      toner: { kartuscheZehntelcent: 250_000, reichweiteSeiten: 10_000 },
    },
  ];

  it('4c, Schwarz und Sonderfarbe mit denselben Preisen, Station vorne', () => {
    const { farbwerk, hinweise } = farbwerkAusKlickpreisen(KLICKS);
    expect(hinweise).toEqual([]);
    expect(farbwerk.stationen).toEqual([
      {},
      { farbe: 'Cyan' },
      { farbe: 'Magenta' },
      { farbe: 'Gelb' },
      { farbe: 'Schwarz' },
    ]);
    expect(farbwerk.farben[4]).toEqual({
      name: 'Sonderfarbe',
      art: 'sonder',
      toner: { kartuscheZehntelcent: 250_000, reichweiteSeiten: 10_000 },
    });
    expect(farbwerk.gruppen).toEqual([
      {
        name: '4c',
        farben: ['Cyan', 'Magenta', 'Gelb', 'Schwarz'],
        klicks: [
          { bisLaengeUm: 297_000, zehntelcent: 22 },
          { bisLaengeUm: 487_000, zehntelcent: 37 },
        ],
      },
      { name: 'Schwarz', farben: ['Schwarz'], klicks: [{ zehntelcent: 9 }] },
      { name: 'Sonderfarbe', farben: ['Sonderfarbe'], klicks: [{ zehntelcent: 16 }] },
    ]);
  });

  it('ohne Sonderfarbe keine wechselbare Station; Toner an farbig gibt einen Hinweis', () => {
    const { farbwerk, hinweise } = farbwerkAusKlickpreisen([
      {
        farbe: 'farbig',
        zehntelcent: 30,
        toner: { kartuscheZehntelcent: 100_000, reichweiteSeiten: 20_000 },
      },
    ]);
    expect(farbwerk.stationen).toHaveLength(4);
    expect(farbwerk.farben).toHaveLength(4);
    expect(hinweise).toEqual([
      'Toner am Klickpreis farbig nicht übernommen – an der Farbe eintragen',
    ]);
  });
});

describe('Farbwerk im Schema', () => {
  function mitWerk(werk: unknown) {
    const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as {
      arbeitsplaetze: Record<string, unknown>[];
    };
    const ton = p.arbeitsplaetze.find((a) => a['id'] === 'AP-TON5C');
    if (!ton) throw new Error('AP-TON5C fehlt');
    ton['farbwerk'] = werk;
    return pruefeProduktion(p);
  }

  it('Ricoh-Farbwerk ist gültig, auch das umgestellte', () => {
    expect(mitWerk(RICOH).ok).toBe(true);
    expect(
      mitWerk(farbwerkAusKlickpreisen([{ farbe: 'farbig', zehntelcent: 37 }]).farbwerk).ok,
    ).toBe(true);
  });

  it('doppelte Farbe, unbekannte Farbe an Station und in Gruppe werden am Feld gemeldet', () => {
    const r = mitWerk({
      farben: [
        { name: 'Cyan', art: 'cyan' },
        { name: 'cyan', art: 'cyan' },
      ],
      stationen: [{ farbe: 'Rot' }],
      gruppen: [{ name: 'X', farben: ['Blau'], klicks: [{ zehntelcent: 1 }] }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const pfad = 'arbeitsplaetze.0.farbwerk';
    expect(r.fehler.map((f) => `${f.pfad}: ${f.meldung}`)).toEqual([
      `${pfad}.farben.1.name: Farbe doppelt: cyan`,
      `${pfad}.stationen.0.farbe: Farbe Rot nicht im Farbwerk`,
      `${pfad}.gruppen.0.farben.0: Farbe Blau nicht im Farbwerk`,
    ]);
  });
});
