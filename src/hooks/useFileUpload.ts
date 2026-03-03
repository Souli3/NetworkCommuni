"use client";

import { useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import type { Device, UploadProgress } from "@/types";

const CHUNK_SIZE = 512 * 1024; // 512KB chunks

export function useFileUpload(socket: Socket | null, me: Device | null) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!socket || !me) return;

      const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const mimeType = file.type || "application/octet-stream";

      setUploads((prev) => [
        ...prev,
        { fileId, fileName: file.name, progress: 0, status: "uploading" },
      ]);

      try {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          const arrayBuffer = await chunk.arrayBuffer();

          const formData = new FormData();
          formData.append("chunk", new File([arrayBuffer], "chunk", { type: "application/octet-stream" }));
          formData.append("fileId", fileId);
          formData.append("fileName", file.name);
          formData.append("fileSize", String(file.size));
          formData.append("mimeType", mimeType);
          formData.append("chunkIndex", String(i));
          formData.append("totalChunks", String(totalChunks));
          formData.append("senderId", me.id);

          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const errText = await res.text();
            console.error(`Upload chunk ${i} error:`, res.status, errText);
            throw new Error(`Chunk ${i}: ${res.status}`);
          }

          const progress = ((i + 1) / totalChunks) * 100;
          setUploads((prev) =>
            prev.map((u) => (u.fileId === fileId ? { ...u, progress } : u))
          );
        }

        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === fileId ? { ...u, progress: 100, status: "done" } : u
          )
        );

        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.fileId !== fileId));
        }, 2000);
      } catch (err) {
        console.error("Upload failed:", err);
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === fileId
              ? { ...u, status: "error" }
              : u
          )
        );
        // Remove error after 5s
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.fileId !== fileId));
        }, 5000);
      }
    },
    [socket, me]
  );

  return { uploads, uploadFile };
}
