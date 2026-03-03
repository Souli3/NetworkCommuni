"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, Device, UploadProgress } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { FileCard } from "./FileCard";

interface MessageFeedProps {
  messages: ChatMessage[];
  me: Device | null;
  uploads: UploadProgress[];
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageFeed({ messages, me, uploads }: MessageFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, uploads]);

  return (
    <div className="message-feed">
      {messages.map((msg) => {
        if (msg.type === "system") {
          return (
            <div key={msg.id} className="system-message">
              {msg.content} &middot; {formatTime(msg.timestamp)}
            </div>
          );
        }

        if (msg.type === "file" && msg.fileInfo) {
          return <FileCard key={msg.id} message={msg} me={me} />;
        }

        return <MessageBubble key={msg.id} message={msg} me={me} />;
      })}

      {/* Active uploads */}
      {uploads
        .filter((u) => u.status === "uploading" || u.status === "error")
        .map((u) => (
          <div key={u.fileId} className="file-card is-mine">
            <div className="file-card-body">
              <span className="file-icon">
                {u.status === "error" ? "\u274C" : "\u{1F4E4}"}
              </span>
              <div className="file-details">
                <div className="file-name">{u.fileName}</div>
                {u.status === "error" ? (
                  <div className="upload-progress-text" style={{ color: "var(--error)" }}>
                    Échec de l&apos;envoi
                  </div>
                ) : (
                  <>
                    <div className="upload-progress-bar">
                      <div
                        className="upload-progress-fill"
                        style={{ width: `${u.progress}%` }}
                      />
                    </div>
                    <div className="upload-progress-text">{Math.round(u.progress)}%</div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

      <div ref={bottomRef} />
    </div>
  );
}
