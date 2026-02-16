import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./src/server/socketHandlers";
import { startCleanupInterval } from "./src/server/roomStore";
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./src/types/shared";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

// Global error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Promise Rejection:", reason);
  console.error("Promise:", promise);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      pingInterval: 25000,
      pingTimeout: 20000,
    }
  );

  io.on("connection", (socket) => {
    registerSocketHandlers(io, socket);
  });

  startCleanupInterval();

  httpServer.listen(port, () => {
    console.log(`> Planning Poker ready on http://${hostname}:${port}`);
  });

  // Graceful shutdown for Docker / process managers
  const shutdown = () => {
    console.log("\n> Shutting down gracefully...");
    io.close(() => {
      httpServer.close(() => {
        console.log("> Server closed.");
        process.exit(0);
      });
    });
    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      console.error("> Forced shutdown after timeout.");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
});
