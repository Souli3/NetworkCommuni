"use client";

import { useState } from "react";
import type { Device } from "@/types";

interface SidebarProps {
  localIP: string;
  port: number;
  devices: Device[];
  me: Device | null;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ localIP, port, devices, me, open, onClose }: SidebarProps) {
  const [copied, setCopied] = useState(false);

  const fullAddress = localIP ? `${localIP}:${port}` : "";

  const copyAddress = async () => {
    if (!fullAddress) return;
    try {
      await navigator.clipboard.writeText(`http://${fullAddress}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  };

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-header">
        <h1>NetworkCommuni</h1>
        {fullAddress && (
          <div className="connection-info">
            <div className="label">Adresse réseau</div>
            <div className="ip" onClick={copyAddress} title="Cliquer pour copier">
              {fullAddress}
            </div>
            {copied && <div className="copied-notice">Copié !</div>}
          </div>
        )}
      </div>
      <div className="device-section">
        <h2>Appareils connectés ({devices.length})</h2>
        <ul className="device-list">
          {devices.map((device) => (
            <li
              key={device.id}
              className={`device-item ${device.id === me?.id ? "is-me" : ""}`}
            >
              <span className="device-dot" style={{ background: device.color }} />
              <span className="device-name">{device.name}</span>
              {device.id === me?.id && <span className="device-you">vous</span>}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
