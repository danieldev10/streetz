"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Heart,
  LoaderCircle,
  LogIn,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Ticket,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { AccountStatus, AdminUserActivity, AdminUserSummary } from "@/lib/types";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNaira(amountKobo: number) {
  if (amountKobo <= 0) return "Free";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(
    amountKobo / 100
  );
}

function StatusChip({ status }: { status: AccountStatus }) {
  const map: Record<AccountStatus, { label: string; cls: string }> = {
    ACTIVE: { label: "Active", cls: "bg-[#d4fae8] text-[#0fa76e]" },
    DEACTIVATED: { label: "Deactivated", cls: "bg-[#fafafa] text-[#666666]" },
    SUSPENDED: { label: "Suspended", cls: "bg-orange-50 text-orange-700" },
    BANNED: { label: "Banned", cls: "bg-red-50 text-red-700" },
    DELETED: { label: "Deleted", cls: "bg-red-100 text-red-900" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-[#fafafa] text-[#666666]" };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function SubChip({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        isActive ? "bg-[#d4fae8] text-[#0fa76e]" : "bg-[#fafafa] text-[#888888]"
      }`}
    >
      {isActive ? "Subscribed" : "No sub"}
    </span>
  );
}

type ActivityTabKey = "profile" | "discovery" | "matches" | "social" | "events" | "account";

const activityTabs: Array<{ id: ActivityTabKey; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "discovery", label: "Discovery" },
  { id: "matches", label: "Matches" },
  { id: "social", label: "Rooms" },
  { id: "events", label: "Events" },
  { id: "account", label: "Account" },
];

function UserDetailView({
  user,
  onBack,
}: {
  user: AdminUserActivity;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ActivityTabKey>("profile");

  const unseenLikes = user.receivedActions.filter((a) => a.action === "LIKE").length;
  const givenLikes = user.discoveryActions.filter((a) => a.action === "LIKE").length;
  const givenPasses = user.discoveryActions.filter((a) => a.action === "PASS").length;

  return (
    <section>
      <ScreenHeader
        eyebrow="Users"
        title=""
        leading={
          <button
            className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
            type="button"
            onClick={onBack}
            aria-label="Back to users"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {/* User header */}
        <div className="mb-5 rounded-3xl border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xl font-semibold">{user.displayName}</p>
              <p className="mt-0.5 text-sm text-[#666666]">{user.email}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user.role === "ADMIN" && (
                <span className="rounded-full bg-[#7c5cfc]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#7c5cfc]">
                  Admin
                </span>
              )}
              <StatusChip status={user.accountStatus} />
              <SubChip status={user.subscriptionStatus} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#666666] sm:grid-cols-4">
            <div>
              <span className="font-medium text-[#888888]">Joined</span>
              <p className="mt-0.5">{formatDate(user.createdAt)}</p>
            </div>
            <div>
              <span className="font-medium text-[#888888]">Sub expires</span>
              <p className="mt-0.5">{formatDate(user.subscriptionEndsAt)}</p>
            </div>
            <div>
              <span className="font-medium text-[#888888]">Age confirmed</span>
              <p className="mt-0.5">{formatDate(user.ageConfirmedAt)}</p>
            </div>
            {user.suspendedUntil && (
              <div>
                <span className="font-medium text-orange-600">Suspended until</span>
                <p className="mt-0.5 text-orange-700">{formatDate(user.suspendedUntil)}</p>
              </div>
            )}
          </div>
          {user.moderationReason && (
            <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
              <span className="font-semibold">Moderation reason:</span> {user.moderationReason}
            </p>
          )}
        </div>

        {/* Activity tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-black/[0.04] p-1">
          {activityTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition ${
                activeTab === tab.id ? "bg-[#0d0d0d] text-white shadow" : "text-[#666666]"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Profile tab */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Profile</p>
              {user.profile ? (
                <div className="grid gap-2 text-sm">
                  <Row label="City / State" value={[user.profile.city, user.profile.state].filter(Boolean).join(", ") || "—"} />
                  <Row label="Gender" value={user.profile.gender ?? "—"} />
                  <Row label="Sexuality" value={user.profile.sexuality ?? "—"} />
                  <Row label="Connection status" value={user.profile.connectionStatus ?? "—"} />
                  <Row label="Date of birth" value={formatDate(user.profile.birthDate)} />
                  <Row label="Photos" value={String(user.photoCount)} />
                  <Row label="Discoverable" value={user.profile.discoveryLive ? "Yes" : "No"} />
                  <Row label="Max distance" value={user.profile.maxDistanceKm === 0 ? "No limit" : `${user.profile.maxDistanceKm} km`} />
                  <Row label="Location updated" value={formatDate(user.profile.locationUpdatedAt)} />
                  {user.profile.bio && (
                    <div className="rounded-2xl bg-[#fafafa] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Bio</p>
                      <p className="mt-1 text-sm text-[#444444]">{user.profile.bio}</p>
                    </div>
                  )}
                  {user.profile.interests.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Interests</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {user.profile.interests.map((interest) => (
                          <span key={interest} className="rounded-full bg-[#fafafa] px-3 py-1 text-xs text-[#666666]">
                            {interest}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[#888888]">No profile set up.</p>
              )}
            </div>
          </div>
        )}

        {/* Discovery tab */}
        {activeTab === "discovery" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Likes given" value={givenLikes} icon={Heart} color="text-[#ff6b8a]" />
              <StatCard label="Passes given" value={givenPasses} icon={X} color="text-[#888888]" />
              <StatCard label="Likes received" value={unseenLikes} icon={Heart} color="text-[#18E299]" />
            </div>
            <ActivityList
              title="Actions given (recent 50)"
              empty="No discovery actions yet."
              items={user.discoveryActions.map((a) => ({
                key: `${a.targetId}-${a.createdAt}`,
                icon: a.action === "LIKE" ? Heart : X,
                iconCls: a.action === "LIKE" ? "text-[#ff6b8a]" : "text-[#888888]",
                primary: a.targetName,
                secondary: a.action === "LIKE" ? "Liked" : "Passed",
                time: a.createdAt,
              }))}
            />
            <ActivityList
              title="Actions received (recent 50)"
              empty="No received actions yet."
              items={user.receivedActions.map((a) => ({
                key: `${a.actorId}-${a.createdAt}`,
                icon: a.action === "LIKE" ? Heart : X,
                iconCls: a.action === "LIKE" ? "text-[#ff6b8a]" : "text-[#888888]",
                primary: a.actorName,
                secondary: a.action === "LIKE" ? "Liked them" : "Passed on them",
                time: a.createdAt,
              }))}
            />
          </div>
        )}

        {/* Matches tab */}
        {activeTab === "matches" && (
          <ActivityList
            title={`Matches (${user.matches.length})`}
            empty="No matches yet."
            items={user.matches.map((m) => ({
              key: m.id,
              icon: UsersRound,
              iconCls: m.status === "ACTIVE" ? "text-[#18E299]" : "text-[#888888]",
              primary: m.otherUserName,
              secondary: m.status,
              time: m.createdAt,
            }))}
          />
        )}

        {/* Social / Rooms tab */}
        {activeTab === "social" && (
          <ActivityList
            title={`Room memberships (${user.roomMemberships.length})`}
            empty="No room memberships yet."
            items={user.roomMemberships.map((r) => ({
              key: r.roomId,
              icon: MessageCircle,
              iconCls: "text-[#7c5cfc]",
              primary: r.roomName,
              secondary: r.roomCategory,
              time: r.joinedAt,
            }))}
          />
        )}

        {/* Events tab */}
        {activeTab === "events" && (
          <ActivityList
            title={`Tickets (${user.tickets.length})`}
            empty="No tickets yet."
            items={user.tickets.map((t) => ({
              key: t.id,
              icon: Ticket,
              iconCls: t.status === "PAID" || t.status === "CHECKED_IN" ? "text-[#18E299]" : "text-[#888888]",
              primary: t.eventTitle,
              secondary: `${t.code} · ${t.ticketTypeName} · ${formatNaira(t.priceKobo)} · ${t.status}`,
              time: t.createdAt,
            }))}
          />
        )}

        {/* Account tab */}
        {activeTab === "account" && (
          <div className="space-y-4">
            <ActivityList
              title={`Payments (${user.payments.length})`}
              empty="No payments yet."
              items={user.payments.map((p) => ({
                key: p.id,
                icon: CheckCircle2,
                iconCls: p.status === "SUCCESS" ? "text-[#18E299]" : "text-[#888888]",
                primary: `${p.purpose.replace("_", " ")} — ${formatNaira(p.amountKobo)}`,
                secondary: `${p.status} via ${p.provider}`,
                time: p.createdAt,
              }))}
            />
            <ActivityList
              title={`Moderation actions (${user.moderationActions.length})`}
              empty="No moderation actions."
              items={user.moderationActions.map((m, i) => ({
                key: String(i),
                icon: ShieldAlert,
                iconCls: "text-red-500",
                primary: `${m.action}${m.adminName ? ` by ${m.adminName}` : ""}`,
                secondary: [m.reason, m.expiresAt ? `expires ${formatDate(m.expiresAt)}` : null].filter(Boolean).join(" · ") || "—",
                time: m.createdAt,
              }))}
            />
            <ActivityList
              title={`Login sessions (last 20)`}
              empty="No sessions recorded."
              items={user.loginSessions.map((s, i) => ({
                key: String(i),
                icon: LogIn,
                iconCls: s.revokedAt ? "text-[#888888]" : "text-[#18E299]",
                primary: s.revokedAt ? "Session ended" : "Session active",
                secondary: `Expires ${formatDate(s.expiresAt)}${s.revokedAt ? ` · Revoked ${formatDate(s.revokedAt)}` : ""}`,
                time: s.createdAt,
              }))}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-[#888888]">{label}</span>
      <span className="text-right font-medium text-[#0d0d0d]">{value}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3 text-center shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
      <Icon className={`mx-auto size-5 ${color}`} aria-hidden="true" />
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="text-[11px] text-[#888888]">{label}</p>
    </div>
  );
}

function ActivityList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{
    key: string;
    icon: React.ElementType;
    iconCls: string;
    primary: string;
    secondary: string;
    time: string;
  }>;
}) {
  return (
    <div className="rounded-3xl border border-black/5 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
      <div className="border-b border-black/5 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">{title}</p>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-[#888888]">{empty}</p>
      ) : (
        <div className="divide-y divide-black/[0.04]">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key} className="flex items-center gap-3 px-4 py-3">
                <div className={`grid size-8 shrink-0 place-items-center rounded-full bg-black/[0.03]`}>
                  <Icon className={`size-4 ${item.iconCls}`} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#0d0d0d]">{item.primary}</p>
                  <p className="truncate text-xs text-[#888888]">{item.secondary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-[11px] text-[#999999]">
                  <Clock className="size-3" aria-hidden="true" />
                  {formatDateTime(item.time)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UsersTab({ token }: { token: string }) {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserActivity | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "">("");
  const [notice, setNotice] = useState<string | null>(null);
  const openingUser = openingUserId ? users.find((user) => user.id === openingUserId) : null;

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    setNotice(null);

    try {
      const response = await apiRequest<{ users: AdminUserSummary[] }>("/admin/users", {
        headers: authHeaders(token),
      });
      setUsers(response.users);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsLoadingUsers(false);
    }
  }, [token]);

  async function openUserDetail(userId: string) {
    setOpeningUserId(userId);
    setNotice(null);

    try {
      const response = await apiRequest<{ user: AdminUserActivity }>(`/admin/users/${userId}`, {
        headers: authHeaders(token),
      });
      setSelectedUser(response.user);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setOpeningUserId(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return users.filter((user) => {
      if (user.accountStatus === "DELETED") return false;
      if (statusFilter && user.accountStatus !== statusFilter) return false;
      if (q && !user.displayName.toLowerCase().includes(q) && !user.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, search, statusFilter]);

  if (selectedUser) {
    return <UserDetailView user={selectedUser} onBack={() => setSelectedUser(null)} />;
  }

  return (
    <section>
      <ScreenHeader
        eyebrow="Users"
        title=""
        action={
          <button
            className="inline-flex size-10 items-center justify-center rounded-full border border-black/8 text-[#666666]"
            onClick={() => void loadUsers()}
            disabled={isLoadingUsers}
            aria-label="Refresh users"
          >
            <RefreshCw className={`size-4 ${isLoadingUsers ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? (
          <p className="mb-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#888888]" aria-hidden="true" />
            <input
              className="h-11 w-full rounded-full border border-black/8 bg-white pl-10 pr-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-11 rounded-full border border-black/8 bg-white px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AccountStatus | "")}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DEACTIVATED">Deactivated</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="BANNED">Banned</option>
          </select>
        </div>

        {openingUser ? (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-black/5 bg-[#fafafa] p-3 text-sm font-medium text-[#666666]">
            <LoaderCircle className="size-4 animate-spin text-[#18E299]" aria-hidden="true" />
            Opening {openingUser.displayName}
          </div>
        ) : null}

        {isLoadingUsers ? (
          <LoadingState label="Loading users" className="min-h-80 rounded-3xl border border-black/5" />
        ) : filteredUsers.length === 0 ? (
          <div className="grid min-h-80 place-items-center rounded-3xl border border-black/5 p-6 text-center">
            <div>
              <UserRound className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No users found</h2>
              <p className="mt-2 text-sm text-[#666666]">Try adjusting the search or filter.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-4 border-b border-black/5 px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                Name ({filteredUsers.length})
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Email</p>
              <span className="size-4" aria-hidden="true" />
            </div>
            <div className="divide-y divide-black/[0.04]">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 text-left transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void openUserDetail(user.id)}
                  disabled={openingUserId !== null}
                >
                  <p className="truncate text-sm font-medium text-[#0d0d0d]">{user.displayName}</p>
                  <p className="truncate text-sm text-[#666666]">{user.email}</p>
                  {openingUserId === user.id ? (
                    <LoaderCircle className="size-4 animate-spin text-[#18E299]" aria-hidden="true" />
                  ) : (
                    <span className="size-4" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
