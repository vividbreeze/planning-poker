import { describe, it, expect } from "vitest";
import { serializeRoom, deserializeRoom } from "../roomStore";
import { ServerRoom, ServerParticipant } from "../types";
import { DEFAULT_SETTINGS } from "../../types/shared";

// Mock Redis — serialization functions don't use Redis directly,
// but roomStore imports redisClient at module level
vi.mock("../redisClient", () => {
  const RedisMock = require("ioredis-mock");
  return { default: new RedisMock() };
});

function createTestRoom(overrides?: Partial<ServerRoom>): ServerRoom {
  return {
    roomId: "TESTROOM1234",
    adminToken: "abc123token",
    adminSessionId: "admin-session-1",
    settings: { ...DEFAULT_SETTINGS },
    participants: new Map(),
    votes: new Map(),
    isRevealed: false,
    timerStartedAt: null,
    createdAt: Date.now(),
    ttl: 30 * 24 * 60 * 60 * 1000,
    lastAccessedAt: Date.now(),
    adminDisconnectTimer: null,
    ...overrides,
  };
}

describe("Serialization", () => {
  describe("serializeRoom / deserializeRoom roundtrip", () => {
    it("should serialize and deserialize an empty room correctly", () => {
      const room = createTestRoom();
      const json = serializeRoom(room);
      const restored = deserializeRoom(json);

      expect(restored.roomId).toBe(room.roomId);
      expect(restored.adminToken).toBe(room.adminToken);
      expect(restored.adminSessionId).toBe(room.adminSessionId);
      expect(restored.settings).toEqual(room.settings);
      expect(restored.participants.size).toBe(0);
      expect(restored.votes.size).toBe(0);
      expect(restored.isRevealed).toBe(false);
      expect(restored.timerStartedAt).toBeNull();
      expect(restored.createdAt).toBe(room.createdAt);
      expect(restored.ttl).toBe(room.ttl);
    });

    it("should preserve room data through roundtrip", () => {
      const room = createTestRoom({
        isRevealed: true,
        timerStartedAt: 1700000000000,
      });

      room.participants.set("s1", {
        sessionId: "s1",
        displayName: "Admin",
        isAdmin: true,
        isConnected: true,
        hasVoted: true,
        socketId: "socket-abc",
      });
      room.participants.set("s2", {
        sessionId: "s2",
        displayName: "Player",
        isAdmin: false,
        isConnected: true,
        hasVoted: false,
        socketId: "socket-def",
      });
      room.votes.set("s1", 5);
      room.votes.set("s2", 8);

      const json = serializeRoom(room);
      const restored = deserializeRoom(json);

      expect(restored.participants.size).toBe(2);
      expect(restored.votes.size).toBe(2);
      expect(restored.votes.get("s1")).toBe(5);
      expect(restored.votes.get("s2")).toBe(8);
      expect(restored.isRevealed).toBe(true);
      expect(restored.timerStartedAt).toBe(1700000000000);
    });
  });

  describe("socketId is excluded from serialization", () => {
    it("should set socketId to empty string after deserialization", () => {
      const room = createTestRoom();
      room.participants.set("s1", {
        sessionId: "s1",
        displayName: "Admin",
        isAdmin: true,
        isConnected: true,
        hasVoted: false,
        socketId: "live-socket-123",
      });

      const json = serializeRoom(room);
      const restored = deserializeRoom(json);

      const participant = restored.participants.get("s1");
      expect(participant).toBeDefined();
      expect(participant!.socketId).toBe("");
    });
  });

  describe("isConnected is preserved after deserialization", () => {
    it("should preserve isConnected status for all participants", () => {
      const room = createTestRoom();
      room.participants.set("s1", {
        sessionId: "s1",
        displayName: "Admin",
        isAdmin: true,
        isConnected: true,
        hasVoted: false,
        socketId: "socket-1",
      });
      room.participants.set("s2", {
        sessionId: "s2",
        displayName: "Player",
        isAdmin: false,
        isConnected: false,
        hasVoted: true,
        socketId: "",
      });

      const json = serializeRoom(room);
      const restored = deserializeRoom(json);

      expect(restored.participants.get("s1")!.isConnected).toBe(true);
      expect(restored.participants.get("s2")!.isConnected).toBe(false);
    });
  });

  describe("adminDisconnectTimer is not serialized", () => {
    it("should set adminDisconnectTimer to null after deserialization", () => {
      const room = createTestRoom({
        adminDisconnectTimer: setTimeout(() => {}, 1000) as any,
      });

      const json = serializeRoom(room);
      const restored = deserializeRoom(json);

      expect(restored.adminDisconnectTimer).toBeNull();

      // Clean up the timer
      if (room.adminDisconnectTimer) {
        clearTimeout(room.adminDisconnectTimer);
      }
    });
  });

  describe("participant data preservation", () => {
    it("should preserve displayName, isAdmin, hasVoted through roundtrip", () => {
      const room = createTestRoom();
      room.participants.set("admin-1", {
        sessionId: "admin-1",
        displayName: "Room Admin",
        isAdmin: true,
        isConnected: true,
        hasVoted: true,
        socketId: "s1",
      });
      room.participants.set("player-1", {
        sessionId: "player-1",
        displayName: "Player One",
        isAdmin: false,
        isConnected: false,
        hasVoted: false,
        socketId: "",
      });

      const json = serializeRoom(room);
      const restored = deserializeRoom(json);

      const admin = restored.participants.get("admin-1");
      expect(admin!.displayName).toBe("Room Admin");
      expect(admin!.isAdmin).toBe(true);
      expect(admin!.hasVoted).toBe(true);

      const player = restored.participants.get("player-1");
      expect(player!.displayName).toBe("Player One");
      expect(player!.isAdmin).toBe(false);
      expect(player!.hasVoted).toBe(false);
    });
  });

  describe("settings preservation", () => {
    it("should preserve custom settings through roundtrip", () => {
      const room = createTestRoom();
      room.settings = {
        ...DEFAULT_SETTINGS,
        estimateOptions: [1, 2, 3, 5, 8],
        timerDuration: 30,
        allowOthersToShowEstimates: true,
        showAverage: false,
      };

      const json = serializeRoom(room);
      const restored = deserializeRoom(json);

      expect(restored.settings.estimateOptions).toEqual([1, 2, 3, 5, 8]);
      expect(restored.settings.timerDuration).toBe(30);
      expect(restored.settings.allowOthersToShowEstimates).toBe(true);
      expect(restored.settings.showAverage).toBe(false);
    });
  });

  describe("Maps are correctly converted", () => {
    it("should convert participants Map to Object and back", () => {
      const room = createTestRoom();
      room.participants.set("key-1", {
        sessionId: "key-1",
        displayName: "User 1",
        isAdmin: false,
        isConnected: true,
        hasVoted: false,
        socketId: "s1",
      });

      const json = serializeRoom(room);
      const parsed = JSON.parse(json);

      // In JSON, participants should be a plain object
      expect(typeof parsed.participants).toBe("object");
      expect(parsed.participants["key-1"]).toBeDefined();
      expect(parsed.participants["key-1"].sessionId).toBe("key-1");
      // socketId should NOT be in the serialized data
      expect(parsed.participants["key-1"].socketId).toBeUndefined();
    });

    it("should convert votes Map to Object and back", () => {
      const room = createTestRoom();
      room.votes.set("s1", 5);
      room.votes.set("s2", 13);

      const json = serializeRoom(room);
      const parsed = JSON.parse(json);

      expect(typeof parsed.votes).toBe("object");
      expect(parsed.votes["s1"]).toBe(5);
      expect(parsed.votes["s2"]).toBe(13);

      // Verify roundtrip
      const restored = deserializeRoom(json);
      expect(restored.votes instanceof Map).toBe(true);
      expect(restored.votes.get("s1")).toBe(5);
      expect(restored.votes.get("s2")).toBe(13);
    });
  });
});
