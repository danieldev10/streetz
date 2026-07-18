"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { DiscoveryGender, DiscoveryPreference } from "@/lib/types";

const genderOptions: Array<{ value: DiscoveryGender; label: string }> = [
  { value: "WOMAN", label: "Women" },
  { value: "MAN", label: "Men" },
  { value: "NON_BINARY", label: "Non-binary people" },
];

export function DiscoveryPreferencesForm({
  token,
  required = false,
  onClose,
  onSaved,
}: {
  token: string;
  required?: boolean;
  onClose: () => void;
  onSaved: (preference: DiscoveryPreference) => void;
}) {
  const [preference, setPreference] = useState<DiscoveryPreference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<DiscoveryPreference>("/profiles/me/discovery-preferences", { headers: authHeaders(token) })
      .then((result) => {
        if (!cancelled) setPreference(result);
      })
      .catch((loadError) => {
        if (!cancelled) setError(getUserErrorMessage(loadError));
      });
    return () => { cancelled = true; };
  }, [token]);

  function toggleGender(gender: DiscoveryGender) {
    setPreference((current) => {
      if (!current) return current;
      const selected = current.interestedInGenders.includes(gender);
      return {
        ...current,
        interestedInGenders: selected
          ? current.interestedInGenders.filter((value) => value !== gender)
          : [...current.interestedInGenders, gender],
      };
    });
  }

  async function save() {
    if (!preference?.discoveryGender) {
      setError("Choose the private gender category used for discovery.");
      return;
    }
    if (preference.interestedInGenders.length === 0) {
      setError("Choose at least one group you would like to meet.");
      return;
    }
    if (preference.minAge > preference.maxAge) {
      setError("Minimum age cannot be greater than maximum age.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const saved = await apiRequest<DiscoveryPreference>("/profiles/me/discovery-preferences", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({
          discoveryGender: preference.discoveryGender,
          showGender: preference.showGender,
          interestedInGenders: preference.interestedInGenders,
          minAge: preference.minAge,
          maxAge: preference.maxAge,
        }),
      });
      setPreference(saved);
      onSaved(saved);
    } catch (saveError) {
      setError(getUserErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 px-5 py-6 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#0d0d0d]">Discovery preferences</h2>
            <p className="mt-1 text-sm leading-6 text-[#666666]">These private choices make discovery mutual. Sexuality is never used as an automatic rule.</p>
          </div>
          {!required ? (
            <button type="button" className="inline-flex size-9 items-center justify-center rounded-full border border-black/[0.08]" onClick={onClose} aria-label="Close preferences">
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {!preference ? <div className="mt-8 flex justify-center"><LoaderCircle className="size-5 animate-spin" /></div> : (
          <div className="mt-5 grid gap-5">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Private matching gender</legend>
              <p className="mt-1 text-xs leading-5 text-[#777777]">Used for compatibility even if you hide gender publicly.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {genderOptions.map((option) => (
                  <button key={option.value} type="button" className={`rounded-full border px-4 py-2 text-sm ${preference.discoveryGender === option.value ? "border-black bg-black text-white" : "border-black/10"}`} onClick={() => setPreference({ ...preference, discoveryGender: option.value })}>
                    {option.label.replace(" people", "")}
                  </button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-[#444444]">
                <input type="checkbox" checked={preference.showGender} onChange={(event) => setPreference({ ...preference, showGender: event.target.checked })} />
                Show my gender on my public profile
              </label>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Who would you like to meet?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {genderOptions.map((option) => {
                  const active = preference.interestedInGenders.includes(option.value);
                  return <button key={option.value} type="button" className={`rounded-full border px-4 py-2 text-sm ${active ? "border-black bg-black text-white" : "border-black/10"}`} onClick={() => toggleGender(option.value)}>{option.label}</button>;
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Preferred age range</legend>
              <div className="mt-2 flex items-center gap-3">
                <input className="h-11 min-w-0 flex-1 rounded-full border border-black/10 px-4" type="number" min={18} max={100} value={preference.minAge} onChange={(event) => setPreference({ ...preference, minAge: Number(event.target.value) })} />
                <span>–</span>
                <input className="h-11 min-w-0 flex-1 rounded-full border border-black/10 px-4" type="number" min={18} max={100} value={preference.maxAge} onChange={(event) => setPreference({ ...preference, maxAge: Number(event.target.value) })} />
              </div>
            </fieldset>
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        <button className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-semibold text-white disabled:opacity-50" type="button" disabled={!preference || isSaving} onClick={() => void save()}>
          {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Confirm discovery preferences
        </button>
      </div>
    </div>
  );
}
