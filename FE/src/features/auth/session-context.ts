import { createContext, useContext } from "react";
import type { User } from "./types";
import type { LoginInput } from "./api";

export type Session = {
  user: User | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  error: unknown;
  retry: () => void;
  startSession: () => void;
  login: (credentials: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  getMyInformation: () => Promise<void>;
};
export const SessionContext = createContext<Session | null>(null);
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession requires AppProviders");
  return session;
}
