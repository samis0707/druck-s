/** Frozen assistant note (annotation only — never transitions or sends). */

export interface NoteSource {
  kind: "file" | "analysis" | "history" | "text";
  ref: string;
}

export interface AssistantNote {
  id: string;
  requestId: string;
  bundleVersion: number | null;
  inputHash: string;
  bullets: { text: string; sources: NoteSource[] }[];
  historyState: "present" | "absent" | "stale";
  suggestedCategory: string | null;
  createdAt: string;
}
