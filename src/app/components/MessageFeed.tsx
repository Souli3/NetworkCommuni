"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, Device } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { FileCard } from "./FileCard";

interface MessageFeedProps {
  messages: ChatMessage[];
  me: Device | null;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageFeed({ messages, me }: MessageFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

      <div ref={bottomRef} />
    </div>
  );
}
