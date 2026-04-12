import Link from "next/link";
import type { Session } from "@/hooks/use-sessions";

const statusStyles = {
  active: { bg: "bg-green-950/50", text: "text-green-400", dot: "●" },
  paused: { bg: "bg-yellow-950/50", text: "text-yellow-400", dot: "◐" },
  completed: { bg: "bg-neutral-800", text: "text-neutral-400", dot: "○" },
  errored: { bg: "bg-red-950/50", text: "text-red-400", dot: "✕" },
};

export function SessionCard({ session }: { session: Session }) {
  const style = statusStyles[session.status];

  return (
    <Link
      href={`/sessions/${session.id}`}
      className={`block bg-neutral-900 border rounded-lg p-4 hover:border-blue-800/50 transition-colors ${
        session.status === "active" ? "border-blue-900/30" : "border-neutral-800"
      } ${session.status === "paused" ? "opacity-70" : ""}`}
    >
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-sm font-medium text-white truncate mr-2">
          {session.name}
        </span>
        <span className={`text-[11px] ${style.bg} ${style.text} px-2 py-0.5 rounded-full shrink-0`}>
          {style.dot} {session.status}
        </span>
      </div>
      <div className="text-xs text-neutral-500 mb-2">
        {session.project_name || "Unknown project"} &middot; {session.model}
      </div>
      {session.last_message && (
        <div className="text-[13px] text-neutral-400 line-clamp-2 mb-3 leading-relaxed">
          {session.last_message}
        </div>
      )}
      <div className="flex justify-between items-center text-[11px] text-neutral-600">
        <span>{session.message_count || 0} messages</span>
        <span>{new Date(session.updated_at).toLocaleString()}</span>
      </div>
    </Link>
  );
}
