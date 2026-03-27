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
          className="rounded-md border border-black/8 bg-black/[0.045] px-1.5 py-0.5 font-mono text-[0.92em] text-[color:var(--ink)]"
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
    <div className="rounded-[1.25rem] border border-black/6 bg-white/82 p-4">
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

    const elements = selectedPage.sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextActive = entries
          .filter((entry) => entry.isIntersecting)
          .sort((entryA, entryB) => entryB.intersectionRatio - entryA.intersectionRatio)[0];

        if (!nextActive) {
          return;
        }

        setActiveSectionId(nextActive.target.id);
      },
      {
        rootMargin: "-18% 0px -60% 0px",
        threshold: [0.18, 0.35, 0.55, 0.8],
      },
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [selectedPage]);

  function navigateToPage(pageId: string, clearSearch = false) {
    const page = getDocsPage(pageId);

    if (!page) {
      return;
    }

    if (clearSearch) {
      setSearchQuery("");
    }

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
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#ffffff_78%,#fbfcfa_100%)]">
      <div className="sticky top-0 z-20 border-b border-black/6 bg-[rgba(255,255,255,0.98)] backdrop-blur-xl">
        <div className="px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                aria-label="Renew home"
                className="inline-flex items-center gap-3"
              >
                <Logo />
                <span className="rounded-full border border-black/6 bg-white/88 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--brand)]">
                  Docs
                </span>
              </Link>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 sm:w-[24rem] lg:w-[29rem]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]"
                  fill="none"
                >
                  <circle
                    cx="9"
                    cy="9"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M13 13L16.5 16.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
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
                  placeholder="Search guides, APIs, and SDK..."
                  className="h-12 w-full rounded-[1.05rem] border border-black/8 bg-white/88 pl-11 pr-16 text-sm text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus:border-[#0c4a27]/25"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-black/6 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                  Cmd/Ctrl K
                </span>
              </div>

              <a
                href="mailto:hello@renew.sh"
                className="px-1 text-sm font-semibold tracking-[-0.02em] text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)]"
              >
                Support
              </a>

              <button
                type="button"
                onClick={() => navigateToPage(defaultPageId, true)}
                className="inline-flex items-center justify-center rounded-full bg-[#0c4a27] px-5 py-3 text-sm font-semibold tracking-[-0.02em] text-[#d9f6bc] transition-colors hover:bg-[#093a1e]"
              >
                Quickstart
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-6 overflow-x-auto border-t border-black/6 pt-3 lg:pl-[2.75rem]">
            {docsCategories.map((category) => {
              const isActive = category.id === selectedCategory;

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleCategoryChange(category.id)}
                  className={cn(
                    "relative whitespace-nowrap pb-3 text-sm font-semibold tracking-[-0.02em] transition-colors",
                    isActive
                      ? "text-[color:var(--ink)]"
                      : "text-[color:var(--muted)] hover:text-[color:var(--ink)]",
                  )}
                >
                  {category.label}
                  <span
                    className={cn(
                      "absolute inset-x-0 bottom-0 h-[2px] rounded-full transition-opacity",
                      isActive
                        ? "bg-[#0c4a27] opacity-100"
                        : "bg-transparent opacity-0",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[18rem_minmax(0,1fr)_16rem]">
        <aside className="border-b border-black/6 lg:border-b-0 lg:border-r lg:border-black/6">
          <div className="px-4 pb-5 pt-8 sm:px-6 lg:pb-5 lg:pt-8 lg:sticky lg:top-[7.75rem] lg:max-h-[calc(100vh-8.5rem)] lg:overflow-auto">
            {sidebarGroups.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-black/8 bg-white/70 px-4 py-5">
                <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                  No matches
                </p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                  Try a different search term or switch to another docs section.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {sidebarGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--brand)]">
                      {group.label}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {group.pages.map((page) => {
                        const isActive = page.id === selectedPage.id;

                        return (
                          <button
                            key={page.id}
                            type="button"
                            onClick={() => navigateToPage(page.id, true)}
                            className={cn(
                              "block w-full rounded-[1rem] border px-4 py-3 text-left transition-colors",
                              isActive
                                ? "border-[#0c4a27]/12 bg-[#0c4a27]/8"
                                : "border-transparent hover:border-black/6 hover:bg-white/70",
                            )}
                          >
                            <p
                              className={cn(
                                "text-sm font-semibold leading-5 tracking-[-0.02em]",
                                isActive
                                  ? "text-[color:var(--ink)]"
                                  : "text-[color:var(--muted)]",
                              )}
                            >
                              {page.navTitle}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="border-b border-black/6 lg:border-b-0 lg:border-r lg:border-black/6">
          <article className="px-5 py-6 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
            <div className="border-b border-black/6 pb-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--brand)]">
                    <span>{selectedPage.group}</span>
                  </div>
                  <h1 className="mt-4 max-w-[16ch] font-display text-[clamp(2.8rem,5vw,4.6rem)] leading-[0.94] tracking-[-0.08em] text-[color:var(--ink)]">
                    {selectedPage.title}
                  </h1>
                  <p className="mt-4 max-w-3xl text-base leading-8 text-[color:var(--muted)] sm:text-lg">
                    {selectedPage.description}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCopyPage}
                    className="inline-flex items-center justify-center rounded-full border border-black/8 bg-white/88 px-4 py-2.5 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)] transition-colors hover:bg-white"
                  >
                    {copiedPage ? "Copied" : "Copy page"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-10">
              {selectedPage.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-40">
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
                        <h2 className="text-[1.85rem] font-semibold leading-[1.02] tracking-[-0.05em] text-[color:var(--ink)] sm:text-[2.2rem]">
                          {section.title}
                        </h2>

                        <div className="mt-4 space-y-4">
                          {section.paragraphs.map((paragraph) => (
                            <p
                              key={`${section.id}-${paragraph}`}
                              className="max-w-3xl text-sm leading-7 text-[color:var(--muted)] sm:text-[15px]"
                            >
                              {renderInlineCode(paragraph)}
                            </p>
                          ))}
                        </div>

                        {section.bullets?.length ? (
                          <ul className="mt-5 grid gap-3">
                            {section.bullets.map((bullet) => (
                              <li
                                key={`${section.id}-${bullet}`}
                                className="flex items-start gap-3 rounded-[1.1rem] border border-black/6 bg-white/76 px-4 py-3"
                              >
                                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0c4a27]" />
                                <span className="text-sm leading-6 text-[color:var(--ink)]">
                                  {renderInlineCode(bullet)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {visibleSteps?.length ? (
                          <ol className="mt-5 space-y-3">
                            {visibleSteps.map((step, index) => (
                              <li
                                key={`${section.id}-${step}`}
                                className="flex items-start gap-4 rounded-[1.1rem] border border-black/6 bg-white/76 px-4 py-3"
                              >
                                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0c4a27] text-xs font-semibold text-white">
                                  {index + 1}
                                </span>
                                <span className="pt-0.5 text-sm leading-6 text-[color:var(--ink)]">
                                  {renderInlineCode(step)}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : null}

                        {canToggleSteps ? (
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={() => toggleSectionSteps(section.id)}
                              className="inline-flex items-center rounded-full border border-black/8 bg-white/88 px-4 py-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)] transition-colors hover:bg-white"
                            >
                              {isExpanded ? "Show less" : "View all"}
                            </button>
                          </div>
                        ) : null}

                        {section.note ? (
                          <div className="mt-5 rounded-[1.2rem] border border-[#0c4a27]/10 bg-[#0c4a27]/8 px-4 py-3">
                            <p className="text-sm leading-6 text-[color:var(--ink)]">
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
                                <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
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
                            <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
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
          <div className="sticky top-[7.75rem] max-h-[calc(100vh-8.5rem)] overflow-auto px-4 pb-5 pt-8 lg:pb-5 lg:pt-8">
            <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
              On this page
            </p>
            <div className="mt-4 space-y-1.5">
              {selectedPage.sections.map((section) => {
                const isActive = section.id === activeSectionId;

                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={cn(
                      "block rounded-[0.95rem] px-3 py-2 text-sm leading-5 transition-colors",
                      isActive
                        ? "bg-[#0c4a27]/8 text-[color:var(--ink)]"
                        : "text-[color:var(--muted)] hover:bg-white/70 hover:text-[color:var(--ink)]",
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
