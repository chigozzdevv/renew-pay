import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

type FooterProps = {
  className?: string;
  tone?: "default" | "hero";
};

export function Footer({ className, tone = "default" }: FooterProps = {}) {
  return (
    <footer
      className={cn(
        tone === "hero" ? "bg-[#e8f5e9]" : "bg-[#f7f9fc]",
        "pb-6 pt-2",
        className
      )}
    >
      <Container>
        <div className="flex items-center justify-between border-t border-black/6 pt-4">
          <div className="flex items-center gap-2.5">
            <Logo size="compact" />
            <span className="text-sm text-[#6b7280]">
              | &copy; {new Date().getFullYear()} Renew
            </span>
          </div>

          <Link
            href="https://x.com/renew_sh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6b7280] transition-colors hover:text-[#111111]"
            aria-label="Follow Renew on X"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-[18px] w-[18px]"
              aria-hidden="true"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </Link>
        </div>
      </Container>
    </footer>
  );
}
