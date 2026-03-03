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

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number; // 0-100
  status: "uploading" | "done" | "error";
}

export interface ServerState {
  devices: Map<string, Device>;
  messages: ChatMessage[];
  files: Map<string, { fileName: string; fileSize: number; mimeType: string; path: string }>;
}
