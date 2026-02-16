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
  adminDisconnectTimer: ReturnType<typeof setTimeout> | null;
}
