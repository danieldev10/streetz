import Link from "next/link";
import { Send } from "lucide-react";
import { supportFaqs } from "./support-content";
import { SupportShell } from "./support-shell";

export function SupportFaqPage() {
  return (
    <SupportShell maxWidth="max-w-4xl">
      <section>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Frequently asked questions</h1>
        <div className="mt-6 grid gap-3">
          {supportFaqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-[20px] border border-black/[0.07] bg-white p-5"
            >
              <summary className="cursor-pointer list-none pr-6 font-medium marker:content-none">
                {faq.question}
              </summary>
              <p className="mt-3 text-sm leading-6 text-[#666666]">{faq.answer}</p>
            </details>
          ))}
        </div>

        <div className="mt-6 rounded-[24px] bg-[#0d0d0d] p-6 text-white">
          <h2 className="text-xl font-semibold">Still need help?</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            Send the support team a request and keep the conversation in one private place.
          </p>
          <Link
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#0d0d0d]"
            href="/support/contact"
          >
            <Send className="size-4" aria-hidden="true" />
            Contact us
          </Link>
        </div>
      </section>
    </SupportShell>
  );
}
