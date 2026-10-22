import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { createQueryClient } from "./queryClient";

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}><SessionProvider>{children}</SessionProvider></QueryClientProvider>;
}
