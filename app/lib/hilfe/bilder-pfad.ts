import intern from "./intern.json";

/** Namen der Schulungsbilder, die nicht öffentlich sind (Mitarbeiter-Kurs). Quelle: lib/hilfe/intern.json. */
const INTERN = new Set<string>(intern.bilder);

export function istInternesBild(name: string): boolean {
  return INTERN.has(name);
}

/** URL eines Schulungsbildes: öffentliche aus public/hilfe/img, interne über die Staff-gesicherte Route. */
export function bildPfad(name: string): string {
  return istInternesBild(name) ? `/hilfe-intern/img/${name}.webp` : `/hilfe/img/${name}.webp`;
}
