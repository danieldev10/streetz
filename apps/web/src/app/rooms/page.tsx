"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { RoomsTab } from "@/features/rooms/rooms-tab";

export default function RoomsPage() {
  return (
    <AuthenticatedRoute activeTab="rooms">
      {({ token, user, cachedRooms, onRoomsLoaded, onRoomOpened, onNotificationsChanged }) => (
        <RoomsTab
          token={token}
          user={user}
          initialRooms={cachedRooms}
          onRoomsLoaded={onRoomsLoaded}
          onRoomOpened={onRoomOpened}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
