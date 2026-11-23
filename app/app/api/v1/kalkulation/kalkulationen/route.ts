import { kalkulationMitKey } from "@/lib/kalkulation/keyApi";

export function GET(req: Request) {
  return kalkulationMitKey(req, "/v1/kalkulationen");
}
