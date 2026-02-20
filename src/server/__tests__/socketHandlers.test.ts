import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as ioc, Socket as ClientSocket } from "socket.io-client";

// Mock Redis before importing socketHandlers
vi.mock("../redisClient", () => {
  const RedisMock = require("ioredis-mock");
  return { default: new RedisMock() };
});

import { registerSocketHandlers } from "../socketHandlers";
import redis from "../redisClient";
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../types/shared";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let httpServer: ReturnType<typeof createServer>;
let ioServer: Server;
let port: number;

function createClient(): TestClient {
  return ioc(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  }) as unknown as TestClient;
}

function waitFor(client: TestClient, event: string): Promise<any> {
  return new Promise((resolve) => {
    (client as any).once(event, (...args: any[]) =>
      resolve(args.length === 1 ? args[0] : args)
    );
  });
}

// Helper: create room and wait for room-state in one go
async function createRoomAndWait(client: TestClient, displayName: string) {
  const statePromise = waitFor(client, "room-state");
  const response = await new Promise<any>((resolve) => {
    (client as any).emit("create-room", { displayName }, resolve);
  });
  const state = await statePromise;
  return { response, state };
}

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      httpServer = createServer();
      ioServer = new Server(httpServer);
      ioServer.on("connection", (socket) => {
        registerSocketHandlers(ioServer as any, socket as any);
      });
      httpServer.listen(0, () => {
        port = (httpServer.address() as any).port;
        resolve();
      });
    })
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      ioServer.close();
      httpServer.close(() => resolve());
    })
);

beforeEach(async () => {
  // Flush mock Redis between tests
  await redis.flushall();
});

describe("Socket Handlers", () => {
  describe("create-room", () => {
    it("should create a room and return roomId, adminToken, sessionId", async () => {
      const client = createClient();
      await waitFor(client, "connect");

      const { response, state } = await createRoomAndWait(client, "Admin");

      expect(response.success).toBe(true);
      expect(response.roomId).toHaveLength(12);
      expect(response.adminToken).toBeTruthy();
      expect(response.sessionId).toBeTruthy();

      expect(state.roomId).toBe(response.roomId);
      expect(state.participants).toHaveLength(1);
      expect(state.participants[0].displayName).toBe("Admin");
      expect(state.participants[0].isAdmin).toBe(true);

      client.close();
    });

    it("should trim and truncate display name", async () => {
      const client = createClient();
      await waitFor(client, "connect");

      const { state } = await createRoomAndWait(
        client,
        "  A Very Long Name That Exceeds Twenty Characters  "
      );

      expect(state.participants[0].displayName).toBe("A Very Long Name Tha");
      expect(state.participants[0].displayName.length).toBeLessThanOrEqual(20);

      client.close();
    });
  });

  describe("join-room", () => {
    it("should allow a participant to join an existing room", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const participant = createClient();
      await waitFor(participant, "connect");

      const joinedPromise = waitFor(admin, "participant-joined");
      const statePromise = waitFor(participant, "room-state");

      (participant as any).emit("join-room", {
        roomId: createResp.roomId,
        displayName: "Player1",
        sessionId: "p1-session",
      });

      const joined = await joinedPromise;
      expect(joined.displayName).toBe("Player1");
      expect(joined.isAdmin).toBe(false);

      const state = await statePromise;
      expect(state.participants).toHaveLength(2);

      admin.close();
      participant.close();
    });

    it("should reject joining a non-existent room", async () => {
      const client = createClient();
      await waitFor(client, "connect");

      const errorPromise = waitFor(client, "error");

      (client as any).emit("join-room", {
        roomId: "NONEXISTENT1",
        displayName: "Player",
        sessionId: "s1",
      });

      const error = await errorPromise;
      expect(error.message).toBe("Room not found");

      client.close();
    });

    it("should enforce max 10 participants", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const clients: TestClient[] = [];
      for (let i = 0; i < 9; i++) {
        const c = createClient();
        await waitFor(c, "connect");
        const sp = waitFor(c, "room-state");
        (c as any).emit("join-room", {
          roomId: createResp.roomId,
          displayName: `P${i}`,
          sessionId: `s-max-${i}-${Date.now()}`,
        });
        await sp;
        clients.push(c);
      }

      const extra = createClient();
      await waitFor(extra, "connect");

      const errorPromise = waitFor(extra, "error");
      (extra as any).emit("join-room", {
        roomId: createResp.roomId,
        displayName: "Extra",
        sessionId: `s-extra-${Date.now()}`,
      });

      const error = await errorPromise;
      expect(error.message).toBe("Room is full (max 10 participants)");

      admin.close();
      extra.close();
      clients.forEach((c) => c.close());
    });
  });

  describe("voting flow", () => {
    it("should handle vote → reveal → reset cycle", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const player = createClient();
      await waitFor(player, "connect");
      const pStateP = waitFor(player, "room-state");
      (player as any).emit("join-room", {
        roomId: createResp.roomId,
        displayName: "Player",
        sessionId: "player-vote-1",
      });
      await pStateP;

      // Admin votes
      const voteCastP = waitFor(player, "vote-cast");
      (admin as any).emit("vote", {
        roomId: createResp.roomId,
        sessionId: createResp.sessionId,
        value: 5,
      });
      const voteCast = await voteCastP;
      expect(voteCast.hasVoted).toBe(true);

      // Player votes
      const adminVoteP = waitFor(admin, "vote-cast");
      (player as any).emit("vote", {
        roomId: createResp.roomId,
        sessionId: "player-vote-1",
        value: 8,
      });
      await adminVoteP;

      // Reveal
      const revealP = waitFor(player, "votes-revealed");
      (admin as any).emit("reveal", {
        roomId: createResp.roomId,
        adminToken: createResp.adminToken,
      });
      const votes = await revealP;
      expect(votes).toHaveLength(2);
      const values = votes.map((v: any) => v.value).sort();
      expect(values).toEqual([5, 8]);

      // Reset
      const resetP = waitFor(player, "votes-reset");
      (admin as any).emit("reset", {
        roomId: createResp.roomId,
        adminToken: createResp.adminToken,
      });
      await resetP;

      admin.close();
      player.close();
    });

    it("should allow a user to toggle their vote (unvote)", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      // Vote
      const votedP = waitFor(admin, "vote-cast");
      (admin as any).emit("vote", {
        roomId: createResp.roomId,
        sessionId: createResp.sessionId,
        value: 3,
      });
      const voted = await votedP;
      expect(voted.hasVoted).toBe(true);

      // Unvote
      const unvotedP = waitFor(admin, "vote-cast");
      (admin as any).emit("delete-estimate", {
        roomId: createResp.roomId,
        targetSessionId: createResp.sessionId,
      });
      const unvoted = await unvotedP;
      expect(unvoted.hasVoted).toBe(false);

      admin.close();
    });
  });

  describe("admin permissions", () => {
    it("should reject reveal from non-admin when not allowed", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const player = createClient();
      await waitFor(player, "connect");
      const sp = waitFor(player, "room-state");
      (player as any).emit("join-room", {
        roomId: createResp.roomId,
        displayName: "Player",
        sessionId: "p-perm-reveal",
      });
      await sp;

      const errorP = waitFor(player, "error");
      (player as any).emit("reveal", { roomId: createResp.roomId });
      const error = await errorP;
      expect(error.message).toBe("Not authorized");

      admin.close();
      player.close();
    });

    it("should reject reset from non-admin when not allowed", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const player = createClient();
      await waitFor(player, "connect");
      const sp = waitFor(player, "room-state");
      (player as any).emit("join-room", {
        roomId: createResp.roomId,
        displayName: "Player",
        sessionId: "p-perm-reset",
      });
      await sp;

      const errorP = waitFor(player, "error");
      (player as any).emit("reset", { roomId: createResp.roomId });
      const error = await errorP;
      expect(error.message).toBe("Not authorized");

      admin.close();
      player.close();
    });
  });

  describe("settings", () => {
    it("should allow admin to update settings", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const settingsP = waitFor(admin, "settings-updated");
      (admin as any).emit("update-settings", {
        roomId: createResp.roomId,
        adminToken: createResp.adminToken,
        settings: { timerDuration: 30 },
      });
      const settings = await settingsP;
      expect(settings.timerDuration).toBe(30);
      expect(settings.showTimer).toBe(true);

      admin.close();
    });

    it("should reject settings update from non-admin", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const player = createClient();
      await waitFor(player, "connect");
      const sp = waitFor(player, "room-state");
      (player as any).emit("join-room", {
        roomId: createResp.roomId,
        displayName: "Player",
        sessionId: "p-settings-reject",
      });
      await sp;

      const errorP = waitFor(player, "error");
      (player as any).emit("update-settings", {
        roomId: createResp.roomId,
        adminToken: "wrong-token",
        settings: { timerDuration: 45 },
      });
      const error = await errorP;
      expect(error.message).toBe("Not authorized");

      admin.close();
      player.close();
    });
  });

  describe("clear-all-participants", () => {
    it("should remove all non-admin participants", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const player = createClient();
      await waitFor(player, "connect");
      const sp = waitFor(player, "room-state");
      (player as any).emit("join-room", {
        roomId: createResp.roomId,
        displayName: "Player",
        sessionId: "p-clear-all",
      });
      await sp;

      const leftP = waitFor(admin, "participant-left");
      (admin as any).emit("clear-all-participants", {
        roomId: createResp.roomId,
        adminToken: createResp.adminToken,
      });
      const leftSessionId = await leftP;
      expect(leftSessionId).toBe("p-clear-all");

      admin.close();
      player.close();
    });
  });

  describe("join-as-admin", () => {
    it("should create room when it doesn't exist", async () => {
      const client = createClient();
      await waitFor(client, "connect");

      const stateP = waitFor(client, "room-state");
      const response = await new Promise<any>((resolve) => {
        (client as any).emit(
          "join-as-admin",
          { roomId: "JADMINTEST12", displayName: "Boss" },
          resolve
        );
      });
      await stateP;

      expect(response.success).toBe(true);
      expect(response.roomId).toBe("JADMINTEST12");

      client.close();
    });

    it("should create new room when requested room already has admin", async () => {
      const admin1 = createClient();
      await waitFor(admin1, "connect");
      const { response: createResp } = await createRoomAndWait(admin1, "Admin1");

      const admin2 = createClient();
      await waitFor(admin2, "connect");

      const stateP = waitFor(admin2, "room-state");
      const response = await new Promise<any>((resolve) => {
        (admin2 as any).emit(
          "join-as-admin",
          { roomId: createResp.roomId, displayName: "Admin2" },
          resolve
        );
      });
      await stateP;

      expect(response.success).toBe(true);
      expect(response.roomId).not.toBe(createResp.roomId);
      expect(response.roomId).toHaveLength(12);

      admin1.close();
      admin2.close();
    });
  });

  describe("timer", () => {
    it("should start and stop timer", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const startP = waitFor(admin, "timer-started");
      (admin as any).emit("start-timer", {
        roomId: createResp.roomId,
        adminToken: createResp.adminToken,
      });
      const startedAt = await startP;
      expect(typeof startedAt).toBe("number");
      expect(startedAt).toBeGreaterThan(0);

      const stopP = waitFor(admin, "timer-stopped");
      (admin as any).emit("stop-timer", {
        roomId: createResp.roomId,
        adminToken: createResp.adminToken,
      });
      await stopP;

      admin.close();
    });
  });

  describe("admin disconnect", () => {
    it("should keep room in Redis after admin disconnects", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      // Verify room exists
      const dataBefore = await redis.get(`room:${createResp.roomId}`);
      expect(dataBefore).toBeTruthy();

      // Disconnect admin
      admin.close();

      // Wait a moment for disconnect to be processed
      await new Promise((r) => setTimeout(r, 200));

      // Room should still exist in Redis (no timer deletes it)
      const dataAfter = await redis.get(`room:${createResp.roomId}`);
      expect(dataAfter).toBeTruthy();
      const parsed = JSON.parse(dataAfter!);
      expect(parsed.roomId).toBe(createResp.roomId);
    });

    it("should emit admin-disconnected to participants when admin leaves", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const player = createClient();
      await waitFor(player, "connect");
      const sp = waitFor(player, "room-state");
      (player as any).emit("join-room", {
        roomId: createResp.roomId,
        displayName: "Player",
        sessionId: "p-admin-disc",
      });
      await sp;

      // Listen for admin-disconnected on participant
      const adminDiscP = waitFor(player, "admin-disconnected");

      // Disconnect admin
      admin.close();

      // Participant should receive admin-disconnected event
      await adminDiscP;

      player.close();
    });

    it("should allow admin to reconnect after disconnect", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      // Disconnect admin
      admin.close();
      await new Promise((r) => setTimeout(r, 200));

      // Reconnect with new socket but same admin token
      const admin2 = createClient();
      await waitFor(admin2, "connect");

      const stateP = waitFor(admin2, "room-state");
      (admin2 as any).emit("join-room", {
        roomId: createResp.roomId,
        displayName: "Admin",
        sessionId: createResp.sessionId,
        adminToken: createResp.adminToken,
      });
      const state = await stateP;

      expect(state.roomId).toBe(createResp.roomId);
      expect(state.participants.some((p: any) => p.isAdmin && p.isConnected)).toBe(true);

      admin2.close();
    });
  });

  describe("Redis persistence integration", () => {
    it("should persist votes in Redis", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      // Vote
      const votedP = waitFor(admin, "vote-cast");
      (admin as any).emit("vote", {
        roomId: createResp.roomId,
        sessionId: createResp.sessionId,
        value: 5,
      });
      await votedP;

      // Verify data is in Redis
      const data = await redis.get(`room:${createResp.roomId}`);
      expect(data).toBeTruthy();
      const parsed = JSON.parse(data!);
      expect(parsed.votes[createResp.sessionId]).toBe(5);

      admin.close();
    });

    it("should persist settings changes in Redis", async () => {
      const admin = createClient();
      await waitFor(admin, "connect");
      const { response: createResp } = await createRoomAndWait(admin, "Admin");

      const settingsP = waitFor(admin, "settings-updated");
      (admin as any).emit("update-settings", {
        roomId: createResp.roomId,
        adminToken: createResp.adminToken,
        settings: { timerDuration: 60, showAverage: false },
      });
      await settingsP;

      // Verify data is in Redis
      const data = await redis.get(`room:${createResp.roomId}`);
      const parsed = JSON.parse(data!);
      expect(parsed.settings.timerDuration).toBe(60);
      expect(parsed.settings.showAverage).toBe(false);

      admin.close();
    });
  });
});
