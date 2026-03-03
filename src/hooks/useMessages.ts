"use client";

import { useEffect, useState, useRef } from "react";
import { Socket } from "socket.io-client";
import type { ChatMessage } from "@/types";

export function useMessages(socket: Socket | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (!socket) return;

    const onInit = (payload: { messages: ChatMessage[] }) => {
      if (!initialized.current) {
        setMessages(payload.messages);
        initialized.current = true;
      }
    };

    const onNewMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    const onDeviceJoin = (data: { message: ChatMessage }) => {
      setMessages((prev) => [...prev, data.message]);
    };

    const onDeviceLeave = (data: { message: ChatMessage }) => {
      setMessages((prev) => [...prev, data.message]);
    };

    socket.on("init", onInit);
    socket.on("message:new", onNewMessage);
    socket.on("device:join", onDeviceJoin);
    socket.on("device:leave", onDeviceLeave);

    return () => {
      socket.off("init", onInit);
      socket.off("message:new", onNewMessage);
      socket.off("device:join", onDeviceJoin);
      socket.off("device:leave", onDeviceLeave);
    };
  }, [socket]);

  return { messages };
}
