"use client";

import { useState } from "react";
import type { ChatMessage, Device } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  me: Device | null;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageBubble({ message, me }: MessageBubbleProps) {
  const [clipCopied, setClipCopied] = useState(false);
  const isMine = message.sender.id === me?.id;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setClipCopied(true);
      setTimeout(() => setClipCopied(false), 2000);
    } catch {
      // not available
    }
  };

  return (
    <div className={`message-bubble ${isMine ? "is-mine" : "is-other"}`}>
      {!isMine && (
        <div className="bubble-sender" style={{ color: message.sender.color }}>
          {message.sender.name}
        </div>
      )}
      {message.type === "clipboard" && (
        <div className="bubble-clipboard-tag">&#128203; Presse-papiers</div>
      )}
      <div className="bubble-content">{message.content}</div>
      {message.type === "clipboard" && (
        <button className="clipboard-copy-btn" onClick={copyToClipboard}>
          {clipCopied ? "Copié !" : "Copier"}
        </button>
      )}
      <div className="bubble-time">{formatTime(message.timestamp)}</div>
    </div>
  );
}
