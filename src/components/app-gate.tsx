"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/store";
import { AuthScreen } from "@/components/auth/auth-screen";
import { OnboardingScreen } from "@/components/auth/onboarding-screen";
import { AppShell } from "@/components/app-shell";
import { applyTheme, getStoredTheme } from "@/lib/theme";

export function AppGate() {
  const { session, loading, reloadSession } = useStore();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  if (loading) {
    return <div className="boot-screen"><span className="boot-spinner" /><p>Carregando sua agenda...</p></div>;
  }

  if (!session) {
    return <AuthScreen onAuthenticated={(needs) => setNeedsOnboarding(needs)} />;
  }

  if (needsOnboarding || !session.company?.onboarded) {
    return <OnboardingScreen onComplete={async () => { await reloadSession(); setNeedsOnboarding(false); }} />;
  }

  return <AppShell />;
}
