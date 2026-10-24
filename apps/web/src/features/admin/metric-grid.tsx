import type { LucideIcon } from "lucide-react";

const tones = {
  brand: { card: "border-brand/10 to-brand-wash", icon: "bg-brand-tint text-brand-deep" },
  info: { card: "border-info/10 to-info-tint/40", icon: "bg-info-tint text-info" },
  success: { card: "border-success/10 to-success-tint/40", icon: "bg-success-tint text-success-deep" },
  warning: { card: "border-warning/10 to-warning-tint/50", icon: "bg-warning-tint text-warning" },
};
export type MetricCard = { label: string; value: string; helper: string; icon: LucideIcon; tone: keyof typeof tones; fullValue?: string };

export function MetricGrid({ cards }: { cards: MetricCard[] }) {
  return <div className="grid grid-cols-2 gap-3">
    {cards.map((card) => <article key={card.label} className={`min-w-0 rounded-[20px] border bg-linear-to-br from-surface p-3 shadow-[0_2px_8px_rgba(0,0,0,0.025)] sm:p-4 ${tones[card.tone].card}`}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-medium leading-4 text-ink-600">{card.label}</p>
        <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-xl ${tones[card.tone].icon}`}><card.icon className="size-4" aria-hidden="true" /></span>
      </div>
      <p className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink tabular-nums sm:text-[28px]" title={card.fullValue}>
        {card.fullValue ? <><span aria-hidden="true">{card.value}</span><span className="sr-only">{card.fullValue}</span></> : card.value}
      </p>
      <p className="mt-2 text-[11px] leading-4 text-ink-600">{card.helper}</p>
    </article>)}
  </div>;
}
