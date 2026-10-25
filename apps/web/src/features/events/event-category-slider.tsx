"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function EventCategorySlider({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  function updateScrollControls() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setCanScrollBack(viewport.scrollLeft > 1);
    setCanScrollForward(viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1);
  }

  useEffect(() => {
    const observer = new ResizeObserver(updateScrollControls);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  function scrollCategories(direction: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({
      left: direction * viewport.clientWidth * 0.8,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <div className="-mx-5 mb-4 flex min-w-0 items-center gap-2 md:mx-0 md:mb-6" role="group" aria-label="Event categories">
      <button
        type="button"
        className="hidden size-8 shrink-0 items-center justify-center rounded-full border border-line/8 bg-surface text-ink transition disabled:opacity-30 md:inline-flex"
        aria-label="Previous categories"
        disabled={!canScrollBack}
        onClick={() => scrollCategories(-1)}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <div ref={viewportRef} className="min-w-0 flex-1 overflow-x-auto px-5 pb-1 md:px-1" onScroll={updateScrollControls}>
        <div ref={contentRef} className="flex w-max min-w-full gap-5 py-1 md:gap-2">
          {children}
        </div>
      </div>
      <button
        type="button"
        className="hidden size-8 shrink-0 items-center justify-center rounded-full border border-line/8 bg-surface text-ink transition disabled:opacity-30 md:inline-flex"
        aria-label="Next categories"
        disabled={!canScrollForward}
        onClick={() => scrollCategories(1)}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
