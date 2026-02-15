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
});
