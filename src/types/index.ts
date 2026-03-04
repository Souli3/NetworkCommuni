export interface Device {
  id: string;
  name: string;
  color: string;
  connectedAt: number;
}

export interface ChatMessage {
  id: string;
  type: "text" | "clipboard" | "file" | "system";
  content: string;
  sender: Device;
  timestamp: number;
  fileInfo?: FileInfo;
}

export interface FileInfo {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface FileTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  status: "queued" | "uploading" | "done" | "error" | "cancelled";
  progress: number;
  speed: number;
  eta: number;
  uploadedBytes: number;
  error?: string;
}

export interface ServerState {
  devices: Map<string, Device>;
  messages: ChatMessage[];
  files: Map<string, { fileName: string; fileSize: number; mimeType: string; path: string }>;
}
