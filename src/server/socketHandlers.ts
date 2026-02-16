import { Server, Socket } from "socket.io";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomState,
  Vote,
  RoomSettings,
} from "../types/shared.js";
import { ServerParticipant } from "./types.js";
import {
  createRoom,
  createRoomWithId,
  getRoom,
  deleteRoom,
  registerSocket,
  unregisterSocket,
  getSocketInfo,
  roomHasAdmin,
} from "./roomStore.js";

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const ADMIN_DISCONNECT_GRACE_MS = 60_000; // 60 seconds

function buildRoomState(room: ReturnType<typeof getRoom>): RoomState | null {
  if (!room) return null;
  return {
    roomId: room.roomId,
    settings: room.settings,
    participants: Array.from(room.participants.values()).map(
      ({ socketId, ...rest }) => rest
    ),
    votes: room.isRevealed
      ? Array.from(room.votes.entries()).map(([sessionId, value]) => ({
          sessionId,
          value,
        }))
      : [],
    isRevealed: room.isRevealed,
    timerStartedAt: room.timerStartedAt,
  };
}

function isAdmin(
  room: ReturnType<typeof getRoom>,
  adminToken?: string
): boolean {
  return !!room && !!adminToken && room.adminToken === adminToken;
}

export function registerSocketHandlers(io: TypedServer, socket: TypedSocket) {
  // --- create-room ---
  socket.on("create-room", ({ displayName }, callback) => {
    const sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const room = createRoom(sessionId);

    const participant: ServerParticipant = {
      sessionId,
      displayName: displayName.trim().slice(0, 20),
      isAdmin: true,
      isConnected: true,
      hasVoted: false,
      socketId: socket.id,
    };

    room.participants.set(sessionId, participant);
    registerSocket(socket.id, room.roomId, sessionId);
    socket.join(room.roomId);

    callback({
      success: true,
      roomId: room.roomId,
      adminToken: room.adminToken,
      sessionId,
    });

    const state = buildRoomState(room);
    if (state) socket.emit("room-state", state);
  });

  // --- join-as-admin ---
  // Admin opens /room/ROOMID/admin: creates room if needed, or redirects to new room if admin exists
  socket.on("join-as-admin", ({ roomId, displayName }, callback) => {
    const sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let room = getRoom(roomId);

    if (room && roomHasAdmin(roomId)) {
      // Room exists and already has an admin → create a new room with a new ID
      room = createRoom(sessionId);
    } else if (room) {
      // Room exists but has no admin → take over as admin
      room.adminToken = require("crypto").randomBytes(16).toString("hex");
      room.adminSessionId = sessionId;
    } else {
      // Room doesn't exist → create it with requested ID
      room = createRoomWithId(roomId, sessionId);
      if (!room) {
        // ID is reserved (used recently), create with new ID
        room = createRoom(sessionId);
      }
    }

    const participant: ServerParticipant = {
      sessionId,
      displayName: displayName.trim().slice(0, 20),
      isAdmin: true,
      isConnected: true,
      hasVoted: false,
      socketId: socket.id,
    };

    room.participants.set(sessionId, participant);
    registerSocket(socket.id, room.roomId, sessionId);
    socket.join(room.roomId);

    callback({
      success: true,
      roomId: room.roomId,
      adminToken: room.adminToken,
      sessionId,
    });

    const adminState = buildRoomState(room);
    if (adminState) socket.emit("room-state", adminState);

    // Notify others if they were already in the room
    socket.to(room.roomId).emit("participant-joined", {
      sessionId: participant.sessionId,
      displayName: participant.displayName,
      isAdmin: participant.isAdmin,
      isConnected: participant.isConnected,
      hasVoted: participant.hasVoted,
    });
  });

  // --- check-room ---
  socket.on("check-room", ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) {
      socket.emit("room-check-result", { exists: false, hasAdmin: false });
      return;
    }

    const hasAdmin = roomHasAdmin(roomId);
    socket.emit("room-check-result", { exists: true, hasAdmin });
  });

  // --- join-room ---
  socket.on("join-room", ({ roomId, displayName, sessionId, adminToken }) => {
    const room = getRoom(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    const MAX_PARTICIPANTS = 10;
    const existing = room.participants.get(sessionId);

    // Check if this is an admin reconnect
    const isAdminReconnect = adminToken && room.adminToken === adminToken;

    // Reject participants if room has no admin (unless this IS the admin)
    if (!isAdminReconnect && !roomHasAdmin(roomId)) {
      socket.emit("error", { message: "Waiting for admin" });
      return;
    }

    // Reject new participants if room is full (reconnections are always allowed)
    if (!existing && room.participants.size >= MAX_PARTICIPANTS) {
      socket.emit("error", { message: "Room is full (max 10 participants)" });
      return;
    }

    if (existing) {
      // Reconnection
      existing.socketId = socket.id;
      existing.isConnected = true;
      existing.displayName = displayName.trim().slice(0, 20);

      // If admin is reconnecting, cancel the disconnect timer and notify participants
      if (existing.isAdmin && room.adminDisconnectTimer) {
        clearTimeout(room.adminDisconnectTimer);
        room.adminDisconnectTimer = null;

        // Clean up disconnected participants
        const disconnectedSessions: string[] = [];
        for (const [sid, p] of room.participants.entries()) {
          if (!p.isConnected && sid !== sessionId) {
            room.participants.delete(sid);
            room.votes.delete(sid);
            disconnectedSessions.push(sid);
          }
        }

        // Notify about removed participants
        for (const sid of disconnectedSessions) {
          io.to(roomId).emit("participant-left", sid);
        }

        // Notify all participants that admin is back
        io.to(roomId).emit("admin-reconnected");
      }
    } else {
      // Only treat as admin reconnect if the actual admin is disconnected
      const currentAdmin = Array.from(room.participants.values()).find((p) => p.isAdmin);
      const isAdminReconnect =
        adminToken &&
        room.adminToken === adminToken &&
        (!currentAdmin || !currentAdmin.isConnected);

      const participant: ServerParticipant = {
        sessionId,
        displayName: displayName.trim().slice(0, 20),
        isAdmin: !!isAdminReconnect,
        isConnected: true,
        hasVoted: room.votes.has(sessionId),
        socketId: socket.id,
      };

      room.participants.set(sessionId, participant);

      // If this is the admin reconnecting with a new session, cancel timer
      // and remove old admin participant
      if (isAdminReconnect && currentAdmin) {
        // Remove the old admin participant completely
        room.participants.delete(currentAdmin.sessionId);

        if (room.adminDisconnectTimer) {
          clearTimeout(room.adminDisconnectTimer);
          room.adminDisconnectTimer = null;

          // Clean up all disconnected participants
          const disconnectedSessions: string[] = [];
          for (const [sid, p] of room.participants.entries()) {
            if (!p.isConnected && sid !== sessionId) {
              room.participants.delete(sid);
              room.votes.delete(sid);
              disconnectedSessions.push(sid);
            }
          }

          // Notify about removed participants
          for (const sid of disconnectedSessions) {
            socket.to(roomId).emit("participant-left", sid);
          }

          // Notify all participants that admin is back
          io.to(roomId).emit("admin-reconnected");
        }
        room.adminSessionId = sessionId;

        // Notify others that the old admin left
        socket.to(roomId).emit("participant-left", currentAdmin.sessionId);
      }

      socket.to(roomId).emit("participant-joined", {
        sessionId: participant.sessionId,
        displayName: participant.displayName,
        isAdmin: participant.isAdmin,
        isConnected: participant.isConnected,
        hasVoted: participant.hasVoted,
      });
    }

    registerSocket(socket.id, roomId, sessionId);
    socket.join(roomId);

    const state = buildRoomState(room);
    if (state) socket.emit("room-state", state);
  });

  // --- vote ---
  socket.on("vote", ({ roomId, sessionId, value }) => {
    const room = getRoom(roomId);
    if (!room || room.isRevealed) return;

    const participant = room.participants.get(sessionId);
    if (!participant) return;

    room.votes.set(sessionId, value);
    participant.hasVoted = true;

    io.to(roomId).emit("vote-cast", { sessionId, hasVoted: true });
  });

  // --- reveal ---
  socket.on("reveal", ({ roomId, adminToken: token }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (!isAdmin(room, token) && !room.settings.allowOthersToShowEstimates) {
      socket.emit("error", { message: "Not authorized" });
      return;
    }

    room.isRevealed = true;
    const votes: Vote[] = Array.from(room.votes.entries()).map(
      ([sid, value]) => ({ sessionId: sid, value })
    );
    io.to(roomId).emit("votes-revealed", votes);
  });

  // --- reset ---
  socket.on("reset", ({ roomId, adminToken: token }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (!isAdmin(room, token) && !room.settings.allowOthersToDeleteEstimates) {
      socket.emit("error", { message: "Not authorized" });
      return;
    }

    room.votes.clear();
    room.isRevealed = false;
    room.timerStartedAt = null;
    for (const p of room.participants.values()) {
      p.hasVoted = false;
    }
    io.to(roomId).emit("votes-reset");
  });

  // --- update-settings ---
  socket.on("update-settings", ({ roomId, adminToken: token, settings }) => {
    const room = getRoom(roomId);
    if (!room || !isAdmin(room, token)) {
      socket.emit("error", { message: "Not authorized" });
      return;
    }

    // If estimate options changed, reset all votes
    if (
      settings.estimateOptions &&
      JSON.stringify(settings.estimateOptions) !==
        JSON.stringify(room.settings.estimateOptions)
    ) {
      room.votes.clear();
      room.isRevealed = false;
      for (const p of room.participants.values()) {
        p.hasVoted = false;
      }
    }

    room.settings = { ...room.settings, ...settings };
    io.to(roomId).emit("settings-updated", room.settings);

    // If options changed, also notify about vote reset
    if (settings.estimateOptions) {
      io.to(roomId).emit("votes-reset");
    }
  });

  // --- delete-estimate ---
  socket.on("delete-estimate", ({ roomId, targetSessionId, adminToken: token }) => {
    const room = getRoom(roomId);
    if (!room) return;

    // Allow users to delete their own estimate; otherwise require admin or permission
    const socketInfo = getSocketInfo(socket.id);
    const isOwnEstimate = socketInfo?.sessionId === targetSessionId;

    if (!isOwnEstimate && !isAdmin(room, token) && !room.settings.allowOthersToDeleteEstimates) {
      socket.emit("error", { message: "Not authorized" });
      return;
    }

    room.votes.delete(targetSessionId);
    const participant = room.participants.get(targetSessionId);
    if (participant) {
      participant.hasVoted = false;
    }
    io.to(roomId).emit("vote-cast", {
      sessionId: targetSessionId,
      hasVoted: false,
    });
  });

  // --- clear-user ---
  socket.on("clear-user", ({ roomId, targetSessionId, adminToken: token }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (!isAdmin(room, token) && !room.settings.allowOthersToClearUsers) {
      socket.emit("error", { message: "Not authorized" });
      return;
    }

    // Don't allow removing the admin
    const target = room.participants.get(targetSessionId);
    if (target?.isAdmin) {
      socket.emit("error", { message: "Cannot remove admin" });
      return;
    }

    room.participants.delete(targetSessionId);
    room.votes.delete(targetSessionId);
    io.to(roomId).emit("participant-left", targetSessionId);
  });

  // --- clear-all-participants ---
  socket.on("clear-all-participants", ({ roomId, adminToken: token }) => {
    const room = getRoom(roomId);
    if (!room || !isAdmin(room, token)) {
      socket.emit("error", { message: "Not authorized" });
      return;
    }

    // Remove all non-admin participants
    const toRemove: string[] = [];
    for (const [sid, p] of room.participants) {
      if (!p.isAdmin) {
        toRemove.push(sid);
      }
    }
    for (const sid of toRemove) {
      room.participants.delete(sid);
      room.votes.delete(sid);
      io.to(roomId).emit("participant-left", sid);
    }
  });

  // --- start-timer ---
  socket.on("start-timer", ({ roomId, adminToken: token }) => {
    const room = getRoom(roomId);
    if (!room || !isAdmin(room, token)) return;

    room.timerStartedAt = Date.now();
    io.to(roomId).emit("timer-started", room.timerStartedAt);
  });

  // --- stop-timer ---
  socket.on("stop-timer", ({ roomId, adminToken: token }) => {
    const room = getRoom(roomId);
    if (!room || !isAdmin(room, token)) return;

    room.timerStartedAt = null;
    io.to(roomId).emit("timer-stopped");
  });

  // --- disconnect ---
  socket.on("disconnect", () => {
    const info = unregisterSocket(socket.id);
    if (!info) return;

    const { roomId, sessionId } = info;
    const room = getRoom(roomId);
    if (!room) return;

    const participant = room.participants.get(sessionId);
    if (!participant) return;

    participant.isConnected = false;
    participant.socketId = "";

    // Notify others about presence change
    io.to(roomId).emit("participant-updated", {
      sessionId: participant.sessionId,
      displayName: participant.displayName,
      isAdmin: participant.isAdmin,
      isConnected: false,
      hasVoted: participant.hasVoted,
    });

    // If admin disconnected, notify participants and start grace period
    if (participant.isAdmin) {
      // Immediately notify all participants that admin is gone
      io.to(roomId).emit("admin-disconnected");

      room.adminDisconnectTimer = setTimeout(() => {
        // Before closing, remove all disconnected participants (cleanup)
        for (const [sid, p] of room.participants.entries()) {
          if (!p.isConnected) {
            room.participants.delete(sid);
          }
        }

        // Close the room
        io.to(roomId).emit("room-closed");
        deleteRoom(roomId);
        console.log(
          `Room ${roomId} closed: admin disconnected for ${ADMIN_DISCONNECT_GRACE_MS / 1000}s`
        );
      }, ADMIN_DISCONNECT_GRACE_MS);
    }
  });
}
