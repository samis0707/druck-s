"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { ApiFehler } from "@/lib/personalisierung/ui/api";

/** Fehler der Staff-Routen behandeln: ohne Anmeldung zum Login, sonst verständlicher Hinweis. */
export function useStaffFehler() {
  const router = useRouter();
  return useCallback(
    (e: unknown, vorgabe = "Das hat nicht geklappt.") => {
      if (e instanceof ApiFehler && (e.status === 401 || e.status === 403)) {
        router.push("/staff/login");
        return;
      }
      toast.add({ description: e instanceof Error && e.message ? e.message : vorgabe, type: "error" });
    },
    [router],
  );
}
