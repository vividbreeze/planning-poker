"use client";

import { Participant, Vote } from "@/types/shared";
import ParticipantAvatar from "./ParticipantAvatar";

interface ParticipantListProps {
  participants: Participant[];
  votes: Vote[];
  isRevealed: boolean;
  currentSessionId: string;
}

export default function ParticipantList({
  participants,
  votes,
  isRevealed,
  currentSessionId,
}: ParticipantListProps) {
  const votesMap = new Map(votes.map((v) => [v.sessionId, v]));

  return (
    <div className="flex flex-wrap justify-center gap-6 p-6">
      {participants.map((participant) => (
        <ParticipantAvatar
          key={participant.sessionId}
          participant={participant}
          vote={votesMap.get(participant.sessionId)}
          isRevealed={isRevealed}
          isCurrentUser={participant.sessionId === currentSessionId}
        />
      ))}
    </div>
  );
}
