import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoom,
  createRoomWithId,
  getRoom,
  deleteRoom,
  registerSocket,
  unregisterSocket,
  getSocketInfo,
  roomHasAdmin,
} from "../roomStore";

// Reset the in-memory store between tests by importing fresh
// Since roomStore uses module-level Maps, we test against the same instance

describe("roomStore", () => {
  describe("createRoom", () => {
    it("should create a room with a unique 12-char ID", () => {
      const room = createRoom("admin-session-1");
      expect(room.roomId).toHaveLength(12);
      expect(room.roomId).toMatch(/^[A-Z2-9]+$/); // no I, O, 0, 1
      expect(room.adminSessionId).toBe("admin-session-1");
      expect(room.adminToken).toHaveLength(32);
      expect(room.participants.size).toBe(0);
      expect(room.votes.size).toBe(0);
      expect(room.isRevealed).toBe(false);
      expect(room.timerStartedAt).toBeNull();
    });

    it("should generate unique room IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const room = createRoom(`session-${i}`);
        ids.add(room.roomId);
      }
      expect(ids.size).toBe(50);
    });

    it("should store the room retrievable via getRoom", () => {
      const room = createRoom("s1");
      const retrieved = getRoom(room.roomId);
      expect(retrieved).toBe(room);
    });
  });

  describe("createRoomWithId", () => {
    it("should create a room with a specific ID", () => {
      const room = createRoomWithId("TESTROOM1234", "admin-1");
      expect(room).not.toBeNull();
      expect(room!.roomId).toBe("TESTROOM1234");
      expect(room!.adminSessionId).toBe("admin-1");
    });

    it("should return null if room ID already exists", () => {
      const room1 = createRoom("admin-1");
      const room2 = createRoomWithId(room1.roomId, "admin-2");
      expect(room2).toBeNull();
    });

    it("should return null if room ID is reserved (deleted recently)", () => {
      const room = createRoom("admin-del");
      const roomId = room.roomId;
      deleteRoom(roomId);
      const room2 = createRoomWithId(roomId, "admin-new");
      expect(room2).toBeNull();
    });
  });

  describe("deleteRoom", () => {
    it("should remove room from store", () => {
      const room = createRoom("admin-x");
      deleteRoom(room.roomId);
      expect(getRoom(room.roomId)).toBeUndefined();
    });
  });

  describe("roomHasAdmin", () => {
    it("should return false for room without participants", () => {
      const room = createRoom("s1");
      expect(roomHasAdmin(room.roomId)).toBe(false);
    });

    it("should return true when room has admin participant", () => {
      const room = createRoom("s1");
      room.participants.set("s1", {
        sessionId: "s1",
        displayName: "Admin",
        isAdmin: true,
        isConnected: true,
        hasVoted: false,
        socketId: "sock1",
      });
      expect(roomHasAdmin(room.roomId)).toBe(true);
    });

    it("should return false when room has no admin participant", () => {
      const room = createRoom("s1");
      room.participants.set("s2", {
        sessionId: "s2",
        displayName: "User",
        isAdmin: false,
        isConnected: true,
        hasVoted: false,
        socketId: "sock2",
      });
      expect(roomHasAdmin(room.roomId)).toBe(false);
    });

    it("should return false for non-existent room", () => {
      expect(roomHasAdmin("NONEXISTENT1")).toBe(false);
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
    it("should have correct default settings", () => {
      const room = createRoom("s1");
      expect(room.settings.estimateOptions).toEqual([1, 2, 3, 5, 8, 13, 20, 40]);
      expect(room.settings.showTimer).toBe(true);
      expect(room.settings.timerDuration).toBe(15);
      expect(room.settings.showAverage).toBe(true);
      expect(room.settings.allowOthersToShowEstimates).toBe(false);
      expect(room.settings.allowOthersToDeleteEstimates).toBe(false);
      expect(room.settings.allowOthersToClearUsers).toBe(false);
    });
  });
});
