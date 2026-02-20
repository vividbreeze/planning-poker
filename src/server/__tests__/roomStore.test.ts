import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Redis before importing roomStore
vi.mock("../redisClient", () => {
  const RedisMock = require("ioredis-mock");
  return { default: new RedisMock() };
});

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
} from "../roomStore";
import redis from "../redisClient";

beforeEach(async () => {
  // Flush mock Redis between tests
  await redis.flushall();
});

describe("roomStore", () => {
  describe("createRoom", () => {
    it("should create a room with a unique 12-char ID", async () => {
      const room = await createRoom("admin-session-1");
      expect(room.roomId).toHaveLength(12);
      expect(room.roomId).toMatch(/^[A-Z2-9]+$/); // no I, O, 0, 1
      expect(room.adminSessionId).toBe("admin-session-1");
      expect(room.adminToken).toHaveLength(32);
      expect(room.participants.size).toBe(0);
      expect(room.votes.size).toBe(0);
      expect(room.isRevealed).toBe(false);
      expect(room.timerStartedAt).toBeNull();
      expect(room.lastAccessedAt).toBeGreaterThan(0);
    });

    it("should generate unique room IDs", async () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const room = await createRoom(`session-${i}`);
        ids.add(room.roomId);
      }
      expect(ids.size).toBe(50);
    });

    it("should store the room retrievable via getRoom", async () => {
      const room = await createRoom("s1");
      const retrieved = await getRoom(room.roomId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.roomId).toBe(room.roomId);
      expect(retrieved!.adminToken).toBe(room.adminToken);
    });
  });

  describe("createRoomWithId", () => {
    it("should create a room with a specific ID", async () => {
      const room = await createRoomWithId("TESTROOM1234", "admin-1");
      expect(room).toBeDefined();
      expect(room!.roomId).toBe("TESTROOM1234");
      expect(room!.adminSessionId).toBe("admin-1");
    });

    it("should return undefined if room ID already exists", async () => {
      const room1 = await createRoom("admin-1");
      const room2 = await createRoomWithId(room1.roomId, "admin-2");
      expect(room2).toBeUndefined();
    });

    it("should return undefined if room ID is reserved (deleted recently)", async () => {
      const room = await createRoom("admin-del");
      const roomId = room.roomId;
      await deleteRoom(roomId);
      const room2 = await createRoomWithId(roomId, "admin-new");
      expect(room2).toBeUndefined();
    });
  });

  describe("deleteRoom", () => {
    it("should remove room from store", async () => {
      const room = await createRoom("admin-x");
      await deleteRoom(room.roomId);
      expect(await getRoom(room.roomId)).toBeUndefined();
    });
  });

  describe("roomHasAdmin", () => {
    it("should return false for room without participants", async () => {
      const room = await createRoom("s1");
      expect(await roomHasAdmin(room.roomId)).toBe(false);
    });

    it("should return true when room has connected admin participant", async () => {
      const room = await createRoom("s1");
      room.participants.set("s1", {
        sessionId: "s1",
        displayName: "Admin",
        isAdmin: true,
        isConnected: true,
        hasVoted: false,
        socketId: "sock1",
      });
      await saveRoom(room);
      expect(await roomHasAdmin(room.roomId)).toBe(true);
    });

    it("should return false when room has no admin participant", async () => {
      const room = await createRoom("s1");
      room.participants.set("s2", {
        sessionId: "s2",
        displayName: "User",
        isAdmin: false,
        isConnected: true,
        hasVoted: false,
        socketId: "sock2",
      });
      await saveRoom(room);
      expect(await roomHasAdmin(room.roomId)).toBe(false);
    });

    it("should return false when admin is disconnected", async () => {
      const room = await createRoom("s1");
      room.participants.set("s1", {
        sessionId: "s1",
        displayName: "Admin",
        isAdmin: true,
        isConnected: false,
        hasVoted: false,
        socketId: "",
      });
      await saveRoom(room);
      expect(await roomHasAdmin(room.roomId)).toBe(false);
    });

    it("should return false for non-existent room", async () => {
      expect(await roomHasAdmin("NONEXISTENT1")).toBe(false);
    });
  });

  describe("saveRoom", () => {
    it("should persist room mutations", async () => {
      const room = await createRoom("s1");
      room.isRevealed = true;
      room.votes.set("s1", 5);
      room.participants.set("s1", {
        sessionId: "s1",
        displayName: "Admin",
        isAdmin: true,
        isConnected: true,
        hasVoted: true,
        socketId: "sock1",
      });
      await saveRoom(room);

      const retrieved = await getRoom(room.roomId);
      expect(retrieved!.isRevealed).toBe(true);
      expect(retrieved!.votes.get("s1")).toBe(5);
      expect(retrieved!.participants.get("s1")!.displayName).toBe("Admin");
    });

    it("should update lastAccessedAt on save", async () => {
      const room = await createRoom("s1");
      const originalAccess = room.lastAccessedAt;

      // Small delay to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 10));
      await saveRoom(room);

      const retrieved = await getRoom(room.roomId);
      expect(retrieved!.lastAccessedAt).toBeGreaterThanOrEqual(originalAccess);
    });
  });

  describe("socket registration", () => {
    it("should register and retrieve socket info", () => {
      registerSocket("socket-1", "room-1", "session-1");
      const info = getSocketInfo("socket-1");
      expect(info).toEqual({ roomId: "room-1", sessionId: "session-1" });
    });

    it("should unregister socket and return info", () => {
      registerSocket("socket-2", "room-2", "session-2");
      const info = unregisterSocket("socket-2");
      expect(info).toEqual({ roomId: "room-2", sessionId: "session-2" });
      expect(getSocketInfo("socket-2")).toBeUndefined();
    });

    it("should return undefined for unknown socket", () => {
      expect(getSocketInfo("unknown")).toBeUndefined();
      expect(unregisterSocket("unknown")).toBeUndefined();
    });
  });

  describe("default settings", () => {
    it("should have correct default settings", async () => {
      const room = await createRoom("s1");
      expect(room.settings.estimateOptions).toEqual([1, 2, 3, 5, 8, 13, 20, 40]);
      expect(room.settings.showTimer).toBe(true);
      expect(room.settings.timerDuration).toBe(15);
      expect(room.settings.showAverage).toBe(true);
      expect(room.settings.allowOthersToShowEstimates).toBe(false);
      expect(room.settings.allowOthersToDeleteEstimates).toBe(false);
      expect(room.settings.allowOthersToClearUsers).toBe(false);
    });
  });

  describe("Redis persistence", () => {
    it("should store room data in Redis", async () => {
      const room = await createRoom("s1");
      const key = `room:${room.roomId}`;
      const data = await redis.get(key);
      expect(data).toBeTruthy();
      const parsed = JSON.parse(data!);
      expect(parsed.roomId).toBe(room.roomId);
    });

    it("should set reserved ID in Redis after deletion", async () => {
      const room = await createRoom("s1");
      const roomId = room.roomId;
      await deleteRoom(roomId);

      const reserved = await redis.get(`usedId:${roomId}`);
      expect(reserved).toBe("1");
    });
  });
});
