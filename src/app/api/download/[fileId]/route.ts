import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";

interface SharedState {
  files: Map<string, { fileName: string; fileSize: number; mimeType: string; path: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const state = (globalThis as unknown as { __networkCommuni: SharedState }).__networkCommuni;

    if (!state) {
      return NextResponse.json({ error: "Server state not initialized" }, { status: 500 });
    }

    const fileMeta = state.files.get(fileId);
    if (!fileMeta || !existsSync(fileMeta.path)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stat = statSync(fileMeta.path);
    const nodeStream = createReadStream(fileMeta.path);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": fileMeta.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileMeta.fileName)}"`,
        "Content-Length": String(stat.size),
      },
    });
  } catch (err) {
    console.error("Download error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
