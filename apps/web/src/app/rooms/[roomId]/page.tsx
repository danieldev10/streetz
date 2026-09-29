"use client";

import { useParams } from "next/navigation";
import { PublicRoute } from "@/components/app/public-route";
import { GuestRoomView } from "@/features/rooms/guest-room-view";
import { RoomsTab } from "@/features/rooms/rooms-tab";
import { RoomsProfileGate } from "../rooms-profile-gate";

export default function RoomThreadPage() {
  const params = useParams<{ roomId: string }>();

  return (
    <PublicRoute activeTab="events">
      {({ token, user, cachedRooms, onRoomsLoaded, onNotificationsChanged }) => token && user ? (
        <RoomsProfileGate token={token} user={user}>
          <RoomsTab
            key={params.roomId}
            token={token}
            user={user}
            initialRooms={cachedRooms}
            initialSelectedRoomId={params.roomId}
            onRoomsLoaded={onRoomsLoaded}
            onNotificationsChanged={onNotificationsChanged}
          />
        </RoomsProfileGate>
      ) : (
        <GuestRoomView key={params.roomId} roomId={params.roomId} />
      )}
    </PublicRoute>
  );
}
