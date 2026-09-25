import { ViewTransition, type ReactNode } from "react";

/**
 * Templates werden bei jeder Navigation neu eingehängt, daher greifen hier Enter/Exit
 * (Layouts bleiben bestehen). Ohne Typ: kurze Überblendung; mit `transitionTypes` an einem
 * Link: Richtungswechsel nach links (vorwärts) bzw. rechts (zurück).
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-in" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-out" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
