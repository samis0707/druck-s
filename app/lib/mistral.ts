import { Mistral } from "@mistralai/mistralai";
import { config } from "./config";

let client: Mistral | null = null;

/** Shared Mistral client (EU endpoint, pinned model). Server-side only. */
export function getMistral(): Mistral {
  if (!client) {
    if (!config.mistral.apiKey) throw new Error("MISTRAL_API_KEY is not set");
    client = new Mistral({ apiKey: config.mistral.apiKey, server: "eu" });
  }
  return client;
}

export function mistralModel(): string {
  return config.mistral.model;
}
