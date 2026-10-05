"use client";

import { useEffect, useState } from "react";
import type { MemberAppRenderProps } from "@/components/app/member-app";
import { RoomsProfileGate } from "@/app/rooms/rooms-profile-gate";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { ChatRoom, StreetzUser } from "@/lib/types";
import { GuestRoomView } from "./guest-room-view";
import { RoomsLoadingView } from "./rooms-loading-view";
import { RoomsTab } from "./rooms-tab";

export function MemberRoomAccess({ roomId, token, user, onRoomsLoaded, onNotificationsChanged }: {
  roomId: string;
  token: string;
  user: StreetzUser;
} & Pick<MemberAppRenderProps, "onRoomsLoaded" | "onNotificationsChanged">) {
  const [rooms, setRooms] = useState<ChatRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ rooms: ChatRoom[] }>("/rooms", { headers: authHeaders(token) })
      .then((response) => { if (!cancelled) setRooms(response.rooms); })
      .catch((caught) => { if (!cancelled) setError(getUserErrorMessage(caught)); });
    return () => { cancelled = true; };
  }, [token, roomId]);

  if (error) return <p role="alert" className="px-5 py-8 text-sm text-ink-600">{error}</p>;
  if (!rooms) return <RoomsLoadingView />;
  if (!rooms.some((room) => room.id === roomId)) {
    return <GuestRoomView roomId={roomId} isMemberPreview />;
  }

  return (
    <RoomsProfileGate token={token} user={user}>
      <RoomsTab token={token} user={user} initialRooms={rooms} initialSelectedRoomId={roomId}
        onRoomsLoaded={onRoomsLoaded} onNotificationsChanged={onNotificationsChanged} />
    </RoomsProfileGate>
  );
}
