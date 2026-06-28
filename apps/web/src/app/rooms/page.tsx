"use client";

import { PublicRoute } from "@/components/app/public-route";
import { RoomsTab } from "@/features/rooms/rooms-tab";
import { RoomsProfileGate } from "./rooms-profile-gate";

export default function RoomsPage() {
  return (
    <PublicRoute activeTab="rooms">
      {({ token, user, cachedRooms, onRoomsLoaded, onRoomOpened, onNotificationsChanged, requestAuth }) => (
        <RoomsProfileGate token={token} user={user}>
          <RoomsTab
            token={token}
            user={user}
            initialRooms={cachedRooms}
            onRoomsLoaded={onRoomsLoaded}
            onRoomOpened={onRoomOpened}
            onNotificationsChanged={onNotificationsChanged}
            onAuthRequired={requestAuth}
          />
        </RoomsProfileGate>
      )}
    </PublicRoute>
  );
}
