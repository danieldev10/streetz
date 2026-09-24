"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Compass, LoaderCircle, MapPin, MessageCircle, SlidersHorizontal, Sparkles, UserRoundSearch } from "lucide-react";
import { CustomSelect } from "@/components/custom-select";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import { DiscoveryPreferencesForm } from "@/features/discovery/discovery-preferences-form";
import { MemberProfileView } from "@/features/discovery/member-profile-view";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { nigeriaStateNames } from "@/lib/nigeria-locations";
import { connectionStatusOptions, formatConnectionStatus } from "@/lib/profile";
import { queryKeys } from "@/lib/query-keys";
import type { ConnectionStatus, DiscoveryCandidate, DiscoveryPreference, StreetzProfile } from "@/lib/types";

type PeopleResponse = {
  people: DiscoveryCandidate[];
  nextCursor: string | null;
};

type ConversationRequestResponse = {
  created: boolean;
  accepted?: boolean;
  conversation: {
    id: string;
    status: "REQUESTED" | "ACTIVE" | "DECLINED" | "CLOSED" | "BLOCKED" | "UNMATCHED";
  };
};

const INTRO_MESSAGE_MAX_LENGTH = 1000;

export function DiscoveryTab({
  token,
  profile: initialProfile,
  onConversationChanged,
}: {
  token: string;
  profile: StreetzProfile;
  onConversationChanged: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>(initialProfile.connectionStatus ?? "DATING");
  const [stateName, setStateName] = useState(initialProfile.state ?? "");
  const [people, setPeople] = useState<DiscoveryCandidate[]>([]);
  const [activeSearch, setActiveSearch] = useState<{ state: string; status: ConnectionStatus } | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewedProfile, setViewedProfile] = useState<DiscoveryCandidate | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [messageTarget, setMessageTarget] = useState<DiscoveryCandidate | null>(null);
  const [introMessage, setIntroMessage] = useState("");
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [isPreferenceOpen, setIsPreferenceOpen] = useState(false);
  const [preferenceRequired, setPreferenceRequired] = useState(false);
  const stateOptions = initialProfile.state && !nigeriaStateNames.includes(initialProfile.state)
    ? [...nigeriaStateNames, initialProfile.state]
    : nigeriaStateNames;

  useEffect(() => {
    let cancelled = false;

    void apiRequest<DiscoveryPreference>("/profiles/me/discovery-preferences", { headers: authHeaders(token) })
      .then((preference) => {
        if (!cancelled && preference.needsConfirmation) {
          setPreferenceRequired(true);
          setIsPreferenceOpen(true);
        }
      })
      .catch((error) => {
        if (!cancelled) setNotice(getUserErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function saveSearchSettings() {
    const trimmedState = stateName.trim();

    if (!trimmedState) {
      throw new Error("Choose a state before discovering people.");
    }

    const saved = await apiRequest<StreetzProfile>("/profiles/me", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        connectionStatus: status,
        state: trimmedState,
      }),
    });

    queryClient.setQueryData(queryKeys.profile(saved.user.id), saved);
  }

  async function searchPeople(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setIsSearching(true);
    setNotice(null);

    try {
      await saveSearchSettings();
      const response = await apiRequest<PeopleResponse>("/discovery/people", {
        headers: authHeaders(token),
      });
      setPeople(response.people);
      setNextCursor(response.nextCursor);
      setActiveSearch({ state: stateName, status });
      setHasSearched(true);
    } catch (error) {
      setNotice(error instanceof Error && !("status" in error) ? error.message : getUserErrorMessage(error));
    } finally {
      setIsSearching(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setNotice(null);

    try {
      const response = await apiRequest<PeopleResponse>(`/discovery/people?cursor=${encodeURIComponent(nextCursor)}`, {
        headers: authHeaders(token),
      });
      setPeople((current) => {
        const byId = new Map(current.map((person) => [person.id, person]));
        for (const person of response.people) byId.set(person.id, person);
        return [...byId.values()];
      });
      setNextCursor(response.nextCursor);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function viewProfile(person: DiscoveryCandidate) {
    setIsLoadingProfile(true);
    setNotice(null);

    try {
      const fullProfile = await apiRequest<DiscoveryCandidate>(`/discovery/people/${person.id}`, {
        headers: authHeaders(token),
      });
      setViewedProfile(fullProfile);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsLoadingProfile(false);
    }
  }

  function openMessageComposer(person: DiscoveryCandidate) {
    setViewedProfile(null);
    setMessageTarget(person);
    setIntroMessage("");
    setNotice(null);
  }

  async function sendMessageRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = introMessage.trim();

    if (!messageTarget || !body || isSendingRequest) return;
    setIsSendingRequest(true);
    setNotice(null);

    try {
      const response = await apiRequest<ConversationRequestResponse>("/conversations/requests", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ targetUserId: messageTarget.id, body }),
      });
      onConversationChanged();
      setMessageTarget(null);
      setIntroMessage("");

      if (response.conversation.status === "ACTIVE" || response.accepted) {
        router.push(`/messages/${response.conversation.id}`);
        return;
      }

      setNotice(response.created
        ? `Message request sent to ${messageTarget.displayName}.`
        : `Your message request to ${messageTarget.displayName} is already pending.`
      );
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsSendingRequest(false);
    }
  }

  if (viewedProfile) {
    return (
      <MemberProfileView
        candidate={viewedProfile}
        onBack={() => setViewedProfile(null)}
        backLabel="Back to people"
        token={token}
        showSafetyActions
        onBlocked={(candidate) => {
          setPeople((current) => current.filter((person) => person.id !== candidate.id));
          setViewedProfile(null);
          setNotice("Profile blocked.");
        }}
        footer={(
          <button
            type="button"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white"
            onClick={() => openMessageComposer(viewedProfile)}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Message {viewedProfile.displayName}
          </button>
        )}
      />
    );
  }

  return (
    <section className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
      <div className="mx-auto max-w-4xl">
        <form onSubmit={searchPeople}>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <CustomSelect
              label="Status"
              value={status}
              options={connectionStatusOptions}
              onChange={setStatus}
              icon={Sparkles}
              menuClassName="left-0 w-[calc(200%+0.5rem)] sm:w-full"
            />

            <CustomSelect
              label="State"
              value={stateName}
              options={stateOptions.map((state) => ({ value: state, label: state }))}
              onChange={setStateName}
              icon={MapPin}
              placeholder="Choose state"
              menuClassName="right-0 w-[calc(200%+0.5rem)] sm:w-full"
            />
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2 sm:grid-cols-[minmax(0,1fr)_3rem] sm:gap-3">
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:h-12"
              disabled={isSearching || preferenceRequired}
            >
              {isSearching ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Compass className="size-4" aria-hidden="true" />}
              {isSearching ? "Finding people" : "Discover"}
            </button>
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-full border border-black/[0.08] bg-surface text-ink sm:size-12"
              onClick={() => setIsPreferenceOpen(true)}
              aria-label="Discovery preferences"
              title="Discovery preferences"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </button>
          </div>
        </form>

        {notice ? <p className="mt-4 rounded-[18px] bg-brand-tint p-4 text-sm font-medium text-brand-deep">{notice}</p> : null}

        {isLoadingProfile ? (
          <div className="mt-6 flex min-h-48 items-center justify-center rounded-[24px] border border-black/[0.05]">
            <LoaderCircle className="size-6 animate-spin text-brand" aria-hidden="true" />
            <span className="sr-only">Loading profile</span>
          </div>
        ) : hasSearched && people.length > 0 ? (
          <div className="mt-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">People in {activeSearch?.state ?? stateName}</h2>
                <p className="mt-1 text-sm text-ink-500">Showing people looking for {formatConnectionStatus(activeSearch?.status ?? status).toLowerCase()}.</p>
              </div>
              <span className="text-sm font-medium text-ink-400">{people.length} found</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {people.map((person) => (
                <article key={person.id} className="flex min-w-0 gap-4 rounded-[24px] border border-black/[0.05] bg-surface p-4 shadow-[0_2px_6px_rgba(0,0,0,0.03)]">
                  <button
                    type="button"
                    className="relative size-20 shrink-0 overflow-hidden rounded-[20px] bg-brand-tint"
                    onClick={() => void viewProfile(person)}
                    aria-label={`View ${person.displayName} profile`}
                  >
                    <CandidatePhoto candidate={person} variant="thumb" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button type="button" className="block max-w-full text-left" onClick={() => void viewProfile(person)}>
                      <h3 className="truncate text-lg font-semibold">{person.displayName}{person.age ? `, ${person.age}` : ""}</h3>
                      <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-ink-500">
                        <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                        {person.state ?? "Nigeria"}
                      </p>
                    </button>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-black/[0.08] px-3 text-xs font-semibold"
                        onClick={() => void viewProfile(person)}
                      >
                        <UserRoundSearch className="size-3.5" aria-hidden="true" />
                        Profile
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-strong px-3 text-xs font-semibold text-white"
                        onClick={() => openMessageComposer(person)}
                      >
                        <MessageCircle className="size-3.5" aria-hidden="true" />
                        Message
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {nextCursor ? (
              <button
                type="button"
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-black/[0.08] text-sm font-semibold disabled:opacity-60"
                onClick={() => void loadMore()}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                {isLoadingMore ? "Loading" : "Load more"}
              </button>
            ) : null}
          </div>
        ) : hasSearched ? (
          <div className="mt-7 grid min-h-64 place-items-center rounded-[28px] border border-black/[0.05] p-6 text-center">
            <div>
              <UserRoundSearch className="mx-auto size-8 text-brand" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No one found yet</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-ink-600">Try another state or status, or search again later.</p>
            </div>
          </div>
        ) : null}
      </div>

      {messageTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
          <form className="w-full max-w-sm rounded-[28px] bg-surface p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]" onSubmit={sendMessageRequest}>
            <div className="flex items-center gap-3">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-brand-tint">
                <CandidatePhoto candidate={messageTarget} variant="thumb" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">Message {messageTarget.displayName}</h2>
                <p className="mt-0.5 text-xs text-ink-500">Send one introduction. They can accept or decline.</p>
              </div>
            </div>
            <textarea
              className="mt-4 min-h-32 w-full resize-none rounded-[20px] border border-black/[0.08] p-4 text-sm leading-6 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="Introduce yourself"
              value={introMessage}
              onChange={(event) => setIntroMessage(event.target.value)}
              maxLength={INTRO_MESSAGE_MAX_LENGTH}
              autoFocus
            />
            <p className="mt-1 text-right text-xs text-ink-400">{introMessage.length}/{INTRO_MESSAGE_MAX_LENGTH}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="h-11 rounded-full border border-black/[0.08] text-sm font-semibold"
                onClick={() => setMessageTarget(null)}
                disabled={isSendingRequest}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-60"
                disabled={isSendingRequest || !introMessage.trim()}
              >
                {isSendingRequest ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <MessageCircle className="size-4" aria-hidden="true" />}
                Send request
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isPreferenceOpen ? (
        <DiscoveryPreferencesForm
          token={token}
          required={preferenceRequired}
          onClose={() => setIsPreferenceOpen(false)}
          onSaved={() => {
            setPreferenceRequired(false);
            setIsPreferenceOpen(false);
            setPeople([]);
            setActiveSearch(null);
            setHasSearched(false);
          }}
        />
      ) : null}
    </section>
  );
}
