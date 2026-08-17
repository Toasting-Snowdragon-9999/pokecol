import { createContext, useContext } from "react";
import type { AuthMode, Credentials, Session, SignUpDetails, User } from "./types";

export interface SessionContextValue {
  user: User | null;
  /** True until the stored session has been checked, so the header can hold still. */
  loading: boolean;
  /** What kind of account this build offers — see `AuthMode`. */
  mode: AuthMode;
  signIn: (credentials: Credentials) => Promise<Session>;
  signUp: (details: SignUpDetails) => Promise<Session>;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
