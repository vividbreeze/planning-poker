"use client";

import { Participant, Vote } from "@/types/shared";
import EstimationCard from "./EstimationCard";

interface ParticipantAvatarProps {
  participant: Participant;
  vote?: Vote;
  isRevealed: boolean;
  isCurrentUser: boolean;
}

export default function ParticipantAvatar({
  participant,
  vote,
  isRevealed,
  isCurrentUser,
}: ParticipantAvatarProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 group relative">
      {/* Name above card */}
      <div className="flex items-center gap-1.5 max-w-[100px]">
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            participant.hasVoted ? "bg-green-500" : "bg-slate-300"
          }`}
        />
        <span
          className={`text-xs font-medium truncate ${
            isCurrentUser ? "text-blue-600" : "text-slate-700"
          }`}
        >
          {participant.displayName}
          {participant.isAdmin && " ★"}
        </span>
      </div>

      {/* Card area */}
      <div className="relative">
        {participant.hasVoted || (isRevealed && vote) ? (
          <EstimationCard
            value={vote?.value ?? 0}
            revealed={isRevealed}
            size="sm"
          />
        ) : (
          <div className="w-14 h-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50">
            <span className="text-slate-300 text-sm">-</span>
          </div>
        )}
      </div>

    </div>
  );
}
