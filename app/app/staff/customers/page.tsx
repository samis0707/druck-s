"use client";

/* Fetch-on-mount: setState runs after await (no cascading render). */
/* eslint-disable react-hooks/set-state-in-effect */

/* Fetch-on-mount data loading: setState runs after await (no cascading render). */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge, toneVariant } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, THead, TRow, TH, TD } from "@/components/ui/table";

interface Identity {
  id: string;
  email: string;
  displayName: string | null;
  firm: string | null;
  status: string;
  requestCount: string;
  latestDump: { id: string; importedAt: string; orderCount: number } | null;
}

interface DumpVorschauDaten {
  md: string;
  truncated: boolean;
  totalLines: number;
}

/** Lädt die Dump-Vorschau beim ersten Aufklappen, zeigt gekürzt + vollständig auf Abruf. */
function DumpVorschau({ identityId }: { identityId: string }) {
  const [daten, setDaten] = useState<DumpVorschauDaten | null>(null);
  const [voll, setVoll] = useState(false);
  const [fehler, setFehler] = useState(false);

  async function laden(vollstaendig: boolean) {
    const res = await fetch(`/api/staff/history/preview?identityId=${identityId}${vollstaendig ? "&full=1" : ""}`);
    if (!res.ok) {
      setFehler(true);
      return;
    }
    setDaten((await res.json()) as DumpVorschauDaten);
    setVoll(vollstaendig);
  }

  return (
    <details
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && !daten && !fehler) void laden(false);
      }}
    >
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Inhalt ansehen</summary>
      <div className="mt-2 max-w-3xl space-y-2">
        {fehler && <p className="text-sm text-destructive">Vorschau konnte nicht geladen werden.</p>}
        {!fehler && !daten && <p className="text-sm text-muted-foreground">Wird geladen …</p>}
        {daten && (
          <>
            <pre className="max-h-64 overflow-auto rounded-2xl border border-border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
              {daten.md}
            </pre>
            <p className="text-xs text-muted-foreground">
              {daten.truncated
                ? `${daten.totalLines} Zeilen insgesamt — gekürzt dargestellt.`
                : `${daten.totalLines} Zeilen insgesamt.`}{" "}
              {daten.truncated && !voll && (
                <button type="button" className="underline" onClick={() => void laden(true)}>
                  Vollständig anzeigen
                </button>
              )}
            </p>
          </>
        )}
      </div>
    </details>
  );
}

const STATUS_DE: Record<string, string> = {
  prospect: "Interessent",
  customer: "Kunde",
  disabled: "Deaktiviert",
};

/** Backoffice: Kunden, Einmal-Links, Freischaltung, Historien-Import. */
export default function CustomersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Identity[]>([]);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [dumpEmail, setDumpEmail] = useState("");
  const [dump, setDump] = useState<File | null>(null);
  const [dumpInfo, setDumpInfo] = useState("");

  async function load() {
    const res = await fetch("/api/staff/identities");
    if (!res.ok) {
      router.push("/staff/login");
      return;
    }
    setRows(((await res.json()) as { identities: Identity[] }).identities);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createLink() {
    const res = await fetch("/api/staff/upload-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) return toast.add({ description: data.error ?? "Fehlgeschlagen", type: "error" });
    setLink(data.url);
    toast.add({ description: "Link erstellt — einmalig, 7 Tage gültig.", type: "success" });
    await load();
  }

  async function mature(id: string) {
    await fetch(`/api/staff/identities/${id}`, { method: "POST" });
    toast.add({ description: "Kunde freigeschaltet.", type: "success" });
    await load();
  }

  async function disable(id: string) {
    await fetch(`/api/staff/identities/${id}`, { method: "DELETE" });
    toast.add({ description: "Konto deaktiviert.", type: "success" });
    await load();
  }

  async function uploadDump() {
    if (!dump) return toast.add({ description: "Bitte eine Dump-Datei wählen.", type: "error" });
    const form = new FormData();
    form.set("email", dumpEmail);
    form.set("dump", dump);
    const res = await fetch("/api/staff/history", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) return toast.add({ description: data.error ?? "Import fehlgeschlagen", type: "error" });
    setDumpInfo(`${data.orderCount} Aufträge importiert.`);
    toast.add({ description: "Historie importiert.", type: "success" });
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 md:px-6 py-8">
      <PageHeader
        titel="Kunden & Links"
        beschreibung="Kunden, Einmal-Links, Freischaltung, Historien-Import."
        brotkrumen={[{ bezeichnung: "Staff", href: "/staff" }, { bezeichnung: "Kunden & Links" }]}
      />
      <Card>
        <CardContent className="space-y-3">
          <CardTitle>Einmal-Upload-Link</CardTitle>
          <div className="flex gap-2">
            <Input placeholder="kunde@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button onClick={createLink}>Link erstellen</Button>
          </div>
          {link && (
            <p className="break-all text-sm">
              Link (einmalig, 7 Tage): <span className="font-mono">{link}</span>
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3">
          <CardTitle>Historien-Dump (MIS-XML)</CardTitle>
          <div className="flex gap-2">
            <Input placeholder="kunde@example.com" value={dumpEmail} onChange={(e) => setDumpEmail(e.target.value)} />
            <Input type="file" accept=".xml" onChange={(e) => setDump(e.target.files?.[0] ?? null)} />
            <Button onClick={uploadDump}>Importieren</Button>
          </div>
          {dumpInfo && <p className="text-sm text-muted-foreground">{dumpInfo}</p>}
        </CardContent>
      </Card>
      <Table>
        <THead>
          <TRow>
            <TH>E-Mail</TH>
            <TH>Firma</TH>
            <TH>Status</TH>
            <TH>Aufträge</TH>
            <TH>Dump</TH>
            <TH>Aktionen</TH>
          </TRow>
        </THead>
        <tbody>
          {rows.map((r) => (
            <TRow key={r.id}>
              <TD>{r.email}</TD>
              <TD>{r.firm ?? "—"}</TD>
              <TD>
                <Badge variant={toneVariant(r.status === "customer" ? "green" : r.status === "disabled" ? "red" : "yellow")}>
                  {STATUS_DE[r.status] ?? r.status}
                </Badge>
              </TD>
              <TD>{r.requestCount}</TD>
              <TD>
                {r.latestDump ? (
                  <div className="space-y-1 text-xs">
                    <p className="text-muted-foreground tabular-nums">
                      {new Date(r.latestDump.importedAt).toLocaleDateString("de-DE")} ·{" "}
                      {r.latestDump.orderCount} Aufträge
                    </p>
                    <DumpVorschau identityId={r.id} />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">kein Dump</span>
                )}
              </TD>
              <TD>
                <div className="flex gap-2">
                  {r.status === "prospect" && (
                    <Button size="sm" variant="outline" onClick={() => mature(r.id)}>
                      Freischalten
                    </Button>
                  )}
                  {r.status !== "disabled" && (
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button size="sm" variant="outline">Deaktivieren</Button>} />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Konto wirklich deaktivieren?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Sessions verlieren sofort die Gültigkeit.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction onClick={() => disable(r.id)}>Deaktivieren</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </TD>
            </TRow>
          ))}
        </tbody>
      </Table>
    </main>
  );
}
