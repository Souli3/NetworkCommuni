"use client";

import { useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useMessages } from "@/hooks/useMessages";
import { useDevices } from "@/hooks/useDevices";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Sidebar } from "./Sidebar";
import { MessageFeed } from "./MessageFeed";
import { InputBar } from "./InputBar";

export function ChatApp() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { socket, me, localIP, port, connected } = useSocket();
  const { messages } = useMessages(socket);
  const { devices } = useDevices(socket);
  const { uploads, uploadFile } = useFileUpload(socket, me);

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
      <div className="main-area">
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
        <MessageFeed messages={messages} me={me} uploads={uploads} />
        <InputBar
          socket={socket}
          me={me}
          onFileSelect={uploadFile}
        />
      </div>
    </div>
  );
}
