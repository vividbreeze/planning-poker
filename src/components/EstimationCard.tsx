"use client";

import { getThemeForValue } from "@/lib/cardThemes";

interface EstimationCardProps {
  value: number;
  selected?: boolean;
  revealed?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function EstimationCard({
  value,
  selected = false,
  revealed = false,
  onClick,
  disabled = false,
  size = "md",
}: EstimationCardProps) {
  const theme = getThemeForValue(value);

  const sizeClasses = {
    sm: "w-14 h-20",
    md: "w-20 h-28",
    lg: "w-24 h-36",
  };

  const emojiSizes = {
    sm: "text-2xl",
    md: "text-3xl",
    lg: "text-4xl",
  };

  const valueSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${sizeClasses[size]}
        relative cursor-pointer select-none
        transition-all duration-300 ease-out
        ${selected ? "-translate-y-3 scale-105" : "hover:-translate-y-1"}
        ${disabled ? "cursor-not-allowed opacity-60" : ""}
      `}
      style={{ perspective: "1000px" }}
    >
      <div
        className={`
          relative w-full h-full transition-transform duration-500 ease-out
          ${revealed ? "[transform:rotateY(180deg)]" : ""}
        `}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Card Back */}
        <div
          className="absolute inset-0 rounded-xl border-2 border-slate-600 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center shadow-md"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="w-[80%] h-[80%] rounded-lg border border-slate-500 bg-slate-700/50 flex items-center justify-center">
            <span className="text-slate-400 text-2xl font-bold">?</span>
          </div>
        </div>

        {/* Card Front */}
        <div
          className="absolute inset-0 rounded-xl border-2 flex flex-col items-center justify-center gap-1 shadow-md p-1"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderColor: theme.color,
            backgroundColor: theme.bgColor,
          }}
        >
          <span className={emojiSizes[size]}>{theme.emoji}</span>
          <span
            className={`${valueSizes[size]} font-bold`}
            style={{ color: theme.color }}
          >
            {value}
          </span>
        </div>
      </div>

      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 rounded-xl ring-3 ring-blue-500 ring-offset-2 pointer-events-none"
        />
      )}
    </button>
  );
}
