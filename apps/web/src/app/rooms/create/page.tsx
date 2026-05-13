"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { RoomsTab } from "@/features/rooms/rooms-tab";

export default function CreateRoomPage() {
  return (
    <AuthenticatedRoute activeTab="rooms" adminOnly>
      {({ token, user, onRoomsLoaded, onRoomOpened, onNotificationsChanged }) => (
        <RoomsTab
          token={token}
          user={user}
          adminMode="create"
          onRoomsLoaded={onRoomsLoaded}
          onRoomOpened={onRoomOpened}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
