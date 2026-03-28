"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import { CodeBlock } from "@/components/docs/code-block";
import {
  docsCategories,
  docsPages,
  getDocsCategoryForPage,
  getDocsPage,
  getDocsPages,
  isDocsCategoryId,
  type DocsCategoryId,
  type DocsPage,
  type DocsReference,
} from "@/content/docs";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

type SidebarGroup = {
  label: string;
  pages: DocsPage[];
};

const defaultCategory: DocsCategoryId = "api";
const defaultPageId =
  getDocsPage("guide-quickstart")?.id ?? getDocsPages(defaultCategory)[0]?.id ?? "";

function getReferenceBadgeClassName(label: string) {
  const normalized = label.toUpperCase();

  if (normalized === "GET") {
    return "bg-[#dff6d1] text-[#0c4a27]";
  }

  if (normalized === "POST") {
    return "bg-[#d9eefb] text-[#0d4b6d]";
  }

  if (normalized === "PATCH") {
    return "bg-[#fff0c9] text-[#8a5a02]";
  }

  if (normalized === "DELETE") {
    return "bg-[#ffd9d2] text-[#8f2612]";
  }

  return "bg-black/6 text-[color:var(--brand)]";
}

function matchesSearch(page: DocsPage, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    page.group,
    page.navTitle,
    page.title,
    page.description,
    ...page.sections.flatMap((section) => [
      ...(section.samples?.flatMap((sample) => [
        sample.label,
        sample.filename ?? "",
        sample.code,
      ]) ??
        []),
      section.title,
      ...section.paragraphs,
      ...(section.bullets ?? []),
      ...(section.steps ?? []),
      ...(section.note ? [section.note] : []),
      ...(section.references?.flatMap((reference) => [
        reference.label,
        reference.value,
        reference.detail,
      ]) ?? []),
      ...(section.sample
        ? [section.sample.label, section.sample.filename ?? "", section.sample.code]
        : []),
    ]),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function buildSidebarGroups(pages: DocsPage[], query: string) {
  const groups = new Map<string, DocsPage[]>();

  for (const page of pages) {
    if (!matchesSearch(page, query)) {
      continue;
    }

    const existingPages = groups.get(page.group) ?? [];
    existingPages.push(page);
    groups.set(page.group, existingPages);
  }

  return [...groups.entries()].map(([label, groupedPages]) => ({
    label,
    pages: groupedPages,
  })) satisfies SidebarGroup[];
}

function renderInlineCode(text: string) {
  const parts = text.split(/(`[^`]+`)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={`${part}-${index}`}
          className="docs-inline-code rounded-md border border-black/8 bg-black/[0.045] px-1.5 py-0.5 font-mono text-[0.92em] text-[color:var(--ink)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function ReferenceCard({ reference }: { reference: DocsReference }) {
  return (
    <div className="docs-card rounded-[1.25rem] border border-black/6 bg-white/82 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
            getReferenceBadgeClassName(reference.label),
          )}
        >
          {reference.label}
        </span>

        <div className="min-w-0 flex-1">
          <p className="break-words font-mono text-[13px] font-semibold leading-6 text-[color:var(--ink)]">
            {reference.value}
          </p>
          <p className="mt-1 text-sm leading-6 text-[color:var(--muted)]">
            {renderInlineCode(reference.detail)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn(
        "h-4 w-4 shrink-0 text-[color:var(--muted)] transition-transform duration-200",
        open && "rotate-90",
      )}
    >
      <path
        d="M6 4L10 8L6 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DocsPageClient() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedPage, setCopiedPage] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [expandedStepSections, setExpandedStepSections] = useState<
    Record<string, boolean>
  >({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const observerPausedUntil = useRef(0);

  const requestedPage = getDocsPage(searchParams.get("page"));
  const requestedCategory = searchParams.get("category");
  const pageCategory = getDocsCategoryForPage(searchParams.get("page"));
  const selectedCategory =
    pageCategory ??
    (isDocsCategoryId(requestedCategory) ? requestedCategory : defaultCategory);
  const pagesInCategory = getDocsPages(selectedCategory);
  const selectedPage =
    requestedPage && requestedPage.category === selectedCategory
      ? requestedPage
      : (pagesInCategory[0] ?? getDocsPage(defaultPageId));

  const isSearching = searchQuery.trim().length > 0;
  const sidebarGroups = buildSidebarGroups(
    isSearching ? docsPages : pagesInCategory,
    searchQuery
  );

  useEffect(() => {
    if (!selectedPage) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    let hasChanged = false;

    if (nextParams.get("category") !== selectedPage.category) {
      nextParams.set("category", selectedPage.category);
      hasChanged = true;
    }

    if (nextParams.get("page") !== selectedPage.id) {
      nextParams.set("page", selectedPage.id);
      hasChanged = true;
    }

    if (!hasChanged) {
      return;
    }

    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, selectedPage]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleShortcut);

    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!selectedPage) {
      return;
    }

    const syncHash = () => {
      const hash = window.location.hash.replace(/^#/, "");

      if (selectedPage.sections.some((section) => section.id === hash)) {
        setActiveSectionId(hash);
        return;
      }

      setActiveSectionId(selectedPage.sections[0]?.id ?? "");
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => window.removeEventListener("hashchange", syncHash);
  }, [selectedPage]);

  useEffect(() => {
    if (!selectedPage) {
      return;
    }

    const handleScroll = () => {
      if (Date.now() < observerPausedUntil.current) {
        return;
      }

      const scrollY = window.scrollY + 120;
      let current = selectedPage.sections[0]?.id ?? "";

      for (const section of selectedPage.sections) {
        const el = document.getElementById(section.id);
        if (el && el.offsetTop <= scrollY) {
          current = section.id;
        }
      }

      setActiveSectionId(current);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, [selectedPage]);

  function navigateToPage(pageId: string, clearSearch = false) {
    const page = getDocsPage(pageId);

    if (!page) {
      return;
    }

    if (clearSearch) {
      setSearchQuery("");
    }

    setMobileNavOpen(false);
    router.replace(`${pathname}?category=${page.category}&page=${page.id}`, {
      scroll: false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCategoryChange(category: DocsCategoryId) {
    const nextPage = getDocsPages(category)[0];

    if (!nextPage) {
      return;
    }

    navigateToPage(nextPage.id, true);
  }

  async function handleCopyPage() {
    if (!selectedPage) {
      return;
    }

    try {
      const url = `${window.location.origin}${pathname}?category=${selectedPage.category}&page=${selectedPage.id}`;
      await navigator.clipboard.writeText(url);
      setCopiedPage(true);
      window.setTimeout(() => setCopiedPage(false), 1800);
    } catch {
      setCopiedPage(false);
    }
  }

  function toggleSectionSteps(sectionId: string) {
    setExpandedStepSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  function toggleGroup(groupLabel: string) {
    setCollapsedGroups((current) => ({
      ...current,
      [groupLabel]: !current[groupLabel],
    }));
  }

  function handleSearchSubmit() {
    const firstMatch = sidebarGroups[0]?.pages[0];

    if (!firstMatch) {
      return;
    }

    navigateToPage(firstMatch.id, true);
  }

  if (!selectedPage) {
    return null;
  }

  return (
    <div className={cn("min-h-screen", darkMode ? "docs-dark bg-[#111111]" : "bg-white")}>
      <div className={cn("lg:hidden sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 backdrop-blur-xl", darkMode ? "border-white/8 bg-[#111111]/98" : "border-black/6 bg-white/98")}>
        <Link href="/" aria-label="Renew home">
          <Logo size="compact" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="rounded-lg p-2 text-[color:var(--muted)] hover:bg-black/4"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            {mobileNavOpen ? (
              <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            ) : (
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            )}
          </svg>
        </button>
      </div>

      <div
        className={cn(
          "grid",
          sidebarCollapsed
            ? "lg:grid-cols-[minmax(0,1fr)_14rem] xl:grid-cols-[minmax(0,1fr)_15rem]"
            : "lg:grid-cols-[16rem_minmax(0,1fr)_14rem] xl:grid-cols-[18rem_minmax(0,1fr)_15rem]",
        )}
      >
        <aside
          className={cn(
            cn("fixed inset-y-0 left-0 z-20 w-[18rem] overflow-y-auto border-r lg:sticky lg:top-0 lg:z-auto lg:h-screen", darkMode ? "border-white/8 bg-[#161616]" : "border-black/6 bg-white"),
            mobileNavOpen ? "block" : "hidden lg:block",
            sidebarCollapsed && "lg:hidden",
          )}
        >
          <div className="flex h-full flex-col px-5 pb-6">
            <div className={cn("sticky top-0 z-10 pb-2 pt-6", darkMode ? "bg-[#161616]" : "bg-white")}>
              <div className="hidden lg:flex items-center justify-between">
                <Link href="/" aria-label="Renew home">
                  <Logo size="compact" />
                </Link>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  className="rounded-md p-1.5 text-[color:var(--muted)] transition-colors hover:bg-black/4 hover:text-[color:var(--ink)]"
                  aria-label="Collapse sidebar"
                >
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                    <rect x="1" y="1" width="14" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
                    <line x1="6" y1="1" x2="6" y2="15" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                </button>
              </div>

              <div className="relative mt-5">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted)]"
                  fill="none"
                >
                  <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M13 13L16.5 16.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleSearchSubmit();
                    }
                  }}
                  type="search"
                  placeholder="Search..."
                  className="h-9 w-full rounded-lg border border-black/8 bg-black/[0.02] pl-9 pr-14 text-[13px] text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus:border-[#0c4a27]/25 focus:bg-white"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-black/8 bg-white px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--muted)]">
                  ⌘K
                </span>
              </div>

              <div className={cn("mt-4 flex gap-1 rounded-lg border p-1", darkMode ? "border-white/10 bg-white/[0.04]" : "border-black/6 bg-black/[0.02]")}>
                {docsCategories.map((category) => {
                  const isActive = category.id === selectedCategory;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => handleCategoryChange(category.id)}
                      className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all",
                        isActive
                          ? darkMode ? "bg-white/10 text-[color:var(--ink)] shadow-sm" : "bg-white text-[color:var(--ink)] shadow-sm"
                          : "text-[color:var(--muted)] hover:text-[color:var(--ink)]",
                      )}
                    >
                      {category.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <nav className="mt-4 flex-1 space-y-1">
              {sidebarGroups.length === 0 ? (
                <p className="px-2 py-4 text-[13px] text-[color:var(--muted)]">
                  No results found.
                </p>
              ) : (
                sidebarGroups.map((group) => {
                  const isCollapsed = collapsedGroups[group.label] ?? false;
                  return (
                    <div key={group.label}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.label)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)]"
                      >
                        <ChevronIcon open={!isCollapsed} />
                        {group.label}
                      </button>
                      {!isCollapsed && (
                        <div className="ml-3 space-y-0.5 border-l border-black/6 pl-3">
                          {group.pages.map((page) => {
                            const isActive = page.id === selectedPage.id;
                            return (
                              <button
                                key={page.id}
                                type="button"
                                onClick={() => navigateToPage(page.id, true)}
                                className={cn(
                                  "block w-full rounded-md px-3 py-1.5 text-left text-[13px] transition-colors",
                                  isActive
                                    ? "bg-[#0c4a27]/8 font-semibold text-[color:var(--ink)]"
                                    : "text-[color:var(--muted)] hover:bg-black/[0.03] hover:text-[color:var(--ink)]",
                                )}
                              >
                                {page.navTitle}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </nav>

            <div className="mt-auto border-t border-black/6 pt-4">
              <div className="flex items-center justify-between px-2">
                <a
                  href="mailto:hello@renew.sh"
                  className="rounded-md p-1.5 text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)]"
                  aria-label="Support"
                >
                  <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M5.5 6.5a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <circle cx="8" cy="12" r="0.75" fill="currentColor" />
                  </svg>
                </a>

                <div className={cn(
                  "flex items-center rounded-full border p-0.5",
                  darkMode ? "border-white/12 bg-white/6" : "border-black/10 bg-black/[0.03]",
                )}>
                  <button
                    type="button"
                    onClick={() => setDarkMode(false)}
                    className={cn(
                      "rounded-full p-1.5 transition-colors",
                      !darkMode ? "bg-white text-[#7c6ae8] shadow-sm" : "text-[color:var(--muted)] hover:text-[color:var(--ink)]",
                    )}
                    aria-label="Light mode"
                  >
                    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M8 2V3M8 13V14M2 8H3M13 8H14M4.2 4.2L4.9 4.9M11.1 11.1L11.8 11.8M11.8 4.2L11.1 4.9M4.9 11.1L4.2 11.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDarkMode(true)}
                    className={cn(
                      "rounded-full p-1.5 transition-colors",
                      darkMode ? "bg-[#2a2a2a] text-white shadow-sm" : "text-[color:var(--muted)] hover:text-[color:var(--ink)]",
                    )}
                    aria-label="Dark mode"
                  >
                    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                      <path d="M13.5 9.5a5.5 5.5 0 01-7-7 5.5 5.5 0 107 7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-10 bg-black/20 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <main className="min-h-screen border-r border-black/0 lg:border-black/6">
          {sidebarCollapsed && (
            <div className={cn("hidden lg:block sticky top-0 z-10 border-b px-4 py-2.5 backdrop-blur-xl", darkMode ? "border-white/8 bg-[#111111]/98" : "border-black/6 bg-white/98")}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  className="rounded-md p-1.5 text-[color:var(--muted)] transition-colors hover:bg-black/4 hover:text-[color:var(--ink)]"
                  aria-label="Expand sidebar"
                >
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                    <rect x="1" y="1" width="14" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
                    <line x1="6" y1="1" x2="6" y2="15" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                </button>
                <Link href="/" aria-label="Renew home">
                  <Logo size="compact" />
                </Link>
              </div>
            </div>
          )}
          <article className="px-5 py-6 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
            <div className="border-b border-black/6 pb-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h1 className="max-w-[16ch] font-display text-[clamp(2rem,4vw,3rem)] leading-[1] tracking-[-0.05em] text-[color:var(--ink)]">
                    {selectedPage.title}
                  </h1>
                  <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[color:var(--muted)]">
                    {selectedPage.description}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCopyPage}
                    className="docs-btn inline-flex items-center justify-center rounded-full border border-black/8 bg-white/88 px-4 py-2 text-[13px] font-semibold tracking-[-0.02em] text-[color:var(--ink)] transition-colors hover:bg-white"
                  >
                    {copiedPage ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-10">
              {selectedPage.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  {(() => {
                    const stepCount = section.steps?.length ?? 0;
                    const collapsedStepCount = Math.ceil(stepCount / 2);
                    const isExpanded = expandedStepSections[section.id] ?? false;
                    const canToggleSteps = stepCount > collapsedStepCount;
                    const visibleSteps =
                      section.steps && canToggleSteps && !isExpanded
                        ? section.steps.slice(0, collapsedStepCount)
                        : section.steps;

                    return (
                      <>
                        <h2 className="text-[1.5rem] font-semibold leading-[1.1] tracking-[-0.04em] text-[color:var(--ink)] sm:text-[1.75rem]">
                          {section.title}
                        </h2>

                        <div className="mt-4 space-y-4">
                          {section.paragraphs.map((paragraph) => (
                            <p
                              key={`${section.id}-${paragraph}`}
                              className="max-w-3xl text-[15px] leading-7 text-[color:var(--muted)]"
                            >
                              {renderInlineCode(paragraph)}
                            </p>
                          ))}
                        </div>

                        {section.bullets?.length ? (
                          <ul className="mt-5 grid gap-2">
                            {section.bullets.map((bullet) => (
                              <li
                                key={`${section.id}-${bullet}`}
                                className="docs-card-alt flex items-start gap-3 rounded-lg border border-black/6 bg-black/[0.015] px-4 py-3"
                              >
                                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#0c4a27]" />
                                <span className="text-[14px] leading-6 text-[color:var(--ink)]">
                                  {renderInlineCode(bullet)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {visibleSteps?.length ? (
                          <ol className="mt-5 space-y-2">
                            {visibleSteps.map((step, index) => (
                              <li
                                key={`${section.id}-${step}`}
                                className="docs-card-alt flex items-start gap-3 rounded-lg border border-black/6 bg-black/[0.015] px-4 py-3"
                              >
                                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0c4a27] text-[11px] font-semibold text-white">
                                  {index + 1}
                                </span>
                                <span className="pt-0.5 text-[14px] leading-6 text-[color:var(--ink)]">
                                  {renderInlineCode(step)}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : null}

                        {canToggleSteps ? (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => toggleSectionSteps(section.id)}
                              className="docs-btn inline-flex items-center rounded-lg border border-black/8 bg-white px-3 py-1.5 text-[13px] font-semibold text-[color:var(--ink)] transition-colors hover:bg-black/[0.02]"
                            >
                              {isExpanded ? "Show less" : "View all"}
                            </button>
                          </div>
                        ) : null}

                        {section.note ? (
                          <div className="docs-note mt-5 rounded-lg border border-[#0c4a27]/10 bg-[#0c4a27]/[0.04] px-4 py-3">
                            <p className="text-[14px] leading-6 text-[color:var(--ink)]">
                              {renderInlineCode(section.note)}
                            </p>
                          </div>
                        ) : null}

                        {section.references?.length ? (
                          <div className="mt-5 grid gap-3 xl:grid-cols-2">
                            {section.references.map((reference) => (
                              <ReferenceCard
                                key={`${section.id}-${reference.label}-${reference.value}`}
                                reference={reference}
                              />
                            ))}
                          </div>
                        ) : null}

                        {section.samples?.length ? (
                          <div className="mt-6 space-y-4">
                            {section.samples.map((sample) => (
                              <div
                                key={`${section.id}-${sample.label}-${sample.filename ?? "sample"}`}
                                className="space-y-2"
                              >
                                <p className="text-[13px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                                  {sample.label}
                                </p>
                                <CodeBlock
                                  label={sample.label}
                                  language={sample.language}
                                  filename={sample.filename}
                                  code={sample.code}
                                />
                              </div>
                            ))}
                          </div>
                        ) : section.sample ? (
                          <div className="mt-6 space-y-2">
                            <p className="text-[13px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                              {section.sample.label}
                            </p>
                            <CodeBlock
                              label={section.sample.label}
                              language={section.sample.language}
                              filename={section.sample.filename}
                              code={section.sample.code}
                            />
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </section>
              ))}
            </div>
          </article>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-0 max-h-screen overflow-auto px-4 pb-6 pt-8">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--ink)]">
              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 text-[color:var(--muted)]">
                <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              On this page
            </div>
            <div className="mt-3 space-y-0.5 border-l border-black/6 pl-3">
              {selectedPage.sections.map((section) => {
                const isActive = section.id === activeSectionId;

                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    onClick={() => {
                      observerPausedUntil.current = Date.now() + 1000;
                      setActiveSectionId(section.id);
                    }}
                    className={cn(
                      "block rounded-md px-2.5 py-1.5 text-[13px] leading-5 transition-colors",
                      isActive
                        ? "bg-[#0c4a27]/8 font-medium text-[color:var(--ink)]"
                        : "text-[color:var(--muted)] hover:text-[color:var(--ink)]",
                    )}
                  >
                    {section.title}
                  </a>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
