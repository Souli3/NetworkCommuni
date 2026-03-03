import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { networkInterfaces, hostname } from "os";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";

const dev = process.env.NODE_ENV !== "production";
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = "0.0.0.0";

// Ensure uploads directory exists
mkdirSync("uploads", { recursive: true });

// Initialize shared state (survives HMR)
if (!globalThis.__networkCommuni) {
  globalThis.__networkCommuni = {
    devices: new Map(),
    messages: [],
    files: new Map(),
  };
}

const state = globalThis.__networkCommuni;

// Random device names
const adjectives = [
  "Swift", "Bright", "Cool", "Bold", "Calm", "Keen", "Wild", "Soft",
  "Warm", "Fast", "Smart", "Brave", "Neat", "Wise", "True", "Fair",
];
const animals = [
  "Fox", "Owl", "Cat", "Bear", "Wolf", "Hawk", "Deer", "Lynx",
  "Puma", "Crow", "Seal", "Wren", "Dove", "Hare", "Frog", "Moth",
];
const colors = [
  "#4fc3f7", "#81c784", "#ffb74d", "#f06292", "#ba68c8",
  "#4dd0e1", "#aed581", "#ff8a65", "#9575cd", "#e57373",
  "#64b5f6", "#dce775", "#ffd54f", "#7986cb", "#a1887f",
];

function randomDevice() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const color = colors[Math.floor(Math.random() * colors.length)];
  return { name: `${adj} ${animal}`, color };
}

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

// Cleanup old uploaded files every 30 minutes (delete files older than 2 hours)
const UPLOADS_DIR = join(process.cwd(), "uploads");
const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 min
const MAX_FILE_AGE = 2 * 60 * 60 * 1000; // 2 hours

function cleanupUploads() {
  try {
    const files = readdirSync(UPLOADS_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = join(UPLOADS_DIR, file);
      const stat = statSync(filePath);
      if (now - stat.mtimeMs > MAX_FILE_AGE) {
        unlinkSync(filePath);
        state.files.delete(file);
      }
    }
  } catch {
    // uploads dir may not exist yet
  }
}

setInterval(cleanupUploads, CLEANUP_INTERVAL);

// Initialize Next.js
const app = next({ dev, hostname: HOST, port: PORT });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Socket.IO server
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8, // 100MB for socket messages
  });

  // Store io on global for API routes to use
  globalThis.__networkCommuni.io = io;

  io.on("connection", (socket) => {
    const { name, color } = randomDevice();
    const device = {
      id: socket.id,
      name,
      color,
      connectedAt: Date.now(),
    };

    state.devices.set(socket.id, device);

    // Send current state to new client
    socket.emit("init", {
      device,
      devices: Array.from(state.devices.values()),
      messages: state.messages.slice(-100), // Last 100 messages
      localIP: getLocalIP(),
      port: PORT,
    });

    // Notify others
    const joinMsg = {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "system",
      content: `${name} a rejoint le canal`,
      sender: device,
      timestamp: Date.now(),
    };
    state.messages.push(joinMsg);
    io.emit("device:join", { device, message: joinMsg });

    // Handle text messages
    socket.on("message:send", (data) => {
      const sender = state.devices.get(socket.id);
      if (!sender) return;

      const msg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: data.type || "text",
        content: data.content,
        sender,
        timestamp: Date.now(),
      };
      state.messages.push(msg);
      io.emit("message:new", msg);
    });

    // Handle clipboard share
    socket.on("clipboard:share", (data) => {
      const sender = state.devices.get(socket.id);
      if (!sender) return;

      const msg = {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: "clipboard",
        content: data.content,
        sender,
        timestamp: Date.now(),
      };
      state.messages.push(msg);
      io.emit("message:new", msg);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      const device = state.devices.get(socket.id);
      if (device) {
        const leaveMsg = {
          id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "system",
          content: `${device.name} a quitté le canal`,
          sender: device,
          timestamp: Date.now(),
        };
        state.messages.push(leaveMsg);
        state.devices.delete(socket.id);
        io.emit("device:leave", { deviceId: socket.id, message: leaveMsg });
      }
    });
  });

  httpServer.listen(PORT, HOST, () => {
    const localIP = getLocalIP();
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║         NetworkCommuni ready!             ║`);
    console.log(`  ╠══════════════════════════════════════════╣`);
    console.log(`  ║  Local:   http://localhost:${PORT}          ║`);
    console.log(`  ║  Network: http://${localIP}:${PORT}     ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
  });
});
