// The verified caller, attached to the request by server/middleware/require-auth.ts.
export type AuthUser = {
  id: string
  email: string | null
  // True only when Supabase has confirmed the email (always the case for Google
  // sign-in). Invitation claiming trusts the email only when this is true.
  emailVerified: boolean
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser
    }
  }
}
