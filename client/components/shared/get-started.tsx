"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { readAccessToken } from "@/lib/api";

function resolveHref() {
  return readAccessToken() ? "/dashboard" : "/login";
}

export function useGetStartedHref() {
  const [href, setHref] = useState("/login");

  useEffect(() => {
    const syncHref = () => {
      setHref(resolveHref());
    };

    syncHref();
    window.addEventListener("storage", syncHref);
    window.addEventListener("focus", syncHref);

    return () => {
      window.removeEventListener("storage", syncHref);
      window.removeEventListener("focus", syncHref);
    };
  }, []);

  return href;
}

type GetStartedButtonProps = {
  children?: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
};

export function GetStartedButton({
  children = "Get started",
  className,
  variant = "primary",
}: GetStartedButtonProps) {
  const href = useGetStartedHref();

  return (
    <ButtonLink href={href} variant={variant} className={className}>
      {children}
    </ButtonLink>
  );
}

type GetStartedLinkProps = {
  children?: ReactNode;
  className?: string;
};

export function GetStartedLink({
  children = "Get started",
  className,
}: GetStartedLinkProps) {
  const href = useGetStartedHref();

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
