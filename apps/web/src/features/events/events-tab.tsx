import Image from "next/image";
import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";

const events = [
  {
    title: "Island Social Night",
    city: "Victoria Island",
    date: "May 18",
    time: "8:00 PM",
    price: "₦7,500",
    image:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Abuja Rooftop Mixer",
    city: "Wuse 2",
    date: "Jun 02",
    time: "7:30 PM",
    price: "₦5,000",
    image:
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Mainland Art Crawl",
    city: "Yaba",
    date: "Jun 14",
    time: "4:00 PM",
    price: "₦3,000",
    image:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=900&q=80",
  },
];

export function EventsTab() {
  return (
    <section>
      <ScreenHeader
        eyebrow="Events"
        title="Tickets for what is next."
        action={
          <button className="hidden h-10 items-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium md:inline-flex">
            <CalendarDays className="size-4" aria-hidden="true" />
            Calendar
          </button>
        }
      />

      <div className="grid gap-4 px-5 md:grid-cols-2 md:px-8 xl:grid-cols-3">
        {events.map((event) => (
          <article key={event.title} className="overflow-hidden rounded-[24px] border border-black/[0.05] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
            <div className="relative aspect-[16/11]">
              <Image src={event.image} alt={`${event.title} event`} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
                {event.price}
              </span>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">{event.date} · {event.time}</p>
              <h2 className="mt-2 text-lg font-semibold">{event.title}</h2>
              <p className="mt-1 flex items-center gap-1 text-sm text-[#666666]">
                <MapPin className="size-4" aria-hidden="true" />
                {event.city}
              </p>
              <button className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white">
                Buy ticket
                <Ticket className="size-4" aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
