"use client";

import { useState, useCallback, useRef, type DragEvent } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useMessages } from "@/hooks/useMessages";
import { useDevices } from "@/hooks/useDevices";
import { useFileTransfer } from "@/hooks/useFileTransfer";
import { Sidebar } from "./Sidebar";
import { MessageFeed } from "./MessageFeed";
import { InputBar } from "./InputBar";
import { FileTransferManager } from "./FileTransferManager";

export function ChatApp() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const { socket, me, localIP, port, hostname, connected } = useSocket();
  const { messages } = useMessages(socket);
  const { devices } = useDevices(socket);
  const {
    transfers,
    addFiles,
    cancelTransfer,
    cancelAll,
    clearCompleted,
    retryTransfer,
  } = useFileTransfer(me);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setDragging(true);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  return (
    <div className="app-layout">
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar
        localIP={localIP}
        port={port}
        hostname={hostname}
        devices={devices}
        me={me}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div
        className="main-area"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mobile-header">
          <button className="burger-btn" onClick={() => setSidebarOpen(true)}>
            &#9776;
          </button>
          <h1>NetworkCommuni</h1>
          {connected ? null : (
            <span style={{ fontSize: "0.75rem", color: "var(--error)" }}>
              Déconnecté
            </span>
          )}
        </div>
        {dragging && (
          <div className="drop-overlay">
            <div className="drop-overlay-content">
              &#128206; Déposer les fichiers ici
            </div>
          </div>
        )}
        <MessageFeed messages={messages} me={me} />
        <FileTransferManager
          transfers={transfers}
          onCancel={cancelTransfer}
          onRetry={retryTransfer}
          onClearCompleted={clearCompleted}
          onCancelAll={cancelAll}
        />
        <InputBar socket={socket} me={me} onFilesSelect={addFiles} />
      </div>
    </div>
  );
}
