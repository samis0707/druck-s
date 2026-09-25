/**
 * Module boundary contract (design §8):
 * - Server-only modules: db, storage, mail, mistral, auth, and everything under
 *   lib/requests, lib/identities, lib/links, lib/analysis, lib/approval,
 *   lib/assistant, lib/history, lib/audit.
 *   They may only be imported from Route Handlers, server components,
 *   and server-side lib code — never from "use client" components.
 * - Client components talk to the backend exclusively through
 *   app/api route handlers.
 * Enforced by tests/boundary.test.ts.
 */
export {};
