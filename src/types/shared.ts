export interface RoomSettings {
  estimateOptions: number[];
  allowOthersToShowEstimates: boolean;
  allowOthersToDeleteEstimates: boolean;
  allowOthersToClearUsers: boolean;
  showTimer: boolean;
  timerDuration: number; // countdown duration in seconds (15, 30, 45)
  showAverage: boolean;
  showUserPresence: boolean;
}

export interface Participant {
  sessionId: string;
  displayName: string;
  isAdmin: boolean;
  isConnected: boolean;
  hasVoted: boolean;
}

export interface Vote {
  sessionId: string;
  value: number;
}

export interface RoomState {
  roomId: string;
  settings: RoomSettings;
  participants: Participant[];
  votes: Vote[];
  isRevealed: boolean;
  timerStartedAt: number | null;
}

export interface CreateRoomResponse {
  success: boolean;
  roomId?: string;
  adminToken?: string;
  sessionId?: string;
  error?: string;
}

export interface RoomCheckResult {
  exists: boolean;
  hasAdmin: boolean;
}

export interface ClientToServerEvents {
  "create-room": (
    payload: { displayName: string },
    callback: (response: CreateRoomResponse) => void
  ) => void;
  "join-as-admin": (
    payload: { roomId: string; displayName: string },
    callback: (response: CreateRoomResponse) => void
  ) => void;
  "check-room": (payload: { roomId: string }) => void;
  "join-room": (payload: {
    roomId: string;
    displayName: string;
    sessionId: string;
    adminToken?: string;
  }) => void;
  vote: (payload: {
    roomId: string;
    sessionId: string;
    value: number;
  }) => void;
  reveal: (payload: { roomId: string; adminToken?: string }) => void;
  reset: (payload: { roomId: string; adminToken?: string }) => void;
  "update-settings": (payload: {
    roomId: string;
    adminToken: string;
    settings: Partial<RoomSettings>;
  }) => void;
  "delete-estimate": (payload: {
    roomId: string;
    targetSessionId: string;
    adminToken?: string;
  }) => void;
  "clear-user": (payload: {
    roomId: string;
    targetSessionId: string;
    adminToken?: string;
  }) => void;
  "clear-all-participants": (payload: {
    roomId: string;
    adminToken: string;
  }) => void;
  "start-timer": (payload: { roomId: string; adminToken: string }) => void;
  "stop-timer": (payload: { roomId: string; adminToken: string }) => void;
}

export interface ServerToClientEvents {
  "room-state": (state: RoomState) => void;
  "room-check-result": (result: RoomCheckResult) => void;
  "participant-joined": (participant: Participant) => void;
  "participant-left": (sessionId: string) => void;
  "participant-updated": (participant: Participant) => void;
  "vote-cast": (payload: { sessionId: string; hasVoted: boolean }) => void;
  "votes-revealed": (votes: Vote[]) => void;
  "votes-reset": () => void;
  "settings-updated": (settings: RoomSettings) => void;
  "timer-started": (startedAt: number) => void;
  "timer-stopped": () => void;
  "admin-disconnected": () => void;
  "admin-reconnected": () => void;
  "room-closed": () => void;
  error: (payload: { message: string }) => void;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  estimateOptions: [1, 2, 3, 5, 8, 13, 20, 40],
  allowOthersToShowEstimates: false,
  allowOthersToDeleteEstimates: false,
  allowOthersToClearUsers: false,
  showTimer: true,
  timerDuration: 15,
  showAverage: true,
  showUserPresence: true,
};
