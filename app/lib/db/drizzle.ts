import { drizzle } from "drizzle-orm/node-postgres";
import { getPool } from "../db";
import * as authSchema from "./schema/auth";
import * as appSchema from "./schema/app";

/** Drizzle over the shared pg Pool (used by the Better Auth adapter). */
export const db = drizzle(getPool(), { schema: { ...authSchema, ...appSchema } });
export type Db = typeof db;
