"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Send, ShieldAlert } from "lucide-react";
import { useSession } from "@/components/app/session-provider";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type {
  CreateSupportResponse,
  SupportRequestCategory,
} from "@/lib/types";
import { supportCategories } from "./support-content";
import { SupportShell } from "./support-shell";

type FormState = {
  category: SupportRequestCategory;
  subject: string;
  message: string;
  displayName: string;
  email: string;
};

export function SupportContactPage({
  initialCategory = "TECHNICAL",
}: {
  initialCategory?: SupportRequestCategory;
}) {
  const { status, token, user } = useSession();
  const [form, setForm] = useState<FormState>({
    category: initialCategory,
    subject: "",
    message: "",
    displayName: "",
    email: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const isMember = status === "authenticated" && Boolean(token && user);
  const selectedCategory = useMemo(
    () => supportCategories.find((category) => category.id === form.category),
    [form.category],
  );

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "checking" || isSubmitting) return;
    setIsSubmitting(true);
    setFormMessage(null);

    try {
      const basePayload = {
        category: form.category,
        subject: form.subject.trim(),
        message: form.message.trim(),
        currentPage: window.location.pathname,
        userAgent: window.navigator.userAgent,
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
      };
      const response = await apiRequest<CreateSupportResponse>(
        isMember ? "/support/requests/me" : "/support/requests",
        {
          method: "POST",
          ...(token ? { headers: authHeaders(token) } : {}),
          body: JSON.stringify(
            isMember
              ? basePayload
              : {
                  ...basePayload,
                  displayName: form.displayName.trim(),
                  email: form.email.trim(),
                },
          ),
        },
      );

      setForm((current) => ({
        ...current,
        subject: "",
        message: "",
      }));
      setFormMessage({
        tone: "success",
        text: response.emailSent
          ? `Request ${response.request.reference} was sent. We also emailed you a private link.`
          : `Request ${response.request.reference} was sent. Email delivery is unavailable, so keep this reference.`,
      });
    } catch (error) {
      setFormMessage({
        tone: "error",
        text: getUserErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SupportShell backHref="/support" backLabel="General" maxWidth="max-w-4xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#777777]">
          Support centre
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Contact us</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#666666]">
          Tell us what happened once. You will receive a reference and a private place to continue
          the conversation.
        </p>
      </div>

      {form.category === "SAFETY_REPORT" ? (
        <section className="mt-6 rounded-[24px] border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-red-950">Safety requests are marked urgent</h2>
              <p className="mt-1 text-sm leading-6 text-red-900/75">
                Include the account, room, event, or message involved. If someone is in immediate
                danger, contact local emergency services first.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-[28px] border border-black/[0.07] bg-white p-5 md:p-7">
        <h2 className="text-xl font-semibold">Send a support request</h2>
        <p className="mt-2 text-sm leading-6 text-[#666666]">
          {isMember
            ? `We will use ${user?.email} and save this request to your account.`
            : "We will email you a private link for viewing replies and continuing the conversation."}
        </p>

        <form className="mt-6 grid gap-4" onSubmit={submitRequest}>
          {!isMember ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Name
                <input
                  className="h-12 rounded-[16px] border border-black/[0.1] px-4 outline-none focus:border-black/30"
                  minLength={2}
                  maxLength={80}
                  required
                  value={form.displayName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Email
                <input
                  className="h-12 rounded-[16px] border border-black/[0.1] px-4 outline-none focus:border-black/30"
                  type="email"
                  maxLength={254}
                  required
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
            </div>
          ) : null}

          <label className="grid gap-2 text-sm font-medium">
            What do you need help with?
            <select
              className="h-12 rounded-[16px] border border-black/[0.1] bg-white px-4 outline-none focus:border-black/30"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value as SupportRequestCategory,
                }))
              }
            >
              {supportCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <span className="font-normal text-[#777777]">{selectedCategory?.description}</span>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Subject
            <input
              className="h-12 rounded-[16px] border border-black/[0.1] px-4 outline-none focus:border-black/30"
              minLength={3}
              maxLength={140}
              required
              placeholder="A short summary"
              value={form.subject}
              onChange={(event) =>
                setForm((current) => ({ ...current, subject: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Details
            <textarea
              className="min-h-36 resize-y rounded-[16px] border border-black/[0.1] px-4 py-3 outline-none focus:border-black/30"
              minLength={10}
              maxLength={4_000}
              required
              placeholder="Tell us what happened, what you expected, and any relevant event or payment reference."
              value={form.message}
              onChange={(event) =>
                setForm((current) => ({ ...current, message: event.target.value }))
              }
            />
          </label>

          {formMessage ? (
            <div
              className={`rounded-[16px] p-4 text-sm ${
                formMessage.tone === "success"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-700"
              }`}
              role={formMessage.tone === "error" ? "alert" : "status"}
            >
              <p>{formMessage.text}</p>
              {formMessage.tone === "success" && isMember ? (
                <Link className="mt-2 inline-flex font-semibold underline" href="/support/requests">
                  View my requests
                </Link>
              ) : null}
            </div>
          ) : null}

          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            type="submit"
            disabled={status === "checking" || isSubmitting}
          >
            <Send className="size-4" aria-hidden="true" />
            {isSubmitting ? "Sending…" : "Send request"}
          </button>
        </form>
      </section>
    </SupportShell>
  );
}
