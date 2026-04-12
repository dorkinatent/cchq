"use client";

import { useState } from "react";

export function MessageInput({
  onSend,
  disabled,
}: {
  onSend: (content: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-5 py-4 border-t border-neutral-800">
      <div className="flex gap-3 items-end">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled}
          rows={1}
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-sm text-white resize-none placeholder-neutral-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="bg-blue-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 shrink-0"
        >
          Send
        </button>
      </div>
    </form>
  );
}
