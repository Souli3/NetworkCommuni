"use client";

import { useState, useRef, type FormEvent } from "react";
import { Socket } from "socket.io-client";
import type { Device } from "@/types";

interface InputBarProps {
  socket: Socket | null;
  me: Device | null;
  onFileSelect: (file: File) => void;
}

export function InputBar({ socket, me, onFileSelect }: InputBarProps) {
  const [text, setText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendMessage = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !socket) return;
    socket.emit("message:send", { type: "text", content: trimmed });
    setText("");
  };

  const shareClipboard = async () => {
    if (!socket) return;
    try {
      const content = await navigator.clipboard.readText();
      if (content) {
        socket.emit("clipboard:share", { content });
      }
    } catch {
      alert("Impossible de lire le presse-papiers. Vérifiez les permissions du navigateur.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      e.target.value = "";
    }
  };

  return (
    <form className="input-bar" onSubmit={sendMessage}>
      <input
        type="text"
        placeholder="Écrivez un message..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <button
        type="button"
        className="input-btn"
        onClick={shareClipboard}
        title="Partager le presse-papiers"
      >
        &#128203;
      </button>
      <button
        type="button"
        className="input-btn"
        onClick={() => fileInputRef.current?.click()}
        title="Envoyer un fichier"
      >
        &#128206;
      </button>
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
      />
      <button type="submit" className="input-btn send-btn" title="Envoyer">
        &#10148;
      </button>
    </form>
  );
}
