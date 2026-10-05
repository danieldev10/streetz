"use client";

import { useParams } from "next/navigation";
import { PublicRoute } from "@/components/app/public-route";
import { GuestRoomView } from "@/features/rooms/guest-room-view";
import { MemberRoomAccess } from "@/features/rooms/member-room-access";

export default function RoomThreadPage() {
  const params = useParams<{ roomId: string }>();

  return (
    <PublicRoute activeTab="events">
      {({ token, user, onRoomsLoaded, onNotificationsChanged }) => token && user ? (
          <MemberRoomAccess
            key={params.roomId}
            token={token}
            user={user}
            roomId={params.roomId}
            onRoomsLoaded={onRoomsLoaded}
            onNotificationsChanged={onNotificationsChanged}
          />
      ) : (
        <GuestRoomView key={params.roomId} roomId={params.roomId} />
      )}
    </PublicRoute>
  );
}
