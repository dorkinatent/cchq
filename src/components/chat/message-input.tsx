"use client";

import { useState, useRef, useCallback } from "react";

export type Attachment = {
  path: string;
  name: string;
  preview: string; // data URL for display
};

export function MessageInput({
  onSend,
  disabled,
}: {
  onSend: (content: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File): Promise<Attachment | null> {
    // Create preview
    const preview = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    // Upload to server
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) return null;

    const { path, name } = await res.json();
    return { path, name, preview };
  }

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (imageFiles.length === 0) return;

    setUploading(true);
    const results = await Promise.all(imageFiles.map(uploadFile));
    const valid = results.filter((r): r is Attachment => r !== null);
    setAttachments((prev) => [...prev, ...valid]);
    setUploading(false);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!value.trim() && attachments.length === 0) || disabled) return;
    onSend(value.trim(), attachments.length > 0 ? attachments : undefined);
    setValue("");
    setAttachments([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter((item) =>
      item.type.startsWith("image/")
    );
    if (imageItems.length === 0) return;

    e.preventDefault();
    const files = imageItems
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    handleFiles(files);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="px-5 py-4 border-t border-[var(--border)]"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {attachments.map((att, i) => (
            <div key={i} className="relative group">
              <img
                src={att.preview}
                alt={att.name}
                className="w-16 h-16 object-cover rounded-md border border-[var(--border)]"
              />
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--surface-raised)] rounded-full text-xs text-[var(--text-primary)] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--errored-bg)]"
              >
                x
              </button>
              <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[64px] mt-0.5">
                {att.name}
              </div>
            </div>
          ))}
          {uploading && (
            <div className="w-16 h-16 rounded-md border border-[var(--border)] flex items-center justify-center">
              <span className="text-xs text-[var(--text-muted)] animate-pulse">...</span>
            </div>
          )}
        </div>
      )}

      <div
        className={`flex gap-3 items-end rounded-lg transition-colors ${
          dragOver ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]" : ""
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="px-3 py-3 text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-50 shrink-0"
          title="Attach image"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={dragOver ? "Drop image here..." : "Type a message or paste/drop an image..."}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] resize-none placeholder-[var(--text-muted)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || (!value.trim() && attachments.length === 0)}
          className="bg-[var(--accent)] text-[var(--bg)] px-4 py-3 rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 shrink-0"
        >
          Send
        </button>
      </div>
    </form>
  );
}
