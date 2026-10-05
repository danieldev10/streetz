import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicPageShell } from "@/components/public-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | Crushclub",
  description: "How Crush Club collects, uses and protects your personal data.",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicPageShell>
      <article className="mx-auto max-w-3xl px-5 py-6 md:px-8 md:py-8">
        <Link href="/events" className="inline-flex items-center gap-2 text-sm text-ink-600 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to events
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-ink-400">Effective 4 October 2026</p>
        <div className="mt-6 space-y-7 text-base leading-7 text-ink-600 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          <p>Crush Club Limited (RC 9777758) (&quot;Crush Club&quot;, &quot;we&quot;, &quot;us&quot;) operates Crushclub.ng. This policy explains how we collect, use and protect your personal data under the Nigeria Data Protection Act 2023 (NDPA).</p>
          <section>
            <h2>1. Data we collect</h2>
            <ul>
              <li>Account data: name, email, phone number, date of birth, password.</li>
              <li>Profile data: bio, photos, events attended, and anything you choose to add.</li>
              <li>Activity data: event group membership, messages and content you post, tickets purchased.</li>
              <li>Payment data: processed by our payment partners (such as Paystack and Monnify). We do not store your full card details.</li>
              <li>Technical data: device type, IP address, browser, pages visited, and cookies.</li>
            </ul>
          </section>
          <section>
            <h2>2. How we use it</h2>
            <ul>
              <li>To create and run your account, process payments and issue tickets.</li>
              <li>To show your profile to other members and help you connect around events.</li>
              <li>To keep the platform safe, prevent fraud and enforce our Terms.</li>
              <li>To send service messages and, where you agree, event updates and offers.</li>
              <li>To improve the platform and comply with the law.</li>
            </ul>
            <p className="mt-3">Our legal bases are contract performance, your consent, our legitimate interests (security and improvement) and legal obligation.</p>
          </section>
          <section>
            <h2>3. Who we share it with</h2>
            <ul>
              <li>Other members: your profile information is visible to other members as you set it.</li>
              <li>Venues and event partners: limited details (such as name and ticket status) for entry and check-in.</li>
              <li>Service providers: payment processors, hosting, analytics and messaging providers, bound by confidentiality.</li>
              <li>Authorities: where required by law or to protect rights and safety.</li>
            </ul>
            <p className="mt-3">We do not sell your personal data.</p>
          </section>
          <section>
            <h2>4. Retention and security</h2>
            <p>We keep data only as long as your account is active or as needed for legal, tax and dispute purposes, then delete or anonymise it. We use encryption in transit, access controls and other reasonable safeguards, but no system is completely secure.</p>
          </section>
          <section>
            <h2>5. Your rights</h2>
            <p>You may request access, correction, deletion or portability of your data, object to or restrict processing, and withdraw consent at any time. Email us at <a href="mailto:crushclubservice@gmail.com" className="break-all text-brand-strong underline underline-offset-4">crushclubservice@gmail.com</a> and we will respond within 48 hours. You may also complain to the Nigeria Data Protection Commission (NDPC).</p>
          </section>
          <section>
            <h2>6. Age, transfers and changes</h2>
            <p>Crush Club is for adults aged 18 and over. We do not knowingly collect data from anyone younger and will delete it if we find it. Some providers may process data outside Nigeria; where they do, we require appropriate safeguards. We will post any policy changes on this page with a new effective date.</p>
          </section>
        </div>
      </article>
    </PublicPageShell>
  );
}
