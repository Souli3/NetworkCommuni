"use client";

import type { ChatMessage, Device } from "@/types";

interface FileCardProps {
  message: ChatMessage;
  me: Device | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "\u{1F5BC}";
  if (mimeType.startsWith("video/")) return "\u{1F3AC}";
  if (mimeType.startsWith("audio/")) return "\u{1F3B5}";
  if (mimeType.includes("pdf")) return "\u{1F4D1}";
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar"))
    return "\u{1F4E6}";
  return "\u{1F4C4}";
}

export function FileCard({ message, me }: FileCardProps) {
  const isMine = message.sender.id === me?.id;
  const info = message.fileInfo!;

  const download = () => {
    window.open(`/api/download/${encodeURIComponent(info.fileId)}`, "_blank");
  };

  return (
    <div className={`file-card ${isMine ? "is-mine" : "is-other"}`}>
      {!isMine && (
        <div className="file-card-sender" style={{ color: message.sender.color }}>
          {message.sender.name}
        </div>
      )}
      <div className="file-card-body">
        <span className="file-icon">{fileIcon(info.mimeType)}</span>
        <div className="file-details">
          <div className="file-name" title={info.fileName}>
            {info.fileName}
          </div>
          <div className="file-size">{formatSize(info.fileSize)}</div>
        </div>
        <button className="file-download-btn" onClick={download}>
          Télécharger
        </button>
      </div>
      <div className="file-card-time">{formatTime(message.timestamp)}</div>
    </div>
  );
}
