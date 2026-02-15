import { ServerRoom } from "./types";
import { DEFAULT_SETTINGS } from "../types/shared";

const rooms = new Map<string, ServerRoom>();
const ROOM_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Track used room IDs for 48h to prevent old links landing in new rooms
const usedRoomIds = new Map<string, number>(); // roomId -> expiry timestamp

// Map socketId -> { roomId, sessionId } for disconnect handling
const socketToRoom = new Map<string, { roomId: string; sessionId: string }>();

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1 to avoid confusion
  let id: string;
  do {
    id = "";
    for (let i = 0; i < 12; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(id) || usedRoomIds.has(id));
  return id;
}

function generateToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export function createRoom(adminSessionId: string): ServerRoom {
  const room: ServerRoom = {
    roomId: generateRoomId(),
    adminToken: generateToken(),
    adminSessionId,
    settings: { ...DEFAULT_SETTINGS },
    participants: new Map(),
    votes: new Map(),
    isRevealed: false,
    timerStartedAt: null,
    createdAt: Date.now(),
    ttl: ROOM_TTL,
    adminDisconnectTimer: null,
  };

  rooms.set(room.roomId, room);
  return room;
}

/**
 * Create a room with a specific ID. Used when participants open a room link
 * and the room doesn't exist yet (admin hasn't joined yet).
 * Returns null if the ID is already taken or reserved.
 */
export function createRoomWithId(roomId: string, adminSessionId: string): ServerRoom | null {
  if (rooms.has(roomId) || usedRoomIds.has(roomId)) return null;

  const room: ServerRoom = {
    roomId,
    adminToken: generateToken(),
    adminSessionId,
    settings: { ...DEFAULT_SETTINGS },
    participants: new Map(),
    votes: new Map(),
    isRevealed: false,
    timerStartedAt: null,
    createdAt: Date.now(),
    ttl: ROOM_TTL,
    adminDisconnectTimer: null,
  };

  rooms.set(roomId, room);
  return room;
}

export function roomHasAdmin(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  return Array.from(room.participants.values()).some((p) => p.isAdmin);
}

export function getRoom(roomId: string): ServerRoom | undefined {
  return rooms.get(roomId);
}

export function deleteRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (room?.adminDisconnectTimer) {
    clearTimeout(room.adminDisconnectTimer);
  }
  rooms.delete(roomId);
  // Block this ID for 48h so old links can't land in a new room
  usedRoomIds.set(roomId, Date.now() + 48 * 60 * 60 * 1000);
}

export function registerSocket(
  socketId: string,
  roomId: string,
  sessionId: string
): void {
  socketToRoom.set(socketId, { roomId, sessionId });
}

export function getSocketInfo(socketId: string): {
  roomId: string;
  sessionId: string;
} | undefined {
  return socketToRoom.get(socketId);
}

export function unregisterSocket(socketId: string): {
  roomId: string;
  sessionId: string;
} | undefined {
  const info = socketToRoom.get(socketId);
  if (info) {
    socketToRoom.delete(socketId);
  }
  return info;
}

export function startCleanupInterval(): void {
  setInterval(() => {
    const now = Date.now();
    // Clean expired rooms
    for (const [roomId, room] of rooms) {
      if (now - room.createdAt > room.ttl) {
        if (room.adminDisconnectTimer) {
          clearTimeout(room.adminDisconnectTimer);
        }
        rooms.delete(roomId);
        usedRoomIds.set(roomId, now + 48 * 60 * 60 * 1000);
        console.log(`Room ${roomId} expired and removed`);
      }
    }
    // Clean expired used-ID reservations
    for (const [id, expiry] of usedRoomIds) {
      if (now > expiry) {
        usedRoomIds.delete(id);
      }
    }
  }, 5 * 60 * 1000);
}
