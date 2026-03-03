import { NextRequest, NextResponse } from "next/server";
import { writeFile, appendFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const UPLOADS_DIR = join(process.cwd(), "uploads");

interface SharedState {
  devices: Map<string, { id: string; name: string; color: string; connectedAt: number }>;
  messages: Array<Record<string, unknown>>;
  files: Map<string, { fileName: string; fileSize: number; mimeType: string; path: string }>;
  io?: { emit: (event: string, data: unknown) => void };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const chunk = formData.get("chunk") as Blob;
    const fileId = formData.get("fileId") as string;
    const fileName = formData.get("fileName") as string;
    const fileSize = parseInt(formData.get("fileSize") as string, 10);
    const mimeType = formData.get("mimeType") as string;
    const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
    const totalChunks = parseInt(formData.get("totalChunks") as string, 10);
    const senderId = formData.get("senderId") as string;

    if (!chunk || !fileId || !fileName) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Enforce 1 GB max file size
    const MAX_SIZE = 1024 * 1024 * 1024; // 1 GB
    if (fileSize > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 1 Go)" }, { status: 413 });
    }

    // Ensure uploads dir exists
    if (!existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR, { recursive: true });
    }

    const filePath = join(UPLOADS_DIR, fileId);
    const buffer = Buffer.from(await chunk.arrayBuffer());

    if (chunkIndex === 0) {
      await writeFile(filePath, buffer);
    } else {
      await appendFile(filePath, buffer);
    }

    // If last chunk, register the file and notify clients
    if (chunkIndex === totalChunks - 1) {
      const state = (globalThis as unknown as { __networkCommuni: SharedState }).__networkCommuni;
      if (state) {
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
      }
    }

    return NextResponse.json({ ok: true, chunkIndex });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
