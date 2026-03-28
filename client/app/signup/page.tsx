"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PrivySessionCard } from "@/components/auth/privy-session-card";
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f9fc] px-4">
      <div className="w-full max-w-[26rem]">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" aria-label="Renew home">
            <Logo />
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-[#6b7280] transition-colors hover:text-[#111111]"
          >
            Sign in
          </Link>
        </div>
        <PrivySessionCard mode="signup" nextPath={nextPath} />
      </div>
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
