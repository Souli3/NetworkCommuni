"use client";

import { useState } from "react";
import type { FileTransfer } from "@/types";

// ─── File icon by extension ──────────────────────────────────────

function getFileIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  // Images
  if (["jpg","jpeg","png","gif","bmp","svg","webp","ico","tiff","tif","heic","heif","avif","raw","cr2","nef","arw"].includes(ext)) return "\u{1F5BC}\uFE0F";
  // Videos
  if (["mp4","avi","mkv","mov","wmv","flv","webm","mpeg","mpg","m4v","3gp","ts","vob","ogv","m2ts","mts"].includes(ext)) return "\u{1F3AC}";
  // Audio
  if (["mp3","wav","flac","aac","ogg","wma","m4a","opus","aiff","alac","ape","mid","midi"].includes(ext)) return "\u{1F3B5}";
  // PDF
  if (ext === "pdf") return "\u{1F4D5}";
  // Documents
  if (["doc","docx","odt","rtf","pages"].includes(ext)) return "\u{1F4DD}";
  // Spreadsheets
  if (["xls","xlsx","ods","csv","numbers"].includes(ext)) return "\u{1F4CA}";
  // Presentations
  if (["ppt","pptx","odp","key"].includes(ext)) return "\u{1F4FD}\uFE0F";
  // Text
  if (["txt","md","log","nfo","cfg","ini","conf","env"].includes(ext)) return "\u{1F4C4}";
  // Archives
  if (["zip","rar","7z","tar","gz","bz2","xz","zst","lz","lzma","cab","iso","img","dmg","z","tgz","tbz2"].includes(ext)) return "\u{1F4E6}";
  // Executables (Windows)
  if (["exe","msi","bat","cmd","ps1","com","scr","pif","cpl","inf","reg"].includes(ext)) return "\u{2699}\uFE0F";
  // Executables (Unix/Linux)
  if (["sh","bash","zsh","fish","csh","ksh","run","bin","out","elf","appimage","snap","flatpak","deb","rpm","pkg"].includes(ext)) return "\u{2699}\uFE0F";
  // Executables (macOS)
  if (["app","command","workflow","action"].includes(ext)) return "\u{2699}\uFE0F";
  // Mobile
  if (["apk","aab","ipa","xapk"].includes(ext)) return "\u{1F4F1}";
  // Disk images
  if (["vdi","vmdk","vhd","vhdx","qcow2","ova","ovf"].includes(ext)) return "\u{1F4BF}";
  // Code
  if (["js","ts","jsx","tsx","py","java","c","cpp","h","hpp","cs","go","rs","rb","php","swift","kt","kts","scala","r","m","mm","lua","pl","pm","tcl","asm","s","v","sv"].includes(ext)) return "\u{1F4BB}";
  // Web
  if (["html","htm","css","scss","sass","less","xml","xsl","json","yaml","yml","toml","graphql","gql","wasm"].includes(ext)) return "\u{1F310}";
  // Fonts
  if (["ttf","otf","woff","woff2","eot","fnt","fon"].includes(ext)) return "\u{1F524}";
  // Design
  if (["psd","ai","sketch","fig","xd","indd","eps","cdr","afdesign","afphoto"].includes(ext)) return "\u{1F3A8}";
  // 3D
  if (["obj","fbx","stl","blend","3ds","dae","gltf","glb","usdz","step","stp","iges","igs"].includes(ext)) return "\u{1F9CA}";
  // Database
  if (["sql","db","sqlite","sqlite3","mdb","accdb","bak"].includes(ext)) return "\u{1F5C3}\uFE0F";
  // Certificates / Security
  if (["pem","crt","cer","key","p12","pfx","jks","keystore","csr"].includes(ext)) return "\u{1F510}";
  // Torrents
  if (ext === "torrent") return "\u{1F9F2}";
  // eBooks
  if (["epub","mobi","azw","azw3","fb2","djvu"].includes(ext)) return "\u{1F4DA}";
  // Subtitles
  if (["srt","sub","ass","ssa","vtt"].includes(ext)) return "\u{1F4AC}";

  // No extension or unknown
  return "\u{1F4C4}";
}

// ─── Format utilities ────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 o";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return "";
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} Ko/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} Mo/s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.ceil(seconds % 60);
    return `${m}m${s.toString().padStart(2, "0")}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

// ─── Components ──────────────────────────────────────────────────

interface FileTransferManagerProps {
  transfers: FileTransfer[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onClearCompleted: () => void;
  onCancelAll: () => void;
}

export function FileTransferManager({
  transfers,
  onCancel,
  onRetry,
  onClearCompleted,
  onCancelAll,
}: FileTransferManagerProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (transfers.length === 0) return null;

  const active = transfers.filter(
    (t) => t.status === "uploading" || t.status === "queued"
  );
  const done = transfers.filter((t) => t.status === "done");
  const failed = transfers.filter(
    (t) => t.status === "error" || t.status === "cancelled"
  );

  const totalSpeed = transfers.reduce((sum, t) => sum + t.speed, 0);

  return (
    <div className="transfer-manager">
      <div
        className="transfer-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="transfer-header-info">
          <span className="transfer-header-title">
            Transferts
          </span>
          <span className="transfer-header-stats">
            {active.length > 0 && (
              <span className="transfer-stat transfer-stat-active">
                {active.length} en cours
              </span>
            )}
            {done.length > 0 && (
              <span className="transfer-stat transfer-stat-done">
                {done.length} terminé{done.length > 1 ? "s" : ""}
              </span>
            )}
            {failed.length > 0 && (
              <span className="transfer-stat transfer-stat-failed">
                {failed.length} échoué{failed.length > 1 ? "s" : ""}
              </span>
            )}
            {totalSpeed > 0 && (
              <span className="transfer-stat">
                {formatSpeed(totalSpeed)}
              </span>
            )}
          </span>
        </div>
        <div className="transfer-header-actions">
          {done.length + failed.length > 0 && (
            <button
              className="transfer-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClearCompleted();
              }}
            >
              Effacer
            </button>
          )}
          {active.length > 0 && (
            <button
              className="transfer-action-btn transfer-action-danger"
              onClick={(e) => {
                e.stopPropagation();
                onCancelAll();
              }}
            >
              Tout annuler
            </button>
          )}
          <span className="transfer-collapse-icon">
            {collapsed ? "\u25B2" : "\u25BC"}
          </span>
        </div>
      </div>

      {!collapsed && (
        <div className="transfer-list">
          {transfers.map((t) => (
            <TransferItem
              key={t.id}
              transfer={t}
              onCancel={() => onCancel(t.id)}
              onRetry={() => onRetry(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TransferItem({
  transfer: t,
  onCancel,
  onRetry,
}: {
  transfer: FileTransfer;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <div className={`transfer-item transfer-${t.status}`}>
      <div className="transfer-icon">{getFileIcon(t.fileName)}</div>
      <div className="transfer-info">
        <div className="transfer-name" title={t.fileName}>
          {t.fileName}
        </div>
        <div className="transfer-meta">
          {t.status === "uploading" && (
            <>
              {formatSize(t.uploadedBytes)} / {formatSize(t.fileSize)}
              {t.speed > 0 && <> &middot; {formatSpeed(t.speed)}</>}
              {t.eta > 0 && <> &middot; {formatEta(t.eta)}</>}
            </>
          )}
          {t.status === "queued" && (
            <span className="transfer-queued-text">En attente...</span>
          )}
          {t.status === "done" && (
            <span className="transfer-done-text">
              {formatSize(t.fileSize)} &middot; Terminé
            </span>
          )}
          {t.status === "error" && (
            <span className="transfer-error-text">
              Erreur{t.error ? `: ${t.error}` : ""}
            </span>
          )}
          {t.status === "cancelled" && (
            <span className="transfer-cancelled-text">Annulé</span>
          )}
        </div>
        {(t.status === "uploading" || t.status === "queued") && (
          <div className="transfer-progress-bar">
            <div
              className="transfer-progress-fill"
              style={{ width: `${t.progress}%` }}
            />
          </div>
        )}
      </div>
      <div className="transfer-item-actions">
        {(t.status === "uploading" || t.status === "queued") && (
          <button
            onClick={onCancel}
            className="transfer-cancel-btn"
            title="Annuler"
          >
            &#10005;
          </button>
        )}
        {(t.status === "error" || t.status === "cancelled") && (
          <button
            onClick={onRetry}
            className="transfer-retry-btn"
            title="Réessayer"
          >
            &#8635;
          </button>
        )}
        {t.status === "done" && (
          <span className="transfer-done-icon">&#10003;</span>
        )}
      </div>
    </div>
  );
}
