import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";
import { checkStorage } from "@/lib/storage";
import { checkMail } from "@/lib/mail";
import { config } from "@/lib/config";

export async function GET() {
  const [db, storage, mail] = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkMail(),
  ]);
  const ok = db.ok && storage.ok && mail.ok;
  return NextResponse.json(
    {
      ok,
      checks: {
        db,
        storage,
        mail,
        mistral: {
          ok: config.mistral.apiKey !== "",
          detail: config.mistral.apiKey ? "key configured" : "MISTRAL_API_KEY not set",
        },
      },
    },
    { status: ok ? 200 : 503 },
  );
}
