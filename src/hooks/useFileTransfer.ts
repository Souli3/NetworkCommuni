"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Device, FileTransfer } from "@/types";

const MAX_CONCURRENT_FILES = 3;
const MAX_CONCURRENT_CHUNKS = 4;
const MAX_GLOBAL_CONNECTIONS = 5; // Browser limits ~6 per origin, stay under
const CHUNK_RETRY_ATTEMPTS = 3;
const CHUNK_RETRY_DELAY = 1000;

// Global connection semaphore shared across all files
let globalActiveConnections = 0;
const connectionWaiters: (() => void)[] = [];

function acquireConnection(): Promise<void> {
  if (globalActiveConnections < MAX_GLOBAL_CONNECTIONS) {
    globalActiveConnections++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    connectionWaiters.push(() => {
      globalActiveConnections++;
      resolve();
    });
  });
}

function releaseConnection() {
  globalActiveConnections--;
  if (connectionWaiters.length > 0 && globalActiveConnections < MAX_GLOBAL_CONNECTIONS) {
    const next = connectionWaiters.shift();
    if (next) next();
  }
}

function getChunkSize(fileSize: number): number {
  if (fileSize < 50 * 1024 * 1024) return 512 * 1024;          // <50MB: 512KB
  if (fileSize < 200 * 1024 * 1024) return 1024 * 1024;        // <200MB: 1MB
  if (fileSize < 1024 * 1024 * 1024) return 2 * 1024 * 1024;   // <1GB: 2MB
  if (fileSize < 10 * 1024 * 1024 * 1024) return 5 * 1024 * 1024; // <10GB: 5MB
  return 10 * 1024 * 1024;                                      // >=10GB: 10MB
}

interface InternalTransfer {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  completedChunks: number;
  uploadedBytes: number;
  status: "queued" | "uploading" | "done" | "error" | "cancelled";
  cancelled: boolean;
  activeXHRs: Set<XMLHttpRequest>;
  speedSamples: { time: number; bytes: number }[];
  error?: string;
}

export function useFileTransfer(me: Device | null) {
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const internalsRef = useRef<Map<string, InternalTransfer>>(new Map());
  const activeCountRef = useRef(0);
  const meRef = useRef(me);
  meRef.current = me;

  // Stable ref for processQueue (breaks circular dep)
  const processQueueRef = useRef<() => void>(() => {});

  const updateUI = useCallback((id: string, updates: Partial<FileTransfer>) => {
    setTransfers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  const calcSpeed = useCallback((t: InternalTransfer) => {
    const now = Date.now();
    const cutoff = now - 3000;
    t.speedSamples = t.speedSamples.filter((s) => s.time > cutoff);
    t.speedSamples.push({ time: now, bytes: t.uploadedBytes });

    if (t.speedSamples.length < 2) return { speed: 0, eta: 0 };

    const first = t.speedSamples[0];
    const last = t.speedSamples[t.speedSamples.length - 1];
    const dt = (last.time - first.time) / 1000;
    const db = last.bytes - first.bytes;
    const speed = dt > 0 ? db / dt : 0;
    const remaining = t.fileSize - t.uploadedBytes;
    const eta = speed > 0 ? remaining / speed : 0;

    return { speed, eta };
  }, []);

  // Upload a single chunk via XHR with global connection limit
  const uploadChunk = useCallback(
    async (t: InternalTransfer, chunkIndex: number): Promise<void> => {
      if (t.cancelled) throw new Error("Cancelled");

      await acquireConnection();

      try {
        await new Promise<void>((resolve, reject) => {
          if (t.cancelled) {
            reject(new Error("Cancelled"));
            return;
          }

          const start = chunkIndex * t.chunkSize;
          const end = Math.min(start + t.chunkSize, t.file.size);
          const blob = t.file.slice(start, end);

          const xhr = new XMLHttpRequest();
          t.activeXHRs.add(xhr);

          xhr.open("PUT", `/api/upload/${encodeURIComponent(t.id)}/${chunkIndex}`);
          xhr.setRequestHeader("X-File-Name", encodeURIComponent(t.fileName));
          xhr.setRequestHeader("X-File-Size", String(t.fileSize));
          xhr.setRequestHeader("X-Total-Chunks", String(t.totalChunks));
          xhr.setRequestHeader("X-Chunk-Size", String(t.chunkSize));
          xhr.setRequestHeader("X-Mime-Type", t.mimeType);
          xhr.setRequestHeader("X-Sender-Id", meRef.current?.id || "");

          xhr.onload = () => {
            t.activeXHRs.delete(xhr);
            if (xhr.status === 200) {
              t.completedChunks++;
              t.uploadedBytes += end - start;
              const progress = (t.completedChunks / t.totalChunks) * 100;
              const { speed, eta } = calcSpeed(t);
              updateUI(t.id, {
                progress,
                uploadedBytes: t.uploadedBytes,
                speed,
                eta,
              });
              resolve();
            } else {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
            }
          };

          xhr.onerror = () => {
            t.activeXHRs.delete(xhr);
            reject(new Error("Network error"));
          };

          xhr.onabort = () => {
            t.activeXHRs.delete(xhr);
            reject(new Error("Cancelled"));
          };

          xhr.send(blob);
        });
      } finally {
        releaseConnection();
      }
    },
    [calcSpeed, updateUI]
  );

  // Upload a chunk with retry
  const uploadChunkRetry = useCallback(
    async (t: InternalTransfer, chunkIndex: number) => {
      for (let attempt = 0; attempt < CHUNK_RETRY_ATTEMPTS; attempt++) {
        try {
          await uploadChunk(t, chunkIndex);
          return;
        } catch (err) {
          if (t.cancelled) throw err;
          if (attempt === CHUNK_RETRY_ATTEMPTS - 1) throw err;
          await new Promise((r) =>
            setTimeout(r, CHUNK_RETRY_DELAY * (attempt + 1))
          );
        }
      }
    },
    [uploadChunk]
  );

  // Upload all chunks of a file with parallelism
  const uploadFile = useCallback(
    async (t: InternalTransfer) => {
      t.speedSamples = [{ time: Date.now(), bytes: 0 }];
      updateUI(t.id, { status: "uploading" });

      let nextChunk = 0;
      let fatalError: Error | null = null;

      const getNext = () => {
        if (nextChunk >= t.totalChunks) return -1;
        return nextChunk++;
      };

      const worker = async () => {
        while (!t.cancelled && !fatalError) {
          const idx = getNext();
          if (idx === -1) break;
          try {
            await uploadChunkRetry(t, idx);
          } catch (err) {
            if (!t.cancelled) fatalError = err as Error;
            break;
          }
        }
      };

      try {
        const workerCount = Math.min(MAX_CONCURRENT_CHUNKS, t.totalChunks);
        await Promise.all(
          Array.from({ length: workerCount }, () => worker())
        );

        if (t.cancelled) {
          updateUI(t.id, { status: "cancelled", speed: 0, eta: 0 });
        } else if (fatalError) {
          throw fatalError;
        } else {
          updateUI(t.id, {
            status: "done",
            progress: 100,
            speed: 0,
            eta: 0,
            uploadedBytes: t.fileSize,
          });
        }
      } catch (err) {
        t.error = (err as Error).message;
        updateUI(t.id, {
          status: "error",
          error: (err as Error).message,
          speed: 0,
          eta: 0,
        });
      }

      activeCountRef.current--;
      processQueueRef.current();
    },
    [uploadChunkRetry, updateUI]
  );

  // Process queued transfers
  const processQueue = useCallback(() => {
    const map = internalsRef.current;
    for (const [, t] of map) {
      if (activeCountRef.current >= MAX_CONCURRENT_FILES) break;
      if (t.status === "queued" && !t.cancelled) {
        activeCountRef.current++;
        t.status = "uploading";
        uploadFile(t);
      }
    }
  }, [uploadFile]);

  processQueueRef.current = processQueue;

  // When `me` becomes available, start processing queued transfers
  useEffect(() => {
    if (me) processQueueRef.current();
  }, [me]);

  // ─── Public API ─────────────────────────────────────────────

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (!meRef.current) return;

      const newTransfers: FileTransfer[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const id = `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`;
        const mimeType = file.type || "application/octet-stream";
        const chunkSize = getChunkSize(file.size);
        const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));

        const internal: InternalTransfer = {
          id,
          file,
          fileName: file.name,
          fileSize: file.size,
          mimeType,
          chunkSize,
          totalChunks,
          completedChunks: 0,
          uploadedBytes: 0,
          status: "queued",
          cancelled: false,
          activeXHRs: new Set(),
          speedSamples: [],
        };

        internalsRef.current.set(id, internal);

        newTransfers.push({
          id,
          fileName: file.name,
          fileSize: file.size,
          status: "queued",
          progress: 0,
          speed: 0,
          eta: 0,
          uploadedBytes: 0,
        });
      }

      setTransfers((prev) => [...prev, ...newTransfers]);
      setTimeout(() => processQueueRef.current(), 0);
    },
    []
  );

  const cancelTransfer = useCallback(
    (id: string) => {
      const t = internalsRef.current.get(id);
      if (!t) return;
      t.cancelled = true;
      t.activeXHRs.forEach((xhr) => xhr.abort());
      t.activeXHRs.clear();
      if (t.status === "queued") {
        t.status = "cancelled";
        updateUI(id, { status: "cancelled" });
      }
    },
    [updateUI]
  );

  const cancelAll = useCallback(() => {
    for (const [id] of internalsRef.current) {
      cancelTransfer(id);
    }
  }, [cancelTransfer]);

  const clearCompleted = useCallback(() => {
    const toRemove: string[] = [];
    for (const [id, t] of internalsRef.current) {
      if (
        t.status === "done" ||
        t.status === "error" ||
        t.status === "cancelled"
      ) {
        toRemove.push(id);
      }
    }
    toRemove.forEach((id) => internalsRef.current.delete(id));
    setTransfers((prev) => prev.filter((t) => !toRemove.includes(t.id)));
  }, []);

  const retryTransfer = useCallback(
    (id: string) => {
      const t = internalsRef.current.get(id);
      if (!t || (t.status !== "error" && t.status !== "cancelled")) return;

      // New ID (server may have partial data from old one)
      const newId = `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      internalsRef.current.delete(id);

      t.id = newId;
      t.status = "queued";
      t.cancelled = false;
      t.completedChunks = 0;
      t.uploadedBytes = 0;
      t.activeXHRs = new Set();
      t.speedSamples = [];
      t.error = undefined;

      internalsRef.current.set(newId, t);

      setTransfers((prev) =>
        prev.map((tr) =>
          tr.id === id
            ? {
                ...tr,
                id: newId,
                status: "queued" as const,
                progress: 0,
                speed: 0,
                eta: 0,
                uploadedBytes: 0,
                error: undefined,
              }
            : tr
        )
      );

      setTimeout(() => processQueueRef.current(), 0);
    },
    []
  );

  return {
    transfers,
    addFiles,
    cancelTransfer,
    cancelAll,
    clearCompleted,
    retryTransfer,
  };
}
