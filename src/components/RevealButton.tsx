"use client";

interface RevealButtonProps {
  isRevealed: boolean;
  onReveal: () => void;
  onReset: () => void;
  hasVotes: boolean;
}

export default function RevealButton({
  isRevealed,
  onReveal,
  onReset,
  hasVotes,
}: RevealButtonProps) {
  if (isRevealed) {
    return (
      <button
        onClick={onReset}
        className="px-6 py-3 bg-slate-700 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors shadow-lg"
      >
        New Round
      </button>
    );
  }

  return (
    <button
      onClick={onReveal}
      disabled={!hasVotes}
      className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Reveal Cards
    </button>
  );
}
