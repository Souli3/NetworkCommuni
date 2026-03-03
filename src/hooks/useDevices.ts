"use client";

import { useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import type { Device } from "@/types";

export function useDevices(socket: Socket | null) {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    if (!socket) return;

    const onInit = (payload: { devices: Device[] }) => {
      setDevices(payload.devices);
    };

    const onDeviceJoin = (data: { device: Device }) => {
      setDevices((prev) => {
        if (prev.find((d) => d.id === data.device.id)) return prev;
        return [...prev, data.device];
      });
    };

    const onDeviceLeave = (data: { deviceId: string }) => {
      setDevices((prev) => prev.filter((d) => d.id !== data.deviceId));
    };

    socket.on("init", onInit);
    socket.on("device:join", onDeviceJoin);
    socket.on("device:leave", onDeviceLeave);

    return () => {
      socket.off("init", onInit);
      socket.off("device:join", onDeviceJoin);
      socket.off("device:leave", onDeviceLeave);
    };
  }, [socket]);

  return { devices };
}
