"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Compass, Eye, EyeOff, LoaderCircle, MapPin, MessageCircle, RefreshCw, SlidersHorizontal, Sparkles, UserRoundSearch, X } from "lucide-react";
import { CustomSelect } from "@/components/custom-select";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import { DiscoveryPreferencesForm } from "@/features/discovery/discovery-preferences-form";
import { MemberProfileView } from "@/features/discovery/member-profile-view";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { nigeriaStateNames } from "@/lib/nigeria-locations";
import { connectionStatusOptions, formatConnectionStatus } from "@/lib/profile";
import { queryKeys } from "@/lib/query-keys";
import type { ConnectionStatus, DiscoveryCandidate, DiscoveryPreference, StreetzProfile } from "@/lib/types";
import { useDialogFocus } from "@/lib/use-dialog-focus";

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
  const [status, setStatus] = useState<ConnectionStatus>(initialProfile.connectionStatus ?? "OPEN_TO_ANYTHING");
  const [stateName, setStateName] = useState(initialProfile.state ?? "");
  const [isInDiscoveryPool, setIsInDiscoveryPool] = useState(initialProfile.discoveryLive);
  const [people, setPeople] = useState<DiscoveryCandidate[]>([]);
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewedProfile, setViewedProfile] = useState<DiscoveryCandidate | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [messageTarget, setMessageTarget] = useState<DiscoveryCandidate | null>(null);
  const [introMessage, setIntroMessage] = useState("");
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isPreferenceOpen, setIsPreferenceOpen] = useState(false);
  const [preferenceRequired, setPreferenceRequired] = useState(false);
  const controlsDialogRef = useRef<HTMLElement | null>(null);
  const stateOptions = initialProfile.state && !nigeriaStateNames.includes(initialProfile.state)
    ? [...nigeriaStateNames, initialProfile.state]
    : nigeriaStateNames;

  useDialogFocus(isControlsOpen, controlsDialogRef);

  useEffect(() => {
    if (!isControlsOpen) return undefined;

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsControlsOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isControlsOpen]);

  useEffect(() => {
    let cancelled = false;

    async function initializeDiscovery() {
      setIsInitializing(true);

      try {
        const preference = await apiRequest<DiscoveryPreference>("/profiles/me/discovery-preferences", {
          headers: authHeaders(token),
        });

        if (cancelled) return;

        if (preference.needsConfirmation) {
          setPreferenceRequired(true);
          setIsPreferenceOpen(true);
          return;
        }

        const initialState = initialProfile.state?.trim();

        if (!initialProfile.discoveryLive || !initialState) return;

        setIsSearching(true);
        const response = await apiRequest<PeopleResponse>("/discovery/people", {
          headers: authHeaders(token),
        });

        if (cancelled) return;

        setPeople(response.people);
        setNextCursor(response.nextCursor);
        setActiveSearch(initialState);
        setHasSearched(true);
      } catch (error) {
        if (!cancelled) setNotice(getUserErrorMessage(error));
      } finally {
        if (!cancelled) {
          setIsSearching(false);
          setIsInitializing(false);
        }
      }
    }

    void initializeDiscovery();

    return () => {
      cancelled = true;
    };
  }, [initialProfile.discoveryLive, initialProfile.state, token]);

  async function saveSearchSettings() {
    const trimmedState = stateName.trim();

    if (!trimmedState) {
      throw new Error("Choose a state before discovering people.");
    }

    const saved = await apiRequest<StreetzProfile>("/profiles/me", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        state: trimmedState,
      }),
    });

    queryClient.setQueryData(queryKeys.profile(saved.user.id), saved);
  }

  async function searchPeople(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!isInDiscoveryPool) {
      setNotice("Enter the discovery pool before discovering people.");
      return;
    }

    setIsSearching(true);
    setNotice(null);

    try {
      await saveSearchSettings();
      const response = await apiRequest<PeopleResponse>("/discovery/people", {
        headers: authHeaders(token),
      });
      setPeople(response.people);
      setNextCursor(response.nextCursor);
      setActiveSearch(stateName.trim());
      setHasSearched(true);
      setIsControlsOpen(false);
    } catch (error) {
      setNotice(error instanceof Error && !("status" in error) ? error.message : getUserErrorMessage(error));
    } finally {
      setIsSearching(false);
    }
  }

  async function toggleDiscoveryPool() {
    if (isUpdatingVisibility) return;

    const nextVisibility = !isInDiscoveryPool;
    setIsUpdatingVisibility(true);
    setNotice(null);

    try {
      const saved = await apiRequest<StreetzProfile>("/profiles/me", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ discoveryLive: nextVisibility }),
      });

      setIsInDiscoveryPool(saved.discoveryLive);
      queryClient.setQueryData(queryKeys.profile(saved.user.id), saved);

      if (!saved.discoveryLive) {
        setPeople([]);
        setNextCursor(null);
        setActiveSearch(null);
        setHasSearched(false);
        setViewedProfile(null);
      }

    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsUpdatingVisibility(false);
    }
  }

  async function updateStatus(nextStatus: ConnectionStatus) {
    if (isUpdatingStatus || nextStatus === status) return;

    const previousStatus = status;
    setStatus(nextStatus);
    setIsUpdatingStatus(true);
    setNotice(null);

    try {
      const saved = await apiRequest<StreetzProfile>("/profiles/me", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ connectionStatus: nextStatus }),
      });

      setStatus(saved.connectionStatus ?? nextStatus);
      queryClient.setQueryData(queryKeys.profile(saved.user.id), saved);
      setNotice(`Status updated to ${formatConnectionStatus(saved.connectionStatus)}.`);
    } catch (error) {
      setStatus(previousStatus);
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function loadMore() {
    if (!isInDiscoveryPool || !nextCursor || isLoadingMore) return;
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
    <section className="px-5 pb-24 pt-6 md:px-8 md:pt-8">
      <div className="mx-auto max-w-4xl">
        {notice ? <p className="mt-4 rounded-[18px] bg-brand-tint p-4 text-sm font-medium text-brand-deep">{notice}</p> : null}

        {!isInDiscoveryPool ? (
          <div className="mt-7 grid min-h-64 place-items-center rounded-[28px] border border-black/[0.05] bg-surface-muted p-6 text-center">
            <div>
              <EyeOff className="mx-auto size-8 text-ink-400" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">You are out of the pool</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-ink-600">
                Enter the discovery pool to see and be seen by people in your state.
              </p>
            </div>
          </div>
        ) : isInitializing || (isSearching && !hasSearched) ? (
          <div className="mt-7 flex min-h-64 items-center justify-center rounded-[28px] border border-black/[0.05] bg-surface p-6 text-center">
            <div>
              <LoaderCircle className="mx-auto size-6 animate-spin text-brand" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-ink-600">Finding people in your state</p>
            </div>
          </div>
        ) : isLoadingProfile ? (
          <div className="mt-6 flex min-h-48 items-center justify-center rounded-[24px] border border-black/[0.05]">
            <LoaderCircle className="size-6 animate-spin text-brand" aria-hidden="true" />
            <span className="sr-only">Loading profile</span>
          </div>
        ) : hasSearched && people.length > 0 ? (
          <div className="mt-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">People in {activeSearch ?? stateName}</h2>
                <p className="mt-1 text-sm text-ink-500">Profiles available in this state.</p>
              </div>
              <span className="text-sm font-medium text-ink-400">{people.length} found</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {people.map((person) => (
                <article key={person.id} className="flex min-w-0 items-center gap-3 rounded-[22px] border border-black/[0.05] bg-surface p-3 shadow-[0_2px_6px_rgba(0,0,0,0.03)]">
                  <button
                    type="button"
                    className="relative size-16 shrink-0 overflow-hidden rounded-[18px] bg-brand-tint"
                    onClick={() => void viewProfile(person)}
                    aria-label={`View ${person.displayName} profile`}
                  >
                    <CandidatePhoto candidate={person} variant="thumb" />
                  </button>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void viewProfile(person)}>
                    <h3 className="truncate text-base font-semibold">{person.displayName}{person.age ? `, ${person.age}` : ""}</h3>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-ink-500">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      {person.state ?? "Nigeria"}
                    </p>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs font-semibold text-brand-strong">
                      <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
                      {formatConnectionStatus(person.connectionStatus)}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] text-ink transition hover:border-black/[0.16] hover:bg-surface-muted"
                      onClick={() => void viewProfile(person)}
                      aria-label={`View ${person.displayName} profile`}
                      title="View profile"
                    >
                      <UserRoundSearch className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-10 items-center justify-center rounded-full bg-brand-strong text-white transition hover:bg-brand-deep"
                      onClick={() => openMessageComposer(person)}
                      aria-label={`Message ${person.displayName}`}
                      title="Message"
                    >
                      <MessageCircle className="size-4" aria-hidden="true" />
                    </button>
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
              <p className="mt-2 max-w-sm text-sm leading-6 text-ink-600">Try another state or search again later.</p>
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-5 z-30 inline-flex size-12 items-center justify-center rounded-full border border-black/[0.08] bg-surface text-ink-600 shadow-[0_8px_24px_rgba(0,0,0,0.14)] transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 md:bottom-8 md:left-8"
        onClick={() => void searchPeople()}
        disabled={isSearching || preferenceRequired || !isInDiscoveryPool || !stateName.trim()}
        aria-label="Refresh people"
        title="Refresh people"
      >
        <RefreshCw className={`size-4 ${isSearching ? "animate-spin" : ""}`} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-5 z-30 inline-flex size-12 items-center justify-center rounded-full bg-ink text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:bg-ink/90 md:bottom-8 md:right-8"
        onClick={() => setIsControlsOpen(true)}
        aria-label="Open discovery controls"
        aria-haspopup="dialog"
        aria-expanded={isControlsOpen}
        aria-controls="discovery-controls-dialog"
        title="Discovery controls"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
      </button>

      {isControlsOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setIsControlsOpen(false)}
            aria-label="Close discovery controls"
          />
          <section
            id="discovery-controls-dialog"
            ref={controlsDialogRef}
            className="relative w-full max-w-sm rounded-[28px] bg-surface p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discovery-controls-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">Discovery</p>
                <h2 id="discovery-controls-title" className="mt-1 text-xl font-semibold text-ink">Find your crowd</h2>
                <p className="mt-1 text-sm leading-5 text-ink-500">Update your status and choose where to look.</p>
              </div>
              <button
                type="button"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-ink"
                onClick={() => setIsControlsOpen(false)}
                aria-label="Close discovery controls"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <form className="mt-5" onSubmit={searchPeople}>
              <div className="grid gap-3">
                <CustomSelect
                  label={isUpdatingStatus ? "Updating status" : "Your status"}
                  value={status}
                  options={connectionStatusOptions}
                  onChange={(nextStatus) => void updateStatus(nextStatus)}
                  icon={Sparkles}
                />

                <CustomSelect
                  label="Filter by state"
                  value={stateName}
                  options={stateOptions.map((state) => ({ value: state, label: state }))}
                  onChange={setStateName}
                  icon={MapPin}
                  placeholder="Choose state"
                />
              </div>

              {notice ? <p className="mt-4 rounded-[18px] bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

              <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <button
                  type="submit"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSearching || preferenceRequired || !isInDiscoveryPool}
                >
                  {isSearching ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Compass className="size-4" aria-hidden="true" />}
                  {isSearching ? "Finding people" : "Discover"}
                </button>
                <button
                  type="button"
                  className={`inline-flex h-12 min-w-[7.5rem] items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isInDiscoveryPool
                      ? "border-brand/20 bg-brand-tint text-brand-deep"
                      : "border-black/[0.08] bg-surface text-ink-600"
                  }`}
                  onClick={() => void toggleDiscoveryPool()}
                  disabled={isUpdatingVisibility}
                  aria-pressed={isInDiscoveryPool}
                  aria-label={isInDiscoveryPool ? "Withdraw from discovery pool" : "Enter discovery pool"}
                  title={isInDiscoveryPool ? "Withdraw from discovery pool" : "Enter discovery pool"}
                >
                  {isUpdatingVisibility ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : isInDiscoveryPool ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                  {isInDiscoveryPool ? "Withdraw" : "Enter pool"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

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
            void searchPeople();
          }}
        />
      ) : null}
    </section>
  );
}
