"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Gift, ImagePlus, LoaderCircle, Pencil, Plus, RefreshCw, Save, Trophy } from "lucide-react";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { EVENT_IMAGE_UPLOAD_MAX_BYTES, prepareImageForUpload } from "@/lib/image-upload";
import { LoadingState } from "@/components/loading-state";
import type { StreetzRaffle, StreetzUser } from "@/lib/types";
import { formatRaffleDate, formatRafflePrice, getRaffleStatusLabel, getRaffleStatusTone } from "./raffle-format";

type ImageUploadResponse = { uploadUrl: string; publicUrl: string; objectKey: string; expiresInSeconds: number };

type RaffleForm = {
  title: string;
  description: string;
  prizeTitle: string;
  prizeDescription: string;
  prizeCategory: string;
  prizeImage: string;
  prizeEstimatedValueNaira: string;
  ticketPriceNaira: string;
  salesStartsAt: string;
  salesEndsAt: string;
  drawsAt: string;
  status: "DRAFT" | "PUBLISHED";
};

const emptyForm: RaffleForm = {
  title: "",
  description: "",
  prizeTitle: "",
  prizeDescription: "",
  prizeCategory: "",
  prizeImage: "",
  prizeEstimatedValueNaira: "",
  ticketPriceNaira: "",
  salesStartsAt: "",
  salesEndsAt: "",
  drawsAt: "",
  status: "PUBLISHED"
};

const inputClass =
  "h-12 w-full rounded-2xl border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]";
const disabledInputClass =
  "disabled:cursor-not-allowed disabled:border-black/5 disabled:bg-[#f7f7f7] disabled:text-[#888888]";

export function AdminRafflesTab({ token }: { token: string; user: StreetzUser }) {
  const [raffles, setRaffles] = useState<StreetzRaffle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editingRaffle, setEditingRaffle] = useState<StreetzRaffle | null>(null);
  const [form, setForm] = useState<RaffleForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);

      try {
        const response = await apiRequest<{ raffles: StreetzRaffle[] }>("/admin/raffles", { headers: authHeaders(token) });
        if (!cancelled) {
          setRaffles(response.raffles);
        }
      } catch (caught) {
        if (!cancelled) {
          setNotice(getUserErrorMessage(caught));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  function updateForm(patch: Partial<RaffleForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function showList() {
    setView("list");
    setEditingRaffle(null);
    setForm(emptyForm);
  }

  function showCreate() {
    setNotice(null);
    setEditingRaffle(null);
    setForm(emptyForm);
    setView("create");
  }

  function showEdit(raffle: StreetzRaffle) {
    setNotice(null);
    setEditingRaffle(raffle);
    setForm(createFormFromRaffle(raffle));
    setView("edit");
  }

  async function uploadPrizeImage(file: File) {
    setIsUploading(true);
    setNotice(null);

    try {
      const prepared = await prepareImageForUpload(file, { maxBytes: EVENT_IMAGE_UPLOAD_MAX_BYTES, maxDimension: 1600 });
      const presign = await apiRequest<ImageUploadResponse>("/admin/events/images/presign", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ fileName: prepared.name, contentType: prepared.type, fileSizeBytes: prepared.size })
      });

      const uploadResponse = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": prepared.type },
        body: prepared
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed. Check the storage bucket CORS settings.");
      }

      updateForm({ prizeImage: presign.publicUrl });
      setNotice("Prize image uploaded.");
    } catch (caught) {
      const message = getUserErrorMessage(caught);
      setNotice(message === "Failed to fetch" ? "Image upload failed. Check the bucket CORS settings, then try again." : message);
    } finally {
      setIsUploading(false);
    }
  }

  async function saveRaffle() {
    setNotice(null);

    const ticketPriceKobo = Math.round(Number(form.ticketPriceNaira) * 100);
    if (!form.title.trim() || !form.prizeTitle.trim()) {
      setNotice("Add a raffle title and a prize title.");
      return;
    }

    if (!Number.isFinite(ticketPriceKobo) || ticketPriceKobo < 1) {
      setNotice("Enter a valid ticket price.");
      return;
    }

    if (!form.salesStartsAt || !form.salesEndsAt || !form.drawsAt) {
      setNotice("Set the sales window and draw date.");
      return;
    }

    const estimatedKobo = form.prizeEstimatedValueNaira ? Math.round(Number(form.prizeEstimatedValueNaira) * 100) : undefined;

    setIsSaving(true);

    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        prizeTitle: form.prizeTitle.trim(),
        prizeDescription: form.prizeDescription.trim() || undefined,
        prizeCategory: form.prizeCategory.trim() || undefined,
        prizeImage: form.prizeImage || undefined,
        coverImage: form.prizeImage || undefined,
        prizeEstimatedValueKobo: estimatedKobo,
        ticketPriceKobo,
        salesStartsAt: new Date(form.salesStartsAt).toISOString(),
        salesEndsAt: new Date(form.salesEndsAt).toISOString(),
        drawsAt: new Date(form.drawsAt).toISOString(),
        status: form.status
      };

      if (view === "edit") {
        if (!editingRaffle) {
          setNotice("Select a raffle to edit.");
          return;
        }

        const updated = await apiRequest<StreetzRaffle>(`/admin/raffles/${editingRaffle.id}`, {
          method: "PUT",
          headers: authHeaders(token),
          body: JSON.stringify(payload)
        });

        setRaffles((current) => current.map((raffle) => (raffle.id === updated.id ? updated : raffle)));
        showList();
        setNotice("Raffle updated.");
        return;
      }

      const created = await apiRequest<StreetzRaffle>("/admin/raffles", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload)
      });

      setRaffles((current) => [created, ...current]);
      showList();
      setNotice("Raffle created.");
    } catch (caught) {
      setNotice(getUserErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function runDraw(raffleId: string) {
    setDrawingId(raffleId);
    setNotice(null);

    try {
      const updated = await apiRequest<StreetzRaffle>(`/admin/raffles/${raffleId}/draw`, {
        method: "POST",
        headers: authHeaders(token)
      });
      setRaffles((current) => current.map((raffle) => (raffle.id === raffleId ? updated : raffle)));
      const winnerNumber = updated.raffle.winner?.number;
      setNotice(winnerNumber !== undefined ? `Winner drawn: ticket #${String(winnerNumber).padStart(5, "0")}.` : "Winner drawn.");
    } catch (caught) {
      setNotice(getUserErrorMessage(caught));
    } finally {
      setDrawingId(null);
    }
  }

  if (view === "create" || view === "edit") {
    const isEditing = view === "edit";
    const hasSoldTickets = isEditing && (editingRaffle?.raffle.ticketsSold ?? 0) > 0;
    const submitLabel = isEditing ? "Save changes" : "Create raffle";
    const title = isEditing ? "Edit raffle" : "Create raffle";

    return (
      <section className="px-5 pb-24 pt-6 md:px-8 md:pb-8">
        <button
          type="button"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#666666] hover:text-[#0d0d0d]"
          onClick={showList}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to raffles
        </button>

        <div className="mx-auto max-w-2xl rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.03)] md:p-6">
          <h1 className="text-2xl font-semibold">{title}</h1>

          {notice ? <p className="mt-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

          <div className="mt-5 grid gap-4">
            <Field label="Raffle title">
              <input className={inputClass} value={form.title} onChange={(event) => updateForm({ title: event.target.value })} maxLength={120} />
            </Field>

            <Field label="Prize title">
              <input className={inputClass} value={form.prizeTitle} onChange={(event) => updateForm({ prizeTitle: event.target.value })} maxLength={120} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prize category">
                <input className={inputClass} value={form.prizeCategory} onChange={(event) => updateForm({ prizeCategory: event.target.value })} placeholder="Cars, Appliances…" maxLength={40} />
              </Field>
              <Field label="Estimated value (₦)">
                <input className={inputClass} type="number" min={0} value={form.prizeEstimatedValueNaira} onChange={(event) => updateForm({ prizeEstimatedValueNaira: event.target.value })} />
              </Field>
            </div>

            <Field label="Prize description">
              <textarea
                className="min-h-24 w-full rounded-2xl border border-black/8 p-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                value={form.prizeDescription}
                onChange={(event) => updateForm({ prizeDescription: event.target.value })}
                maxLength={600}
              />
            </Field>

            <Field label="Prize image">
              <div className="flex items-center gap-3">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-[#f6e0f6]">
                  {form.prizeImage ? (
                    <Image src={form.prizeImage} alt="Prize" fill sizes="80px" className="object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-[#bd40be]">
                      <Gift className="size-6" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-black/8 px-4 text-sm font-medium disabled:opacity-60"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-4" aria-hidden="true" />}
                  {isUploading ? "Uploading" : "Upload image"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadPrizeImage(file);
                    }
                    event.target.value = "";
                  }}
                />
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ticket price (₦)">
                <input
                  className={`${inputClass} ${disabledInputClass}`}
                  type="number"
                  min={1}
                  value={form.ticketPriceNaira}
                  onChange={(event) => updateForm({ ticketPriceNaira: event.target.value })}
                  disabled={hasSoldTickets}
                />
              </Field>
              <Field label="Status">
                <select
                  className={`${inputClass} ${disabledInputClass}`}
                  value={form.status}
                  onChange={(event) => updateForm({ status: event.target.value as RaffleForm["status"] })}
                  disabled={hasSoldTickets}
                >
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Sales open">
                <input
                  className={`${inputClass} ${disabledInputClass}`}
                  type="datetime-local"
                  value={form.salesStartsAt}
                  onChange={(event) => updateForm({ salesStartsAt: event.target.value })}
                  disabled={hasSoldTickets}
                />
              </Field>
              <Field label="Sales close">
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={form.salesEndsAt}
                  min={hasSoldTickets && editingRaffle ? formatDateTimeLocal(editingRaffle.raffle.salesEndsAt) : undefined}
                  onChange={(event) => updateForm({ salesEndsAt: event.target.value })}
                />
              </Field>
              <Field label="Draw date">
                <input className={inputClass} type="datetime-local" value={form.drawsAt} onChange={(event) => updateForm({ drawsAt: event.target.value })} />
              </Field>
            </div>

            <button
              type="button"
              className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#9d2a9e] px-5 text-sm font-medium text-white transition hover:bg-[#7c1f7d] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void saveRaffle()}
              disabled={isSaving || isUploading}
            >
              {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : isEditing ? <Save className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              {submitLabel}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-5 pb-24 pt-6 md:px-8 md:pb-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight text-[#0d0d0d]">Raffles</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden h-9 items-center gap-2 rounded-full border border-black/8 px-3 text-sm font-medium md:inline-flex"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white"
            onClick={showCreate}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            New raffle
          </button>
        </div>
      </div>

      {notice ? <p className="mt-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

      <div className="mt-5">
        {isLoading ? (
          <LoadingState label="Loading raffles" className="min-h-90 rounded-3xl border border-black/5" />
        ) : raffles.length === 0 ? (
          <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
            <div>
              <Gift className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No raffles yet</h2>
              <p className="mt-2 text-sm text-[#666666]">Create a raffle draw for a car, appliance, or other prize.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {raffles.map((raffle) => {
              const details = raffle.raffle;
              const canDraw = details.status === "SALES_CLOSED";
              const canEdit = details.status !== "DRAWN" && details.status !== "CANCELLED";

              return (
                <article key={raffle.id} className="flex flex-wrap items-center gap-4 rounded-3xl border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f6e0f6] text-[#bd40be]">
                    <Trophy className="size-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-[#0d0d0d]">{details.prize.title}</h3>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getRaffleStatusTone(details.status)}`}>
                        {getRaffleStatusLabel(details.status)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[#666666]">{raffle.title}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#888888]">
                      <span>{details.ticketsSold} sold</span>
                      <span>{details.participantsCount ?? 0} entrants</span>
                      <span>{formatRafflePrice(details.totalRevenueKobo ?? 0)} raised</span>
                      <span>Draw {formatRaffleDate(details.drawsAt)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {canEdit ? (
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-black/8 px-4 text-sm font-medium text-[#0d0d0d] transition hover:border-[#bd40be] hover:text-[#7c1f7d]"
                        onClick={() => showEdit(raffle)}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        Edit
                      </button>
                    ) : null}
                    {details.status === "DRAWN" && details.winner ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d4fae8] px-3 py-1.5 text-xs font-semibold text-[#0b7a50]">
                        <Gift className="size-3.5" aria-hidden="true" />
                        #{String(details.winner.number).padStart(5, "0")} · {details.winner.displayName}
                      </span>
                    ) : canDraw ? (
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-[#9d2a9e] px-4 text-sm font-medium text-white transition hover:bg-[#7c1f7d] disabled:opacity-60"
                        onClick={() => void runDraw(raffle.id)}
                        disabled={drawingId === raffle.id}
                      >
                        {drawingId === raffle.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Gift className="size-4" aria-hidden="true" />}
                        Run draw
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function createFormFromRaffle(raffle: StreetzRaffle): RaffleForm {
  return {
    title: raffle.title,
    description: raffle.description ?? "",
    prizeTitle: raffle.raffle.prize.title,
    prizeDescription: raffle.raffle.prize.description ?? "",
    prizeCategory: raffle.raffle.prize.category ?? "",
    prizeImage: raffle.raffle.prize.image ?? raffle.coverImage ?? "",
    prizeEstimatedValueNaira: formatNairaInput(raffle.raffle.prize.estimatedValueKobo),
    ticketPriceNaira: formatNairaInput(raffle.raffle.ticketPriceKobo),
    salesStartsAt: formatDateTimeLocal(raffle.raffle.salesStartsAt),
    salesEndsAt: formatDateTimeLocal(raffle.raffle.salesEndsAt),
    drawsAt: formatDateTimeLocal(raffle.raffle.drawsAt),
    status: raffle.status === "DRAFT" ? "DRAFT" : "PUBLISHED"
  };
}

function formatNairaInput(kobo: number | null) {
  if (kobo === null) {
    return "";
  }

  const naira = kobo / 100;
  return Number.isInteger(naira) ? String(naira) : naira.toFixed(2);
}

function formatDateTimeLocal(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[#0d0d0d]">
      {label}
      {children}
    </label>
  );
}
