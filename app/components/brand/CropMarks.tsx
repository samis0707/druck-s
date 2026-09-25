import type { ReactNode } from "react";
import { LogoMark } from "./LogoMark";

/** Schnittmarken an den vier Ecken des Inhalts (rein dekorativ). */
export function CropMarks({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`crop-marks ${className ?? ""}`}>
      <span className="crop crop-tl" aria-hidden="true" />
      <span className="crop crop-tr" aria-hidden="true" />
      <span className="crop crop-bl" aria-hidden="true" />
      <span className="crop crop-br" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Trennlinie mit Passermarke in der Mitte. */
export function RegisterDivider({ className }: { className?: string }) {
  return (
    <div className={`register-divider ${className ?? ""}`} role="separator">
      <LogoMark size={18} />
    </div>
  );
}
