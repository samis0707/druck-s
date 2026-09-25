import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "dmp druckraum — Druckdaten hochladen, vorprüfen, freigeben";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#16191c";

/** Social-Vorschau: Bogen mit Schnittmarken, digitale-medien-Logo und Wortmarke. */
export default async function OpengraphImage() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "digitale-medien-logo.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "#f7f8f5",
          padding: "0 96px",
          gap: 72,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, color: INK }}>
            <span style={{ fontSize: 40, fontWeight: 600, color: "#5b636b", letterSpacing: 2 }}>dmp</span>
            <span style={{ fontSize: 108, fontWeight: 700, letterSpacing: -4 }}>druckraum</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 44, color: "#3d7a17", fontWeight: 600, lineHeight: 1.2 }}>
            <span>Druckdaten hochladen.</span>
            <span>Vor dem Druck geprüft.</span>
          </div>
          <div style={{ fontSize: 28, color: "#5b636b" }}>von digitale medien print</div>
        </div>
        <div style={{ display: "flex", position: "relative", width: 300, height: 380 }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 300,
              height: 380,
              background: "#ffffff",
              boxShadow: "0 24px 40px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ height: 150, background: "#005e97", display: "flex" }} />
            <div style={{ margin: "26px 24px 0", height: 16, width: 200, background: INK, borderRadius: 3, display: "flex" }} />
            <div style={{ margin: "10px 24px 0", height: 16, width: 140, background: INK, borderRadius: 3, display: "flex" }} />
            <div style={{ margin: "22px 24px 0", height: 6, width: 250, background: "#d5d9d2", display: "flex" }} />
            <div style={{ margin: "8px 24px 0", height: 6, width: 220, background: "#d5d9d2", display: "flex" }} />
            <div style={{ margin: "8px 24px 0", height: 6, width: 150, background: "#d5d9d2", display: "flex" }} />
          </div>
          <img src={logo} alt="" width={96} height={96} style={{ position: "absolute", top: 8, right: 8 }} />
          <div style={{ position: "absolute", left: 12, top: 12, width: 276, height: 356, border: `1px solid ${INK}`, display: "flex" }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
