import Link from "next/link";

import { Container } from "@/components/ui/container";
import { GetStartedLink } from "@/components/shared/get-started";
import { Logo } from "@/components/shared/logo";

export function Footer() {
  return (
    <footer className="pb-10 pt-2 sm:pb-12">
      <Container>
        <div className="flex flex-col gap-5 border-t border-[#e5e7eb] pt-6 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Logo />
            <p className="max-w-[20ch] text-sm text-[#6b7280]">
              Local-fiat billing, USDC settlement.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 text-sm text-[#6b7280] sm:items-end">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="font-medium transition-colors hover:text-[#111111]"
              >
                Home
              </Link>
              <Link
                href="/docs"
                className="font-medium transition-colors hover:text-[#111111]"
              >
                Docs
              </Link>
              <GetStartedLink className="font-medium transition-colors hover:text-[#111111]">
                Get started
              </GetStartedLink>
            </div>
            <p>&copy; {new Date().getFullYear()} Renew</p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
