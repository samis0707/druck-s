import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/instance";

export const { POST, GET } = toNextJsHandler(getAuth());
