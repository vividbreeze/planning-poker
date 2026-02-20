import { RoomSettings, Participant } from "../types/shared.js";

export interface ServerParticipant extends Participant {
  socketId: string;
}

export interface ServerRoom {
  roomId: string;
  adminToken: string;
  adminSessionId: string;
  settings: RoomSettings;
  participants: Map<string, ServerParticipant>;
  votes: Map<string, number>;
  isRevealed: boolean;
  timerStartedAt: number | null;
  createdAt: number;
  ttl: number;
  lastAccessedAt: number;
  adminDisconnectTimer: ReturnType<typeof setTimeout> | null;
}

// --- Serialization types for Redis persistence ---

export interface SerializedParticipant {
  sessionId: string;
  displayName: string;
  isAdmin: boolean;
  isConnected: boolean;
  hasVoted: boolean;
  // socketId intentionally omitted — ephemeral per connection
}

export interface SerializedRoom {
  roomId: string;
  adminToken: string;
  adminSessionId: string;
  settings: RoomSettings;
  participants: Record<string, SerializedParticipant>;
  votes: Record<string, number>;
  isRevealed: boolean;
  timerStartedAt: number | null;
  createdAt: number;
  ttl: number;
  lastAccessedAt: number;
}
