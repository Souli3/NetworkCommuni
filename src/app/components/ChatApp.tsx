"use client";

import { useState, useCallback, type DragEvent } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useMessages } from "@/hooks/useMessages";
import { useDevices } from "@/hooks/useDevices";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Sidebar } from "./Sidebar";
import { MessageFeed } from "./MessageFeed";
import { InputBar } from "./InputBar";

export function ChatApp() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { socket, me, localIP, port, connected } = useSocket();
  const { messages } = useMessages(socket);
  const { devices } = useDevices(socket);
  const { uploads, uploadFile } = useFileUpload(socket, me);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);

      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        uploadFile(files[i]);
      }
    },
    [uploadFile]
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
        devices={devices}
        me={me}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div
        className="main-area"
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
        <MessageFeed messages={messages} me={me} uploads={uploads} />
        <InputBar socket={socket} me={me} onFileSelect={uploadFile} />
      </div>
    </div>
  );
}
