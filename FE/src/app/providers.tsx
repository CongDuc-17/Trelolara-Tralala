import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { createQueryClient } from "./queryClient";
import { ThemeProvider } from "next-themes";
import { I18nextProvider } from "react-i18next";
import i18n, { THEME_STORAGE_KEY } from "./i18n";
import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <I18nextProvider i18n={i18n}><ThemeProvider attribute="class" storageKey={THEME_STORAGE_KEY} defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={client}><SessionProvider>{children}</SessionProvider></QueryClientProvider>
    <Toaster position="top-right" />
  </ThemeProvider></I18nextProvider>;
}
