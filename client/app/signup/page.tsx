"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PrivySessionCard } from "@/components/auth/privy-session-card";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/shared/logo";

function getNextPath(value: string | null) {
  if (!value || !value.startsWith("/")) {
    return "/dashboard";
  }

  return value;
}

function SignupPageContent() {
  const searchParams = useSearchParams();
  const nextPath = getNextPath(searchParams.get("next"));

  return (
    <main className="min-h-screen bg-[color:var(--surface)] py-8 sm:py-12">
      <Container className="max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="Renew home" className="shrink-0">
            <Logo />
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-[color:var(--muted)] transition-colors hover:text-[color:var(--brand)]"
          >
            Sign in
          </Link>
        </div>

        <section className="mt-8">
          <div className="mx-auto max-w-[34rem]">
            <PrivySessionCard mode="signup" nextPath={nextPath} />
          </div>
        </section>
      </Container>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}
