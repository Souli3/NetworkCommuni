import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { networkInterfaces, hostname as osHostname } from "os";
import {
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { open as fsOpen, writeFile as fsWriteFile } from "fs/promises";
import { join, resolve } from "path";

const dev = process.env.NODE_ENV !== "production";
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = "0.0.0.0";
const UPLOADS_DIR = join(process.cwd(), "uploads");

// Sanitize fileId to prevent path traversal (e.g. ../../etc/passwd)
function sanitizeFileId(fileId) {
  // Remove any path separators and parent directory references
  const sanitized = fileId.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
  // Double-check: resolved path must stay within UPLOADS_DIR
  const resolved = resolve(UPLOADS_DIR, sanitized);
  if (!resolved.startsWith(UPLOADS_DIR)) {
    return null;
  }
  return sanitized;
}

// Ensure uploads directory exists
mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Shared state (survives HMR) ────────────────────────────────
if (!globalThis.__networkCommuni) {
  globalThis.__networkCommuni = {
    devices: new Map(),
    messages: [],
    files: new Map(),
    uploadSessions: new Map(),
  };
}

const state = globalThis.__networkCommuni;
if (!state.uploadSessions) state.uploadSessions = new Map();

// ─── Random device names ────────────────────────────────────────
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

// ─── Cleanup old uploads (every 30 min, delete files > 2h) ─────
const CLEANUP_INTERVAL = 30 * 60 * 1000;
const MAX_FILE_AGE = 2 * 60 * 60 * 1000;

function cleanupUploads() {
  try {
    const files = readdirSync(UPLOADS_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = join(UPLOADS_DIR, file);
      const s = statSync(filePath);
      if (now - s.mtimeMs > MAX_FILE_AGE) {
        unlinkSync(filePath);
        state.files.delete(file);
      }
    }
    // Clean abandoned upload sessions (no new chunk in 30+ minutes)
    for (const [fileId, session] of state.uploadSessions) {
      const filePath = join(UPLOADS_DIR, fileId);
      try {
        const s = statSync(filePath);
        if (now - s.mtimeMs > CLEANUP_INTERVAL) {
          state.uploadSessions.delete(fileId);
          if (!state.files.has(fileId)) {
            try { unlinkSync(filePath); } catch {}
          }
        }
      } catch {
        state.uploadSessions.delete(fileId);
      }
    }
  } catch {
    // uploads dir may not exist yet
  }
}
setInterval(cleanupUploads, CLEANUP_INTERVAL);

// ─── Chunk upload handler (raw HTTP, bypasses Next.js) ──────────
// URL pattern: PUT /api/upload/:fileId/:chunkIndex
// Metadata in headers, raw binary body

async function handleChunkUpload(req, res) {
  try {
    const urlPath = req.url.split("?")[0];
    const parts = urlPath.split("/");
    // parts = ['', 'api', 'upload', fileId, chunkIndex]
    const rawFileId = decodeURIComponent(parts[3]);
    const fileId = sanitizeFileId(rawFileId);
    const chunkIndex = parseInt(parts[4], 10);

    const fileName = decodeURIComponent(req.headers["x-file-name"] || "");
    const fileSize = parseInt(req.headers["x-file-size"] || "0", 10);
    const totalChunks = parseInt(req.headers["x-total-chunks"] || "0", 10);
    const chunkSize = parseInt(req.headers["x-chunk-size"] || "0", 10);
    const mimeType = req.headers["x-mime-type"] || "application/octet-stream";
    const senderId = req.headers["x-sender-id"] || "";

    if (!fileId || !fileName || isNaN(chunkIndex) || isNaN(totalChunks)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request" }));
      return;
    }

    // Max 50 GB
    if (fileSize > 50 * 1024 * 1024 * 1024) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "File too large (max 50 Go)" }));
      return;
    }

    const filePath = join(UPLOADS_DIR, fileId);
    const position = chunkIndex * chunkSize;

    // Read request body
    const bodyChunks = [];
    let bodySize = 0;
    const maxBodySize = 20 * 1024 * 1024; // 20MB safety limit per chunk

    for await (const chunk of req) {
      bodySize += chunk.length;
      if (bodySize > maxBodySize) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Chunk too large" }));
        return;
      }
      bodyChunks.push(chunk);
    }

    const buffer = Buffer.concat(bodyChunks);

    // Create file if it doesn't exist (atomic, handles race conditions)
    try {
      await fsWriteFile(filePath, Buffer.alloc(0), { flag: "wx" });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }

    // Write chunk at correct position (sparse file, parallel-safe)
    const fh = await fsOpen(filePath, "r+");
    try {
      await fh.write(buffer, 0, buffer.length, position);
    } finally {
      await fh.close();
    }

    // Track upload session
    let session = state.uploadSessions.get(fileId);
    if (!session) {
      session = {
        fileName,
        fileSize,
        mimeType,
        senderId,
        totalChunks,
        chunkSize,
        receivedChunks: new Set(),
      };
      state.uploadSessions.set(fileId, session);
    }
    session.receivedChunks.add(chunkIndex);

    const isComplete = session.receivedChunks.size === totalChunks;

    // File complete → register and notify all clients
    if (isComplete) {
      state.files.set(fileId, { fileName, fileSize, mimeType, path: filePath });

      const sender = state.devices.get(senderId);
      if (sender && state.io) {
        const msg = {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "file",
          content: `Fichier partagé : ${fileName}`,
          sender,
          timestamp: Date.now(),
          fileInfo: { fileId, fileName, fileSize, mimeType },
        };
        state.messages.push(msg);
        state.io.emit("message:new", msg);
      }

      state.uploadSessions.delete(fileId);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, chunkIndex, complete: isComplete }));
  } catch (err) {
    console.error("Upload error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Upload failed", details: String(err) }));
  }
}

// ─── Initialize Next.js ─────────────────────────────────────────
const app = next({ dev, hostname: HOST, port: PORT });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Intercept chunk uploads BEFORE Next.js (no body parsing, no size limits)
    const urlPath = (req.url || "").split("?")[0];

    if (
      req.method === "PUT" &&
      urlPath.match(/^\/api\/upload\/[^/]+\/\d+$/)
    ) {
      handleChunkUpload(req, res);
      return;
    }

    // Everything else → Next.js
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // ─── Socket.IO ──────────────────────────────────────────────
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8,
  });

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

    socket.emit("init", {
      device,
      devices: Array.from(state.devices.values()),
      messages: state.messages.slice(-100),
      localIP: getLocalIP(),
      port: PORT,
      hostname: osHostname(),
    });

    const joinMsg = {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "system",
      content: `${name} a rejoint le canal`,
      sender: device,
      timestamp: Date.now(),
    };
    state.messages.push(joinMsg);
    io.emit("device:join", { device, message: joinMsg });

    socket.on("message:send", (data) => {
      const sender = state.devices.get(socket.id);
      if (!sender) return;
      if (!data.content || typeof data.content !== "string" || !data.content.trim()) return;
      const msg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: data.type || "text",
        content: data.content,
        sender,
        timestamp: Date.now(),
      };
      state.messages.push(msg);
      if (state.messages.length > 500) state.messages = state.messages.slice(-200);
      io.emit("message:new", msg);
    });

    socket.on("clipboard:share", (data) => {
      const sender = state.devices.get(socket.id);
      if (!sender) return;
      if (!data.content || typeof data.content !== "string") return;
      const msg = {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: "clipboard",
        content: data.content,
        sender,
        timestamp: Date.now(),
      };
      state.messages.push(msg);
      if (state.messages.length > 500) state.messages = state.messages.slice(-200);
      io.emit("message:new", msg);
    });

    socket.on("disconnect", () => {
      const d = state.devices.get(socket.id);
      if (d) {
        const leaveMsg = {
          id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "system",
          content: `${d.name} a quitté le canal`,
          sender: d,
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
    console.log("");
    console.log("  ╔══════════════════════════════════════════════╗");
    console.log("  ║           NetworkCommuni ready!              ║");
    console.log("  ╠══════════════════════════════════════════════╣");
    console.log(`  ║  Local:   http://localhost:${PORT}              ║`);
    console.log(`  ║  Network: http://${localIP}:${PORT}${" ".repeat(Math.max(0, 16 - localIP.length))}║`);
    console.log("  ╚══════════════════════════════════════════════╝");
    console.log("");
  });
});
