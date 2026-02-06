const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const httpServer = http.createServer(app);

// ================= SOCKET.IO CONFIG =================
// ✔ socket.io v2 client support (EIO=3)
// ✔ CORS fixed (NO wildcard with credentials)
// ✔ Render compatible (single port)
const io = new Server(httpServer, {
  allowEIO3: true,

  cors: {
    origin: [
      "http://localhost:5501",
      "http://127.0.0.1:5501",
      "https://multiplayer-app.game2wins.com",
      // future production domain yahan add kar sakte ho
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ================= GAME SERVER LOGIC =================
const VNServer = require("./lib/networking/server.js").VNServer;
const GameHost = require("./lib/networking/gamehost.js").GameHost;

const server = new VNServer();
new GameHost(server);

// ================= SOCKET HANDLER =================
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  server.onClientConnect(socket);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    server.onClientDisconnect(socket);
  });

  socket.on(server.MESSAGE_TAG, (data) => {
    server.onClientMessage(socket, data);
  });

  socket.on(server.PING_TAG, (data) => {
    server.onClientPing(socket, data);
  });

  socket.on(server.PING_REPLY_TAG, (data) => {
    server.onClientPingReply(socket, data);
  });
});

// ================= START SERVER =================
// Render requires process.env.PORT
// Local fallback = 1000
const PORT = process.env.PORT || 9560;

httpServer.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
