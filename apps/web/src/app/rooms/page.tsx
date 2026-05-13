"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { RoomsTab } from "@/features/rooms/rooms-tab";

export default function RoomsPage() {
  return (
    <AuthenticatedRoute activeTab="rooms">
      {({ token, user, onRoomsLoaded, onRoomOpened, onNotificationsChanged }) => (
        <RoomsTab
          token={token}
          user={user}
          onRoomsLoaded={onRoomsLoaded}
          onRoomOpened={onRoomOpened}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
