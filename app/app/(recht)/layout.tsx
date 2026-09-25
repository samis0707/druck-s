import type { ReactNode } from "react";
import "./recht.css";

export default function RechtLayout({ children }: { children: ReactNode }) {
  return (
    <main className="recht">
      <article className="recht-doc">{children}</article>
    </main>
  );
}
