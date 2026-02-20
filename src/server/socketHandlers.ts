import { Server, Socket } from "socket.io";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomState,
  Vote,
  RoomSettings,
} from "../types/shared.js";
import { ServerRoom, ServerParticipant } from "./types.js";
import {
  createRoom,
  createRoomWithId,
  getRoom,
  saveRoom,
  deleteRoom,
  registerSocket,
  unregisterSocket,
  getSocketInfo,
  roomHasAdmin,
} from "./roomStore.js";

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function buildRoomState(room: ServerRoom | undefined): RoomState | null {
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
  room: ServerRoom | undefined,
  adminToken?: string
): boolean {
  return !!room && !!adminToken && room.adminToken === adminToken;
}

export function registerSocketHandlers(io: TypedServer, socket: TypedSocket) {
  // --- create-room ---
  socket.on("create-room", async ({ displayName }, callback) => {
    const sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const room = await createRoom(sessionId);

    const participant: ServerParticipant = {
      sessionId,
      displayName: displayName.trim().slice(0, 20),
      isAdmin: true,
      isConnected: true,
      hasVoted: false,
      socketId: socket.id,
    };

    room.participants.set(sessionId, participant);
    await saveRoom(room);
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
  socket.on("join-as-admin", async ({ roomId, displayName }, callback) => {
    const sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let room = await getRoom(roomId);

    if (room && await roomHasAdmin(roomId)) {
      // Room exists and already has an admin → create a new room with a new ID
      room = await createRoom(sessionId);
    } else if (room) {
      // Room exists but has no admin → take over as admin
      room.adminToken = require("crypto").randomBytes(16).toString("hex");
      room.adminSessionId = sessionId;
    } else {
      // Room doesn't exist → create it with requested ID
      room = await createRoomWithId(roomId, sessionId);
      if (!room) {
        // ID is reserved (used recently), create with new ID
        room = await createRoom(sessionId);
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
    await saveRoom(room);
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
  socket.on("check-room", async ({ roomId }) => {
    const room = await getRoom(roomId);
    if (!room) {
      socket.emit("room-check-result", { exists: false, hasAdmin: false });
      return;
    }

    // Join the socket.io room so the participant can receive admin-reconnected events
    socket.join(roomId);

    const adminPresent = await roomHasAdmin(roomId);
    socket.emit("room-check-result", { exists: true, hasAdmin: adminPresent });
  });

  // --- join-room ---
  socket.on("join-room", async ({ roomId, displayName, sessionId, adminToken }) => {
    const room = await getRoom(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    const MAX_PARTICIPANTS = 10;
    const existing = room.participants.get(sessionId);

    // Check if this is an admin reconnect
    const isAdminReconnect = adminToken && room.adminToken === adminToken;

    // Reject participants if room has no admin (unless this IS the admin)
    if (!isAdminReconnect && !(await roomHasAdmin(roomId))) {
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

      // If admin is reconnecting, clean up and notify participants
      if (existing.isAdmin) {
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
      const isAdminReconnectNew =
        adminToken &&
        room.adminToken === adminToken &&
        (!currentAdmin || !currentAdmin.isConnected);

      const participant: ServerParticipant = {
        sessionId,
        displayName: displayName.trim().slice(0, 20),
        isAdmin: !!isAdminReconnectNew,
        isConnected: true,
        hasVoted: room.votes.has(sessionId),
        socketId: socket.id,
      };

      room.participants.set(sessionId, participant);

      // If this is the admin reconnecting with a new session,
      // remove old admin participant and clean up
      if (isAdminReconnectNew && currentAdmin) {
        // Remove the old admin participant completely
        room.participants.delete(currentAdmin.sessionId);

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

    await saveRoom(room);
    registerSocket(socket.id, roomId, sessionId);
    socket.join(roomId);

    const state = buildRoomState(room);
    if (state) socket.emit("room-state", state);
  });

  // --- vote ---
  socket.on("vote", async ({ roomId, sessionId, value }) => {
    const room = await getRoom(roomId);
    if (!room || room.isRevealed) return;

    const participant = room.participants.get(sessionId);
    if (!participant) return;

    room.votes.set(sessionId, value);
    participant.hasVoted = true;
    await saveRoom(room);

    io.to(roomId).emit("vote-cast", { sessionId, hasVoted: true });
  });

  // --- reveal ---
  socket.on("reveal", async ({ roomId, adminToken: token }) => {
    const room = await getRoom(roomId);
    if (!room) return;
    if (!isAdmin(room, token) && !room.settings.allowOthersToShowEstimates) {
      socket.emit("error", { message: "Not authorized" });
      return;
    }

    room.isRevealed = true;
    await saveRoom(room);

    const votes: Vote[] = Array.from(room.votes.entries()).map(
      ([sid, value]) => ({ sessionId: sid, value })
    );
    io.to(roomId).emit("votes-revealed", votes);
  });

  // --- reset ---
  socket.on("reset", async ({ roomId, adminToken: token }) => {
    const room = await getRoom(roomId);
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
    await saveRoom(room);
    io.to(roomId).emit("votes-reset");
  });

  // --- update-settings ---
  socket.on("update-settings", async ({ roomId, adminToken: token, settings }) => {
    const room = await getRoom(roomId);
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
    await saveRoom(room);
    io.to(roomId).emit("settings-updated", room.settings);

    // If options changed, also notify about vote reset
    if (settings.estimateOptions) {
      io.to(roomId).emit("votes-reset");
    }
  });

  // --- delete-estimate ---
  socket.on("delete-estimate", async ({ roomId, targetSessionId, adminToken: token }) => {
    const room = await getRoom(roomId);
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
    await saveRoom(room);
    io.to(roomId).emit("vote-cast", {
      sessionId: targetSessionId,
      hasVoted: false,
    });
  });

  // --- clear-user ---
  socket.on("clear-user", async ({ roomId, targetSessionId, adminToken: token }) => {
    const room = await getRoom(roomId);
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
    await saveRoom(room);
    io.to(roomId).emit("participant-left", targetSessionId);
  });

  // --- clear-all-participants ---
  socket.on("clear-all-participants", async ({ roomId, adminToken: token }) => {
    const room = await getRoom(roomId);
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
    await saveRoom(room);
  });

  // --- start-timer ---
  socket.on("start-timer", async ({ roomId, adminToken: token }) => {
    const room = await getRoom(roomId);
    if (!room || !isAdmin(room, token)) return;

    room.timerStartedAt = Date.now();
    await saveRoom(room);
    io.to(roomId).emit("timer-started", room.timerStartedAt);
  });

  // --- stop-timer ---
  socket.on("stop-timer", async ({ roomId, adminToken: token }) => {
    const room = await getRoom(roomId);
    if (!room || !isAdmin(room, token)) return;

    room.timerStartedAt = null;
    await saveRoom(room);
    io.to(roomId).emit("timer-stopped");
  });

  // --- disconnect ---
  socket.on("disconnect", async () => {
    const info = unregisterSocket(socket.id);
    if (!info) return;

    const { roomId, sessionId } = info;
    const room = await getRoom(roomId);
    if (!room) return;

    const participant = room.participants.get(sessionId);
    if (!participant) return;

    participant.isConnected = false;
    participant.socketId = "";
    await saveRoom(room);

    // Notify others about presence change
    io.to(roomId).emit("participant-updated", {
      sessionId: participant.sessionId,
      displayName: participant.displayName,
      isAdmin: participant.isAdmin,
      isConnected: false,
      hasVoted: participant.hasVoted,
    });

    // If admin disconnected, notify participants
    if (participant.isAdmin) {
      io.to(roomId).emit("admin-disconnected");
    }
  });
}
