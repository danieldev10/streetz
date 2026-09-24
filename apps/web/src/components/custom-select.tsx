"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown } from "lucide-react";

export type CustomSelectOption<T extends string> = {
  value: T;
  label: string;
};

export function CustomSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  icon: Icon,
  placeholder = "Choose one",
  menuClassName,
}: {
  label: string;
  value: T | "";
  options: ReadonlyArray<CustomSelectOption<T>>;
  onChange: (value: T) => void;
  icon: LucideIcon;
  placeholder?: string;
  menuClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) return;

    function closeWhenClickingOutside(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", closeWhenClickingOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[selectedIndex]?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, selectedIndex]);

  function selectOption(option: CustomSelectOption<T>) {
    onChange(option.value);
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function focusOption(index: number) {
    const nextIndex = (index + options.length) % options.length;
    optionRefs.current[nextIndex]?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className={`group flex h-14 w-full min-w-0 items-center gap-2 rounded-[18px] border bg-surface px-2.5 text-left shadow-[0_2px_8px_rgba(0,0,0,0.035)] outline-none transition focus-visible:ring-2 focus-visible:ring-brand/30 ${
          isOpen ? "border-brand/50 shadow-[0_8px_24px_rgba(163,33,154,0.10)]" : "border-black/[0.07] hover:border-black/[0.14]"
        }`}
        aria-label={`${label}: ${selectedOption?.label ?? placeholder}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={`grid size-8 shrink-0 place-items-center rounded-xl transition ${isOpen ? "bg-brand-strong text-white" : "bg-brand-tint text-brand-strong"}`}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-semibold uppercase leading-3 tracking-[0.1em] text-ink-400">{label}</span>
          <span className="mt-0.5 block truncate text-[13px] font-semibold leading-4 text-ink sm:text-sm">
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown className={`size-3.5 shrink-0 text-ink-400 transition-transform ${isOpen ? "rotate-180 text-brand-strong" : ""}`} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          id={menuId}
          role="listbox"
          aria-label={label}
          className={`absolute top-[calc(100%+0.5rem)] z-50 max-h-72 overflow-y-auto overscroll-contain rounded-[22px] border border-black/[0.07] bg-surface p-2 shadow-[0_18px_50px_rgba(0,0,0,0.16)] ${menuClassName ?? "left-0 w-full"}`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/30 ${
                  isSelected ? "bg-brand-tint text-brand-deep" : "text-ink hover:bg-surface-muted"
                }`}
                onClick={() => selectOption(option)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span>{option.label}</span>
                {isSelected ? <Check className="size-4 shrink-0 text-brand-strong" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
