"use client";

import { useParams } from "next/navigation";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { RoomsTab } from "@/features/rooms/rooms-tab";

export default function EditRoomPage() {
  const params = useParams<{ roomId: string }>();

  return (
    <AuthenticatedRoute activeTab="rooms" adminOnly>
      {({ token, user, cachedRooms, onRoomsLoaded, onRoomOpened, onNotificationsChanged }) => (
        <RoomsTab
          key={params.roomId}
          token={token}
          user={user}
          initialRooms={cachedRooms}
          adminMode="edit"
          adminRoomId={params.roomId}
          onRoomsLoaded={onRoomsLoaded}
          onRoomOpened={onRoomOpened}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
