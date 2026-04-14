"use client";

export function CostCard({
  data,
}: {
  data: { totalTokens: number; totalCostUsd: number; numTurns: number };
}) {
  const tokens = data.totalTokens;
  const cost = data.totalCostUsd;
  const turns = data.numTurns;
  const avgPerTurn = turns > 0 ? cost / turns : 0;

  return (
    <div className="grid grid-cols-4 gap-4 pt-1">
      <StatCell
        label="Tokens"
        value={tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString()}
        hint={tokens >= 1000 ? tokens.toLocaleString() : undefined}
      />
      <StatCell
        label="Cost"
        value={`$${cost.toFixed(2)}`}
        hint={cost > 0 ? `$${cost.toFixed(4)}` : undefined}
      />
      <StatCell label="Turns" value={turns.toLocaleString()} />
      <StatCell label="Avg/turn" value={`$${avgPerTurn.toFixed(3)}`} />
    </div>
  );
}

function StatCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="eyebrow">{label}</div>
      <div className="font-semibold text-[var(--text-primary)] text-[19px] leading-none tabular-nums tracking-tight">
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
          {hint}
        </div>
      )}
    </div>
  );
}
