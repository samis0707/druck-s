import { getAuth } from "./instance";

export class BaError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BaError";
  }
}

function toBaError(err: unknown): BaError {
  const body = (err as { body?: { code?: string; message?: string } })?.body;
  if (body?.code === "TOO_MANY_ATTEMPTS") {
    return new BaError(429, "Too many attempts, try again later");
  }
  return new BaError(400, body?.message ?? "Verification failed");
}

/** Issue a sign-in code (login / Send verification). Mail goes out via the instance hook. */
export async function sendSignInCode(email: string): Promise<void> {
  try {
    await getAuth().api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  } catch (err) {
    throw toBaError(err);
  }
}

/** Issue an approval step-up code (separate type: Send codes never approve). */
export async function sendApprovalCode(email: string): Promise<void> {
  try {
    await getAuth().api.sendVerificationOTP({ body: { email, type: "email-verification" } });
  } catch (err) {
    throw toBaError(err);
  }
}

export interface SignedIn {
  setCookies: string[];
  userId: string;
  email: string;
}

/** Redeem a sign-in code: creates the session, returns cookies for our response. */
export async function signInWithCode(input: {
  email: string;
  otp: string;
  headers: Headers;
}): Promise<SignedIn> {
  try {
    const { headers, response } = await getAuth().api.signInEmailOTP({
      body: { email: input.email, otp: input.otp },
      headers: input.headers,
      returnHeaders: true,
    });
    const user = (response as { user?: { id: string; email: string } }).user;
    if (!user) throw new BaError(400, "Sign-in failed");
    return { setCookies: headers.getSetCookie(), userId: user.id, email: user.email };
  } catch (err) {
    if (err instanceof BaError) throw err;
    throw toBaError(err);
  }
}

/**
 * Redeem an approval code. Consuming (single-use): a replayed code fails,
 * and the status transition makes double approval a no-op anyway.
 */
export async function consumeApprovalCode(input: { email: string; otp: string }): Promise<void> {
  try {
    await getAuth().api.verifyEmailOTP({ body: { email: input.email, otp: input.otp } });
  } catch (err) {
    throw toBaError(err);
  }
}

/** Staff sign-out: revokes the session behind these headers. */
export async function signOut(headers: Headers): Promise<void> {
  await getAuth().api.signOut({ headers });
}
