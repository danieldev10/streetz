"use client";

import { useParams } from "next/navigation";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { RoomsTab } from "@/features/rooms/rooms-tab";

export default function RoomThreadPage() {
  const params = useParams<{ roomId: string }>();

  return (
    <AuthenticatedRoute activeTab="rooms">
      {({ token, user, cachedRooms, onRoomsLoaded, onRoomOpened, onNotificationsChanged }) => (
        <RoomsTab
          key={params.roomId}
          token={token}
          user={user}
          initialRooms={cachedRooms}
          initialSelectedRoomId={params.roomId}
          onRoomsLoaded={onRoomsLoaded}
          onRoomOpened={onRoomOpened}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
