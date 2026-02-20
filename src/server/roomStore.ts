import redis from "./redisClient.js";
import {
  ServerRoom,
  ServerParticipant,
  SerializedRoom,
  SerializedParticipant,
} from "./types.js";
import { DEFAULT_SETTINGS } from "../types/shared.js";

const ROOM_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const USED_ID_TTL_SECONDS = 48 * 60 * 60; // 48 hours
const ROOM_KEY_PREFIX = "room:";
const USED_ID_PREFIX = "usedId:";

// In-memory only: socket mappings
const socketToRoom = new Map<
  string,
  { roomId: string; sessionId: string }
>();

// --- Serialization ---

export function serializeRoom(room: ServerRoom): string {
  const participants: Record<string, SerializedParticipant> = {};
  for (const [key, p] of room.participants) {
    participants[key] = {
      sessionId: p.sessionId,
      displayName: p.displayName,
      isAdmin: p.isAdmin,
      isConnected: p.isConnected,
      hasVoted: p.hasVoted,
    };
  }

  const votes: Record<string, number> = {};
  for (const [key, value] of room.votes) {
    votes[key] = value;
  }

  const serialized: SerializedRoom = {
    roomId: room.roomId,
    adminToken: room.adminToken,
    adminSessionId: room.adminSessionId,
    settings: room.settings,
    participants,
    votes,
    isRevealed: room.isRevealed,
    timerStartedAt: room.timerStartedAt,
    createdAt: room.createdAt,
    ttl: room.ttl,
    lastAccessedAt: Date.now(),
  };
  return JSON.stringify(serialized);
}

export function deserializeRoom(json: string): ServerRoom {
  const data: SerializedRoom = JSON.parse(json);

  const participants = new Map<string, ServerParticipant>();
  for (const [key, p] of Object.entries(data.participants)) {
    participants.set(key, {
      sessionId: p.sessionId,
      displayName: p.displayName,
      isAdmin: p.isAdmin,
      isConnected: p.isConnected, // preserved; set to false on reconnect if socketId is gone
      hasVoted: p.hasVoted,
      socketId: "", // ephemeral — will be set on reconnect
    });
  }

  const votes = new Map<string, number>();
  for (const [key, value] of Object.entries(data.votes)) {
    votes.set(key, value);
  }

  return {
    roomId: data.roomId,
    adminToken: data.adminToken,
    adminSessionId: data.adminSessionId,
    settings: data.settings,
    participants,
    votes,
    isRevealed: data.isRevealed,
    timerStartedAt: data.timerStartedAt,
    createdAt: data.createdAt,
    ttl: data.ttl,
    lastAccessedAt: data.lastAccessedAt,
  };
}

// --- ID Generation ---

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1 to avoid confusion
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
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

async function isRoomIdAvailable(id: string): Promise<boolean> {
  const [roomExists, usedExists] = await Promise.all([
    redis.exists(`${ROOM_KEY_PREFIX}${id}`),
    redis.exists(`${USED_ID_PREFIX}${id}`),
  ]);
  return roomExists === 0 && usedExists === 0;
}

// --- Room CRUD ---

export async function createRoom(
  adminSessionId: string
): Promise<ServerRoom> {
  let id: string;
  do {
    id = generateRoomId();
  } while (!(await isRoomIdAvailable(id)));

  const now = Date.now();
  const room: ServerRoom = {
    roomId: id,
    adminToken: generateToken(),
    adminSessionId,
    settings: { ...DEFAULT_SETTINGS },
    participants: new Map(),
    votes: new Map(),
    isRevealed: false,
    timerStartedAt: null,
    createdAt: now,
    ttl: ROOM_TTL_SECONDS * 1000,
    lastAccessedAt: now,
  };

  await redis.set(
    `${ROOM_KEY_PREFIX}${id}`,
    serializeRoom(room),
    "EX",
    ROOM_TTL_SECONDS
  );
  return room;
}

export async function createRoomWithId(
  roomId: string,
  adminSessionId: string
): Promise<ServerRoom | undefined> {
  if (!(await isRoomIdAvailable(roomId))) return undefined;

  const now = Date.now();
  const room: ServerRoom = {
    roomId,
    adminToken: generateToken(),
    adminSessionId,
    settings: { ...DEFAULT_SETTINGS },
    participants: new Map(),
    votes: new Map(),
    isRevealed: false,
    timerStartedAt: null,
    createdAt: now,
    ttl: ROOM_TTL_SECONDS * 1000,
    lastAccessedAt: now,
  };

  await redis.set(
    `${ROOM_KEY_PREFIX}${roomId}`,
    serializeRoom(room),
    "EX",
    ROOM_TTL_SECONDS
  );
  return room;
}

export async function getRoom(
  roomId: string
): Promise<ServerRoom | undefined> {
  const json = await redis.get(`${ROOM_KEY_PREFIX}${roomId}`);
  if (!json) return undefined;

  // Refresh TTL on access (30 days of inactivity)
  await redis.expire(`${ROOM_KEY_PREFIX}${roomId}`, ROOM_TTL_SECONDS);

  return deserializeRoom(json);
}

export async function saveRoom(room: ServerRoom): Promise<void> {
  room.lastAccessedAt = Date.now();
  await redis.set(
    `${ROOM_KEY_PREFIX}${room.roomId}`,
    serializeRoom(room),
    "EX",
    ROOM_TTL_SECONDS
  );
}

export async function deleteRoom(roomId: string): Promise<void> {
  await redis.del(`${ROOM_KEY_PREFIX}${roomId}`);
  // Block this ID for 48h so old links can't land in a new room
  await redis.set(
    `${USED_ID_PREFIX}${roomId}`,
    "1",
    "EX",
    USED_ID_TTL_SECONDS
  );
}

export async function roomHasAdmin(roomId: string): Promise<boolean> {
  const room = await getRoom(roomId);
  if (!room) return false;
  return Array.from(room.participants.values()).some(
    (p) => p.isAdmin && p.isConnected
  );
}

// --- Socket registration (in-memory, unchanged) ---

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
