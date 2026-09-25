import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { admin } from "better-auth/plugins/admin";
import { nextCookies } from "better-auth/next-js";
import { db } from "../db/drizzle";
import { authAccount, authSession, authUser, authVerification } from "../db/schema/auth";
import { config } from "../config";
import { sendMail } from "../mail";
import { otpMail } from "../mailTemplates";
import { ADMIN_ROLES, DEFAULT_ROLE, ROLES } from "./roles";

let instance: ReturnType<typeof buildAuth> | null = null;

function buildAuth() {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
      },
    }),
    secret: config.auth.secret,
    baseURL: config.auth.url,
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: DEFAULT_ROLE, required: false },
        status: { type: "string", defaultValue: "prospect", required: false },
        firm: { type: "string", required: false },
      },
    },
    session: {
      // Matches the locked TTL: sessions live 24h.
      expiresIn: 60 * 60 * 24,
      updateAge: 60 * 60 * 12,
    },
    plugins: [
      emailOTP({
        expiresIn: 600,
        allowedAttempts: 5,
        otpLength: 6,
        storeOTP: "hashed",
        // No self-provisioning: staff onboarding (allowlist) is the only door in.
        disableSignUp: true,
        sendVerificationOTP: async ({ email, otp, type }) => {
          const mail = otpMail(
            otp,
            type === "email-verification" ? "approve" : "verify",
          );
          await sendMail({ to: email, subject: mail.subject, text: mail.text, html: mail.html });
        },
      }),
      admin({
        defaultRole: DEFAULT_ROLE,
        adminRoles: [...ADMIN_ROLES],
        roles: ROLES,
      }),
      // MUST be last (Better Auth requirement): makes auth.api calls set
      // cookies correctly from Route Handlers, with Secure only over HTTPS.
      nextCookies(),
    ],
    rateLimit: {
      // Anti-spam backstop per IP. In development Better Auth disables rate
      // limiting by default, so integration tests are unaffected.
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 5 },
      },
    },
    ...(config.auth.trustedProxies.length > 0
      ? { advanced: { ipAddress: { trustedProxies: config.auth.trustedProxies } } }
      : {}),
  });
}

/** Singleton: Pool and env are fixed at boot in every runtime we use. */
export function getAuth() {
  if (!instance) instance = buildAuth();
  return instance;
}

export type Auth = ReturnType<typeof getAuth>;
