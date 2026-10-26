import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { CanceledError } from "axios";
import { getSessionVersion, onSessionExpired, resetApiSession } from "@/lib/apiClient";
import { getMyInformation as fetchMyInformation } from "@/features/profile/api";
import { login as loginRequest, logout as logoutRequest, type LoginInput } from "./api";
import { SessionContext } from "./session-context";

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const location = useLocation();
  const [version, setVersion] = useState(getSessionVersion);
  const [expired, setExpired] = useState(false);
  const [isLoggingOut, setLoggingOut] = useState(false);
  const lastUserId = useRef<string | null>(null);
  const logoutPromise = useRef<Promise<void> | null>(null);
  const requiresSession = /^\/(dashboard|projects|boards|my-work|archived|me|invite)(\/|$)/i.test(location.pathname);

  const clearClientState = useCallback((isExpired: boolean) => {
    void client.cancelQueries();
    client.clear();
    lastUserId.current = null;
    logoutPromise.current = null;
    setLoggingOut(false);
    setExpired(isExpired);
    setVersion(getSessionVersion());
  }, [client]);

  const startSession = useCallback(() => {
    resetApiSession();
    clearClientState(false);
  }, [clearClientState]);

  useEffect(() => onSessionExpired(() => clearClientState(true)), [clearClientState]);

  const me = useQuery({
    queryKey: ["session", version, "me"],
    enabled: requiresSession && !expired,
    retry: false,
    queryFn: async ({ signal }) => {
      const user = await fetchMyInformation(signal);
      if (signal.aborted || version !== getSessionVersion()) throw new CanceledError();
      if (lastUserId.current && lastUserId.current !== user.id) {
        startSession();
        throw new CanceledError("Account changed; reload its own scope");
      }
      lastUserId.current = user.id;
      return user;
    },
  });

  async function login(credentials: LoginInput) {
    startSession();
    const version = getSessionVersion();
    await loginRequest(credentials);
    if (version !== getSessionVersion()) throw new CanceledError();
  }

  function logout() {
    if (logoutPromise.current) return logoutPromise.current;
    setLoggingOut(true);
    const version = getSessionVersion();
    const pending = logoutRequest().then(() => {
      if (version !== getSessionVersion()) throw new CanceledError();
      resetApiSession();
      clearClientState(true);
    }).finally(() => {
      if (logoutPromise.current === pending) {
        logoutPromise.current = null;
        setLoggingOut(false);
      }
    });
    logoutPromise.current = pending;
    return pending;
  }

  async function getMyInformation() {
    const result = await me.refetch();
    if (result.error) throw result.error;
  }

  return <SessionContext.Provider value={{
    user: expired ? null : me.data ?? null,
    isLoading: requiresSession && !expired && me.isPending,
    isLoggingOut,
    error: expired ? null : me.error,
    retry: () => { void me.refetch(); },
    startSession, login, logout, getMyInformation,
  }}>{children}</SessionContext.Provider>;
}
