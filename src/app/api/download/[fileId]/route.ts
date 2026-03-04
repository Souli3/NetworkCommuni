import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";
import { join, resolve } from "path";

const UPLOADS_DIR = join(process.cwd(), "uploads");

interface SharedState {
  files: Map<
    string,
    { fileName: string; fileSize: number; mimeType: string; path: string }
  >;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;

    // Path traversal protection
    if (fileId.includes("..") || fileId.includes("/") || fileId.includes("\\")) {
      return NextResponse.json({ error: "Invalid file ID" }, { status: 400 });
    }

    const state = (globalThis as unknown as { __networkCommuni: SharedState })
      .__networkCommuni;

    if (!state) {
      return NextResponse.json(
        { error: "Server state not initialized" },
        { status: 500 }
      );
    }

    const fileMeta = state.files.get(fileId);
    if (!fileMeta || !existsSync(fileMeta.path)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Ensure file path is within uploads directory
    const resolvedPath = resolve(fileMeta.path);
    if (!resolvedPath.startsWith(UPLOADS_DIR)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const stat = statSync(fileMeta.path);
    const disposition = `attachment; filename="${encodeURIComponent(fileMeta.fileName)}"`;
    const rangeHeader = request.headers.get("range");

    // Range request (resumable download)
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        const nodeStream = createReadStream(fileMeta.path, { start, end });
        const webStream = Readable.toWeb(nodeStream) as ReadableStream;

        return new Response(webStream, {
          status: 206,
          headers: {
            "Content-Type": fileMeta.mimeType,
            "Content-Disposition": disposition,
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Content-Length": String(chunkSize),
            "Accept-Ranges": "bytes",
          },
        });
      }
    }

    // Full download (streamed)
    const nodeStream = createReadStream(fileMeta.path);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": fileMeta.mimeType,
        "Content-Disposition": disposition,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err) {
    console.error("Download error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
