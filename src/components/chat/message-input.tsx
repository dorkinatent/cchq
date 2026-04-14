"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SlashAutocomplete } from "./slash-autocomplete";
import { useToast } from "@/components/ui/toast";

export type Attachment = {
  path: string;
  name: string;
  preview: string; // data URL for display
};

type Command = { name: string; description: string; argumentHint: string };

export function MessageInput({
  onSend,
  disabled,
  enqueue,
  sessionId,
  busy,
  onInterrupt,
}: {
  onSend: (content: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
  enqueue?: (content: string, attachments?: { path: string; name: string }[]) => void;
  sessionId?: string;
  busy?: boolean;
  onInterrupt?: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!busy) setStopping(false);
  }, [busy]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea to fit its content, capped so a runaway paste
  // doesn't push the chat off-screen. Past the cap, the textarea scrolls.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // When empty, don't let a wrapping placeholder inflate the height in
    // narrow columns — clamp to the single-line min. CSS `min-h-11` then
    // enforces the 44px floor.
    if (!value) {
      el.style.height = "";
      el.style.overflowY = "hidden";
      return;
    }
    const MAX_PX = 240; // ~10 lines; then scroll
    el.style.height = Math.min(el.scrollHeight, MAX_PX) + "px";
    el.style.overflowY = el.scrollHeight > MAX_PX ? "auto" : "hidden";
  }, [value]);

  // When the column/sidebar resizes, a multi-line wrapped message's height
  // can go stale. Re-run the same clamp logic on width changes.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      el.style.height = "auto";
      if (!el.value) {
        el.style.height = "";
        el.style.overflowY = "hidden";
        return;
      }
      const MAX_PX = 240;
      el.style.height = Math.min(el.scrollHeight, MAX_PX) + "px";
      el.style.overflowY = el.scrollHeight > MAX_PX ? "auto" : "hidden";
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Slash command autocomplete
  const [commands, setCommands] = useState<Command[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [slashFilter, setSlashFilter] = useState("");

  // Fetch commands when session becomes available
  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}/commands`)
      .then((r) => r.json())
      .then((cmds) => {
        if (Array.isArray(cmds)) setCommands(cmds);
      })
      .catch(() => {});
  }, [sessionId]);

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

  function handleValueChange(newValue: string) {
    setValue(newValue);

    // Check for slash command trigger
    if (newValue.startsWith("/") && !newValue.includes(" ")) {
      const filter = newValue.slice(1);
      setSlashFilter(filter);
      setShowAutocomplete(true);
      setSelectedIndex(0);

      // If we have no commands yet, try fetching (covers cold-start sessions
      // where commands weren't available on mount but are now).
      if (commands.length === 0 && sessionId) {
        fetch(`/api/sessions/${sessionId}/commands`)
          .then((r) => r.json())
          .then((cmds) => {
            if (Array.isArray(cmds) && cmds.length > 0) setCommands(cmds);
          })
          .catch(() => {});
      }
    } else {
      setShowAutocomplete(false);
    }
  }

  function handleSelectCommand(cmd: Command) {
    setValue(`/${cmd.name} `);
    setShowAutocomplete(false);
  }

  // Commands that are handled client-side in the CLI and need custom
  // CCUI handlers. Others fall through to the SDK as regular prompts.
  const CLI_ONLY_COMMANDS = new Set([
    "mcp", "model", "cost", "doctor", "login", "logout",
    "permissions", "status", "vim", "config",
  ]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!value.trim() && attachments.length === 0) || disabled) return;
    setShowAutocomplete(false);
    const trimmed = value.trim();

    // Intercept slash commands that won't work through the SDK.
    if (trimmed.startsWith("/")) {
      const cmdName = trimmed.slice(1).split(/\s/)[0].toLowerCase();
      if (CLI_ONLY_COMMANDS.has(cmdName)) {
        toast(`/${cmdName} is a CLI-only command — not yet supported in the web UI`, { variant: "error" });
        return;
      }
    }

    const atts = attachments.length > 0 ? attachments : undefined;
    if (enqueue) {
      enqueue(
        trimmed,
        atts?.map((a) => ({ path: a.path, name: a.name }))
      );
    } else {
      onSend(trimmed, atts);
    }
    setValue("");
    setAttachments([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Handle autocomplete navigation
    if (showAutocomplete) {
      const filtered = slashFilter
        ? commands.filter((c) => c.name.toLowerCase().startsWith(slashFilter.toLowerCase()))
        : commands;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && filtered.length > 0)) {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          handleSelectCommand(filtered[selectedIndex]);
        }
        return;
      }
      if (e.key === "Escape") {
        setShowAutocomplete(false);
        return;
      }
    }

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
      className="px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] border-t border-[var(--border)]"
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
            <div className="w-16 h-16 rounded-md border border-[var(--border)] flex items-center justify-center gap-1">
              <span className="thinking-dot inline-block w-1 h-1 rounded-full bg-[var(--text-muted)]" style={{ animationDelay: "0ms" }} />
              <span className="thinking-dot inline-block w-1 h-1 rounded-full bg-[var(--text-muted)]" style={{ animationDelay: "200ms" }} />
              <span className="thinking-dot inline-block w-1 h-1 rounded-full bg-[var(--text-muted)]" style={{ animationDelay: "400ms" }} />
            </div>
          )}
        </div>
      )}

      <div
        className={`relative flex gap-3 items-end rounded-lg transition-colors ${
          dragOver ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]" : ""
        }`}
      >
        {/* Slash command autocomplete */}
        <SlashAutocomplete
          commands={commands}
          filter={slashFilter}
          selectedIndex={selectedIndex}
          onSelect={handleSelectCommand}
          visible={showAutocomplete}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          aria-label="Attach image files"
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
          ref={textareaRef}
          value={value}
          onChange={(e) => handleValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            dragOver ? "Drop image…" : busy ? "Queue a message…" : "Message or /command…"
          }
          disabled={disabled}
          rows={1}
          aria-label="Message input"
          className="flex-1 min-h-11 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-4 py-3 text-base md:text-sm leading-[1.5] text-[var(--text-primary)] resize-none placeholder-[var(--text-muted)] disabled:opacity-50"
        />
        {busy && onInterrupt ? (
          <button
            type="button"
            onClick={() => {
              if (stopping) return;
              setStopping(true);
              toast("Interrupting…");
              onInterrupt();
            }}
            disabled={stopping}
            title="Stop the current turn (Esc)"
            className="min-h-11 min-w-11 bg-[var(--errored-bg)] border border-[var(--errored-text)] text-[var(--errored-text)] px-4 py-3 rounded-lg text-sm font-medium hover:bg-[var(--errored-text)] hover:text-[var(--bg)] disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {stopping ? "Stopping…" : "Stop"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || (!value.trim() && attachments.length === 0)}
            className="min-h-11 min-w-11 bg-[var(--accent)] text-[var(--bg)] px-4 py-3 rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Send
          </button>
        )}
      </div>
    </form>
  );
}
