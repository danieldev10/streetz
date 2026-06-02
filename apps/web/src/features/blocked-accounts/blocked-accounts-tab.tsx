"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, ShieldOff, Unlock } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { BlockedAccount } from "@/lib/types";

export function BlockedAccountsTab({
  token,
  onUnblocked,
}: {
  token: string;
  onUnblocked?: () => void;
}) {
  const [blockedAccounts, setBlockedAccounts] = useState<BlockedAccount[]>([]);
  const [isLoadingBlockedAccounts, setIsLoadingBlockedAccounts] = useState(true);
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBlockedAccounts = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      const { showLoading = true } = options;

      if (showLoading) {
        setIsLoadingBlockedAccounts(true);
      }

      setNotice(null);

      try {
        const response = await apiRequest<{ blockedUsers: BlockedAccount[] }>("/discovery/blocks", {
          headers: authHeaders(token),
        });

        setBlockedAccounts(response.blockedUsers);
      } catch (error) {
        setNotice(getUserErrorMessage(error));
      } finally {
        if (showLoading) {
          setIsLoadingBlockedAccounts(false);
        }
      }
    },
    [token]
  );

  async function unblockAccount(account: BlockedAccount) {
    setUnblockingUserId(account.id);
    setNotice(null);

    try {
      const response = await apiRequest<{ unblocked: boolean; matchRestored: boolean }>("/discovery/unblock", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ targetUserId: account.id }),
      });

      setBlockedAccounts((current) => current.filter((blockedAccount) => blockedAccount.id !== account.id));
      setNotice(response.matchRestored ? "Account unblocked. Your match is available again." : "Account unblocked.");
      onUnblocked?.();
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setUnblockingUserId(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBlockedAccounts();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadBlockedAccounts]);

  return (
    <section>
      <ScreenHeader
        eyebrow="Blocked accounts"
        title=""
        action={
          <button
            className="hidden h-10 items-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium md:inline-flex"
            type="button"
            onClick={() => void loadBlockedAccounts()}
            disabled={isLoadingBlockedAccounts}
          >
            {isLoadingBlockedAccounts ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
            Refresh
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingBlockedAccounts ? (
          <LoadingState label="Loading blocked accounts" className="min-h-[420px] rounded-[28px] border border-black/[0.05]" />
        ) : blockedAccounts.length > 0 ? (
          <div className="mx-auto grid max-w-2xl gap-3">
            {blockedAccounts.map((account) => (
              <article
                key={account.id}
                className="flex items-center gap-3 rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
              >
                <div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-[#d4fae8]">
                  <ProfilePhotoImage
                    photo={account.photos[0]}
                    alt={`${account.displayName} profile`}
                    variant="thumb"
                    sizes="56px"
                    iconSize="sm"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{account.displayName}</p>
                  <p className="mt-1 truncate text-sm text-[#666666]">
                    {[account.city, account.state].filter(Boolean).join(", ") || "Nigeria"}
                  </p>
                </div>
                <button
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => void unblockAccount(account)}
                  disabled={unblockingUserId === account.id}
                >
                  {unblockingUserId === account.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Unlock className="size-4" aria-hidden="true" />}
                  Unblock
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05] p-6 text-center">
            <div>
              <ShieldOff className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No blocked accounts</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#666666]">Accounts you block will appear here.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
