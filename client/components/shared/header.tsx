"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { landingPrimaryNav, landingProductNav } from "@/lib/content";
import type { NavItem } from "@/types/marketing";
import { Container } from "@/components/ui/container";
import { useGetStartedHref } from "@/components/shared/get-started";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

type HeaderProps = {
  tone?: "default" | "hero" | "feature";
};

export function Header({ tone = "hero" }: HeaderProps = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHomeRoute = pathname === "/";
  const getStartedHref = useGetStartedHref();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const [isMobileProductsOpen, setIsMobileProductsOpen] = useState(false);
  const [activeHash, setActiveHash] = useState("");
  const lastScrollY = useRef(0);
  const productsMenuRef = useRef<HTMLDivElement | null>(null);
  const hasProductNav = landingProductNav.length > 0;
  const [firstPrimaryNavItem, ...otherPrimaryNav] = landingPrimaryNav;
  const headerSurfaceClass =
    tone === "feature" ? "bg-[#fdf1e7]" : tone === "default" ? "bg-[#f7f9fc]" : "bg-[#e8f5e9]";
  const floatingShellClass =
    tone === "feature"
      ? "-mx-3 rounded-2xl bg-[rgba(255,248,240,0.88)] px-3 shadow-[0_2px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:-mx-4 sm:px-4"
      : "-mx-3 rounded-2xl bg-white/70 px-3 shadow-[0_2px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:-mx-4 sm:px-4";
  const panelSurfaceClass =
    tone === "feature" ? "border-[#ead8c7] bg-[#fff8f1]" : "border-[#e5e7eb] bg-white";
  const panelBorderClass = tone === "feature" ? "border-[#ead8c7]" : "border-[#e5e7eb]";
  const panelActiveClass =
    tone === "feature" ? "bg-[#f4e3d5] text-[#1f1a16]" : "bg-[#f3f4f6] text-[#1f1a16]";
  const panelHoverClass =
    tone === "feature"
      ? "text-[#4b5563] hover:bg-[#f8ebdf] hover:text-[#1f1a16]"
      : "text-[#4b5563] hover:bg-[#f9fafb] hover:text-[#1f1a16]";
  const menuButtonHoverClass =
    tone === "feature" ? "hover:bg-[#f6e6d8] hover:text-[#111111]" : "hover:bg-[#f3f4f6] hover:text-[#111111]";

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY.current;

      setIsScrolled(currentScrollY > 12);

      if (currentScrollY <= 12) {
        setIsVisible(true);
      } else if (Math.abs(delta) > 4) {
        setIsVisible(delta < 0);
      }

      lastScrollY.current = currentScrollY;
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsProductsOpen(false);
    setIsMobileProductsOpen(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMenuOpen(false);
        setIsMobileProductsOpen(false);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!productsMenuRef.current?.contains(event.target as Node)) {
        setIsProductsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const syncHash = () => {
      setActiveHash(window.location.hash);
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => {
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  const getSectionHash = (href?: string) => {
    if (!href) return "";
    const [, hash = ""] = href.split("#");
    return hash ? `#${hash}` : "";
  };

  const isNavItemActive = (href?: string) => {
    if (!href) return false;
    if (!href.startsWith("/#")) {
      const [targetPath, queryString = ""] = href.split("?");

      if (pathname !== targetPath) return false;
      if (!queryString) return true;

      const targetParams = new URLSearchParams(queryString);

      for (const [key, value] of targetParams.entries()) {
        if (searchParams.get(key) !== value) {
          return false;
        }
      }

      return true;
    }

    const hash = getSectionHash(href);
    if (!isHomeRoute) return false;

    return activeHash === hash;
  };

  const isProductsActive = landingProductNav.some((item) => isNavItemActive(item.href));

  const renderDesktopPrimaryItem = (item: NavItem) => {
    const isActive = isNavItemActive(item.href);

    if (!item.href) {
      return (
        <span
          key={item.label}
          aria-disabled="true"
          className="cursor-default text-[15px] font-light tracking-[-0.01em] text-[#6b7280]"
        >
          {item.label}
        </span>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "text-[15px] font-light tracking-[-0.01em] transition-colors",
          isActive ? "text-[#1f1a16] border-b-2 border-[#1f1a16] pb-0.5" : "text-[#4b5563] hover:text-[#1f1a16]",
        )}
      >
        {item.label}
      </Link>
    );
  };

  const renderDesktopProductItem = (item: NavItem) => {
    const isActive = isNavItemActive(item.href);

    if (!item.href) {
      return (
        <span
          key={item.label}
          aria-disabled="true"
          className="cursor-default rounded-lg px-3 py-2.5 text-[15px] font-light tracking-[-0.01em] text-[#6b7280]"
        >
          {item.label}
        </span>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={() => setIsProductsOpen(false)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "rounded-lg px-3 py-2.5 text-[15px] font-light tracking-[-0.01em] transition-colors",
          isActive ? panelActiveClass : panelHoverClass,
        )}
      >
        {item.label}
      </Link>
    );
  };

  const renderMobilePrimaryItem = (item: NavItem) => {
    const isActive = isNavItemActive(item.href);

    if (!item.href) {
      return (
        <span
          key={item.label}
          aria-disabled="true"
          className="cursor-default rounded-lg px-3 py-2.5 text-[15px] font-light tracking-[-0.01em] text-[#6b7280]"
        >
          {item.label}
        </span>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        onClick={() => setIsMenuOpen(false)}
        className={cn(
          "rounded-lg px-3 py-2.5 text-[15px] font-light tracking-[-0.01em] transition-colors",
          isActive ? panelActiveClass : panelHoverClass,
        )}
      >
        {item.label}
      </Link>
    );
  };

  const renderMobileProductItem = (item: NavItem) => {
    const isActive = isNavItemActive(item.href);

    if (!item.href) {
      return (
        <span
          key={item.label}
          aria-disabled="true"
          className="cursor-default rounded-lg px-3 py-2.5 text-[15px] font-light tracking-[-0.01em] text-[#6b7280]"
        >
          {item.label}
        </span>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        onClick={() => {
          setIsMenuOpen(false);
          setIsMobileProductsOpen(false);
        }}
        className={cn(
          "rounded-lg px-3 py-2.5 text-[15px] font-light tracking-[-0.01em] transition-colors",
          isActive
            ? "bg-[#f3f4f6] text-[#1f1a16]"
            : "text-[#4b5563] hover:bg-[#f9fafb] hover:text-[#1f1a16]",
        )}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 py-2.5 transition-all duration-300 ease-out sm:py-3",
        !isScrolled && headerSurfaceClass,
        isVisible ? "translate-y-0" : "-translate-y-[140%]",
      )}
    >
      <Container>
        <div
          className={cn(
            "flex h-10 items-center gap-3 transition-all duration-300 sm:h-11",
            isScrolled ? floatingShellClass : "bg-transparent",
          )}
        >
          <Link href="/" aria-label="Renew home" className="shrink-0">
            <Logo size="compact" />
          </Link>

          <div className="hidden min-w-0 flex-1 justify-center lg:flex">
            <nav
              aria-label="Primary"
              className="flex min-w-0 items-center justify-center gap-7 xl:gap-8"
            >
              {firstPrimaryNavItem ? renderDesktopPrimaryItem(firstPrimaryNavItem) : null}

              {hasProductNav ? (
                <div className="relative" ref={productsMenuRef}>
                  <button
                    type="button"
                    aria-expanded={isProductsOpen}
                    onClick={() => setIsProductsOpen((current) => !current)}
                    className={cn(
                      "relative inline-flex items-center gap-1.5 text-[15px] font-light tracking-[-0.01em] transition-colors",
                      isProductsActive
                        ? "text-[#1f1a16]"
                        : "text-[#4b5563] hover:text-[#1f1a16]",
                    )}
                  >
                    Products
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 14 14"
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        isProductsOpen ? "rotate-180" : "",
                      )}
                      fill="none"
                    >
                      <path
                        d="M3.25 5.25L7 9L10.75 5.25"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  <div
                    className={cn(
                      "absolute left-1/2 top-[calc(100%+0.75rem)] w-52 -translate-x-1/2 rounded-xl border p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-200",
                      panelSurfaceClass,
                      isProductsOpen
                        ? "pointer-events-auto translate-y-0 opacity-100"
                        : "pointer-events-none -translate-y-2 opacity-0",
                    )}
                  >
                    <div className="flex flex-col">
                      {landingProductNav.map((item) => renderDesktopProductItem(item))}
                    </div>
                  </div>
                </div>
              ) : null}

              {otherPrimaryNav.map((item) => renderDesktopPrimaryItem(item))}
            </nav>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
            <Link
              href="/login"
              className="hidden text-[16px] font-normal tracking-[-0.01em] text-[#4b5563] transition-colors hover:text-[#1f1a16] md:inline"
            >
              Login
            </Link>
            <Link
              href={getStartedHref}
              className="inline-flex h-8 items-center rounded-full bg-[#111111] px-4 text-sm font-semibold tracking-[-0.02em] text-white transition-colors hover:bg-[#333333]"
              onClick={() => setIsMenuOpen(false)}
            >
              Start for free
            </Link>

            <button
              type="button"
              aria-label={isMenuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((current) => !current)}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#4b5563] transition-colors lg:hidden",
                menuButtonHoverClass,
              )}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 18 18"
                className="h-4 w-4"
                fill="none"
              >
                {isMenuOpen ? (
                  <>
                    <path
                      d="M4 4L14 14"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M14 4L4 14"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </>
                ) : (
                  <>
                    <path
                      d="M3 5.25H15"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M3 9H15"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M3 12.75H15"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        <div
          className={cn(
            "overflow-hidden transition-[max-height,margin-top,opacity] duration-300 ease-out lg:hidden",
            isMenuOpen ? "mt-1 max-h-[32rem] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <nav
            aria-label="Mobile primary"
            className={cn("rounded-xl border px-3 py-3", panelSurfaceClass)}
          >
            <div className="flex flex-col gap-0.5">
              {firstPrimaryNavItem ? renderMobilePrimaryItem(firstPrimaryNavItem) : null}

              {hasProductNav ? (
                <div className={cn("rounded-lg border px-3 py-2", panelBorderClass)}>
                  <button
                    type="button"
                    onClick={() => setIsMobileProductsOpen((current) => !current)}
                    aria-expanded={isMobileProductsOpen}
                    className={cn(
                      "flex w-full items-center justify-between py-1 text-[15px] font-light tracking-[-0.01em] transition-colors",
                      isProductsActive ? "text-[#1f1a16]" : "text-[#4b5563]",
                    )}
                  >
                    <span>Products</span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 14 14"
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        isMobileProductsOpen ? "rotate-180" : "",
                      )}
                      fill="none"
                    >
                      <path
                        d="M3.25 5.25L7 9L10.75 5.25"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  <div
                    className={cn(
                      "overflow-hidden transition-[max-height,opacity,margin-top] duration-200",
                      isMobileProductsOpen ? "mt-2 max-h-56 opacity-100" : "max-h-0 opacity-0",
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      {landingProductNav.map((item) => renderMobileProductItem(item))}
                    </div>
                  </div>
                </div>
              ) : null}

              {otherPrimaryNav.map((item) => renderMobilePrimaryItem(item))}

              <div className={cn("mt-2 border-t pt-3", panelBorderClass)}>
                <Link
                  href="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className={cn(
                    "inline-flex h-11 items-center justify-center rounded-full border text-[16px] font-normal tracking-[-0.01em] transition-colors",
                    panelBorderClass,
                    panelHoverClass,
                  )}
                >
                  Login
                </Link>
              </div>
            </div>
          </nav>
        </div>
      </Container>
    </header>
  );
}
