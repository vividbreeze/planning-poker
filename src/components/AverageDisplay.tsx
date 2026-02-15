"use client";

import { Vote } from "@/types/shared";

interface AverageDisplayProps {
  votes: Vote[];
  estimateOptions: number[];
}

function roundUpToNearest(avg: number, options: number[]): number {
  const sorted = [...options].sort((a, b) => a - b);
  for (const opt of sorted) {
    if (opt >= avg) return opt;
  }
  return sorted[sorted.length - 1];
}

export default function AverageDisplay({ votes, estimateOptions }: AverageDisplayProps) {
  if (votes.length === 0) return null;

  const values = votes.map((v) => v.value);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const rounded = roundUpToNearest(avg, estimateOptions);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-xl">
      <span className="text-sm text-blue-600 font-medium">Average:</span>
      <span className="text-lg font-bold text-blue-700">
        {rounded}
      </span>
      <span className="text-xs text-blue-400">
        ({avg.toFixed(1)} exact, {votes.length} vote{votes.length !== 1 ? "s" : ""})
      </span>
    </div>
  );
}
