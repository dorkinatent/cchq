"use client";

import { useEffect, useState } from "react";

type KnowledgeEntry = {
  id: string;
  type: string;
  content: string;
};

export function SessionContextPanel({
  sessionId,
  projectId,
  projectPath,
  model,
  messageCount,
}: {
  sessionId: string;
  projectId: string;
  projectPath: string;
  model: string;
  messageCount: number;
}) {
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);

  useEffect(() => {
    if (projectId) {
      fetch(`/api/knowledge?projectId=${projectId}`)
        .then((r) => r.json())
        .then((entries) => setKnowledge(entries.slice(0, 10)));
    }
  }, [projectId]);

  return (
    <div className="w-64 border-l border-neutral-800 p-4 overflow-y-auto shrink-0">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-3">
        Session Context
      </div>

      <div className="bg-neutral-900 rounded-md p-2.5 mb-2.5">
        <div className="text-[11px] text-neutral-500 mb-1">Working Directory</div>
        <div className="text-xs text-neutral-300 font-mono truncate">{projectPath}</div>
      </div>

      <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-4 mb-2">
        Injected Knowledge
      </div>
      {knowledge.length === 0 ? (
        <div className="text-xs text-neutral-600">No knowledge entries for this project.</div>
      ) : (
        knowledge.map((k) => (
          <div
            key={k.id}
            className="bg-green-950/20 border border-green-950/30 rounded-md p-2.5 mb-2"
          >
            <div className="text-[11px] text-green-400 mb-1">{k.type}</div>
            <div className="text-xs text-neutral-400 leading-relaxed">{k.content}</div>
          </div>
        ))
      )}

      <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-4 mb-2">
        Session Stats
      </div>
      <div className="text-xs text-neutral-500 leading-loose">
        Messages: {messageCount}<br />
        Model: {model}
      </div>
    </div>
  );
}
