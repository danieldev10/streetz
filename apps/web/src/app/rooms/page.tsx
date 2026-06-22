"use client";

import { PublicRoute } from "@/components/app/public-route";
import { RoomsTab } from "@/features/rooms/rooms-tab";

export default function RoomsPage() {
  return (
    <PublicRoute activeTab="rooms">
      {({ token, user, cachedRooms, onRoomsLoaded, onRoomOpened, onNotificationsChanged, requestAuth }) => (
        <RoomsTab
          token={token}
          user={user}
          initialRooms={cachedRooms}
          onRoomsLoaded={onRoomsLoaded}
          onRoomOpened={onRoomOpened}
          onNotificationsChanged={onNotificationsChanged}
          onAuthRequired={requestAuth}
        />
      )}
    </PublicRoute>
  );
}
