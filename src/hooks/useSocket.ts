"use client";

import { useEffect, useState, useRef } from "react";
import { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";
import type { Device, ChatMessage } from "@/types";

interface InitPayload {
  device: Device;
  devices: Device[];
  messages: ChatMessage[];
  localIP: string;
  port: number;
  hostname: string;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [me, setMe] = useState<Device | null>(null);
  const [localIP, setLocalIP] = useState("");
  const [port, setPort] = useState(3000);
  const [hostname, setHostname] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("init", (payload: InitPayload) => {
      setMe(payload.device);
      setLocalIP(payload.localIP);
      setPort(payload.port);
      setHostname(payload.hostname);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("init");
    };
  }, []);

  return {
    socket: socketRef.current,
    me,
    localIP,
    port,
    hostname,
    connected,
  };
}
