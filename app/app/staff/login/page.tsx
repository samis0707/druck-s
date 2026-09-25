"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");

  async function otp() {
    const res = await fetch("/api/staff/login/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return toast.add({ description: "Login fehlgeschlagen", type: "error" });
    setStep("code");
    toast.add({ description: "Code wurde per E-Mail gesendet.", type: "success" });
  }

  async function verify() {
    const res = await fetch("/api/staff/login/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) return toast.add({ description: "Login fehlgeschlagen", type: "error" });
    toast.add({ description: "Angemeldet.", type: "success" });
    router.push("/staff");
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 md:px-6 py-8">
      <PageHeader
        titel="Staff-Login"
        brotkrumen={[{ bezeichnung: "Staff", href: "/staff" }, { bezeichnung: "Login" }]}
      />
      <Card>
        <CardContent className="space-y-3">
          {step === "email" ? (
            <>
              <Label>E-Mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button onClick={otp}>Code senden</Button>
            </>
          ) : (
            <>
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
              <Button onClick={verify}>Anmelden</Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
