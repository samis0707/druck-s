import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api";
import { requireStaff } from "@/lib/guards";
import {
  ASSISTANT_PROMPT_KEY,
  DEFAULT_ASSISTANT_INSTRUCTIONS,
  validateAssistantInstructions,
} from "@/lib/assistantPrompt";
import { getSetting, listSettingHistory, resetSetting, setSetting } from "@/lib/settings";

/** Editierbarer Anweisungstext des Assistenten (Ausgabevertrag bleibt im Code). */
async function snapshot() {
  const [stored, history] = await Promise.all([
    getSetting(ASSISTANT_PROMPT_KEY),
    listSettingHistory(ASSISTANT_PROMPT_KEY, 20),
  ]);
  return {
    value: stored?.value ?? DEFAULT_ASSISTANT_INSTRUCTIONS,
    isDefault: !stored,
    defaultValue: DEFAULT_ASSISTANT_INSTRUCTIONS,
    updatedAt: stored?.updatedAt ?? null,
    updatedBy: stored?.updatedBy ?? null,
    history,
  };
}

export async function GET(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  return NextResponse.json(await snapshot());
}

export async function PUT(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const body = (await req.json().catch(() => null)) as { value?: unknown } | null;
  const problem = validateAssistantInstructions(body?.value);
  if (problem) return badRequest(problem);
  await setSetting(ASSISTANT_PROMPT_KEY, body!.value as string, guard.user.email);
  return NextResponse.json(await snapshot());
}

async function restoreDefault(email: string) {
  await resetSetting(ASSISTANT_PROMPT_KEY, DEFAULT_ASSISTANT_INSTRUCTIONS, email);
  return NextResponse.json(await snapshot());
}

export async function POST(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "reset") return badRequest('Unbekannte Aktion. Erwartet: {"action":"reset"}.');
  return restoreDefault(guard.user.email);
}

export async function DELETE(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  return restoreDefault(guard.user.email);
}
