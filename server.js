//Crate by: Lutfizx
//No Developer: 6281330941251 (wa)
//no hapus credit

// server.js
const express = require("express");
const path = require("path");
const { WebSocketServer } = require("ws");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });

// roomId -> Set of clients
const rooms = new Map();

function joinRoom(ws, roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
  ws.roomId = roomId;
  ws.send(JSON.stringify({ type: "room-joined", roomId, peers: rooms.get(roomId).size }));
}

function leaveRoom(ws) {
  const { roomId } = ws;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) rooms.delete(roomId);
  // Beritahu peer lain bahwa user keluar
  room.forEach(peer => peer.send(JSON.stringify({ type: "peer-left" })));
}

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg.toString()); } catch { return; }

    // {type:'join', roomId}
    if (data.type === "join") {
      joinRoom(ws, data.roomId);
      // Beritahu peer lain ada user baru
      const room = rooms.get(data.roomId);
      room.forEach(peer => {
        if (peer !== ws) peer.send(JSON.stringify({ type: "peer-joined" }));
      });
      return;
    }

    // Relay offer/answer/ice ke peer lain di room yang sama
    const room = rooms.get(ws.roomId);
    if (!room) return;
    room.forEach(peer => {
      if (peer !== ws && peer.readyState === 1) {
        peer.send(JSON.stringify(data));
      }
    });
  });

  ws.on("close", () => leaveRoom(ws));
  ws.on("error", () => leaveRoom(ws));
});