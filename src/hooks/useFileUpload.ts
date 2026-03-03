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

          const formData = new FormData();
          formData.append("chunk", chunk);
          formData.append("fileId", fileId);
          formData.append("fileName", file.name);
          formData.append("fileSize", String(file.size));
          formData.append("mimeType", file.type || "application/octet-stream");
          formData.append("chunkIndex", String(i));
          formData.append("totalChunks", String(totalChunks));
          formData.append("senderId", me.id);

          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) throw new Error("Upload failed");

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

        // Remove from active uploads after a delay
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.fileId !== fileId));
        }, 2000);
      } catch {
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === fileId ? { ...u, status: "error" } : u
          )
        );
      }
    },
    [socket, me]
  );

  return { uploads, uploadFile };
}
