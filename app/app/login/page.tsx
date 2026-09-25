"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";

/** Kunden-Login ohne Upload: E-Mail + Code, danach weiter zum Konto. */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/account").then((res) => {
      if (res.ok) router.replace("/konto");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function otp() {
    if (!email.trim()) return toast.add({ description: "Bitte geben Sie Ihre E-Mail-Adresse ein.", type: "error" });
    setBusy(true);
    try {
      const res = await fetch("/api/login/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Login fehlgeschlagen");
      setStep("code");
      toast.add({ description: "Code wurde per E-Mail gesendet.", type: "success" });
    } catch (e) {
      toast.add({ description: e instanceof Error ? e.message : "Login fehlgeschlagen", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    try {
      const res = await fetch("/api/login/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Login fehlgeschlagen");
      toast.add({ description: "Angemeldet.", type: "success" });
      router.push("/konto");
    } catch (e) {
      toast.add({ description: e instanceof Error ? e.message : "Login fehlgeschlagen", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 md:px-6 py-8">
      <PageHeader
        titel="Anmelden"
        beschreibung="Melden Sie sich mit Ihrer E-Mail-Adresse an — ganz ohne Upload."
        brotkrumen={[{ bezeichnung: "Start", href: "/" }, { bezeichnung: "Anmelden" }]}
      />
      <Card>
        <CardContent className="space-y-3">
          {step === "email" ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="login-email">E-Mail</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void otp();
                  }}
                />
              </div>
              <Button onClick={otp} disabled={busy}>
                {busy ? "Wird gesendet …" : "Code senden"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Code an {email} gesendet. Kein Code da? Prüfen Sie den Spam-Ordner.
              </p>
              <div className="space-y-1">
                <Label htmlFor="login-code">Code aus der E-Mail</Label>
                <Input
                  id="login-code"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void verify();
                  }}
                />
              </div>
              <Button onClick={verify} disabled={busy}>
                {busy ? "Wird geprüft …" : "Anmelden"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
