"use client";

import { useState } from "react";
import { RoomState, RoomSettings } from "@/types/shared";
import CardDeck from "./CardDeck";
import ParticipantList from "./ParticipantList";
import RevealButton from "./RevealButton";
import ShareLink from "./ShareLink";
import SettingsPanel from "./SettingsPanel";
import Timer from "./Timer";
import AverageDisplay from "./AverageDisplay";

interface RoomViewProps {
  roomState: RoomState;
  isAdmin: boolean;
  currentSessionId: string;
  selectedVote: number | null;
  onVote: (value: number) => void;
  onReveal: () => void;
  onReset: () => void;
  onUpdateSettings: (settings: Partial<RoomSettings>) => void;
  onClearAllParticipants: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
}

export default function RoomView({
  roomState,
  isAdmin,
  currentSessionId,
  selectedVote,
  onVote,
  onReveal,
  onReset,
  onUpdateSettings,
  onClearAllParticipants,
  onStartTimer,
  onStopTimer,
}: RoomViewProps) {
  const [showSettings, setShowSettings] = useState(false);
  const { settings, participants, votes, isRevealed, timerStartedAt } = roomState;

  const hasVotes = participants.some((p) => p.hasVoted);
  const canReveal =
    isAdmin || settings.allowOthersToShowEstimates;
  const canReset =
    isAdmin || settings.allowOthersToDeleteEstimates;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-800">
              Planning Poker
            </h1>
            <ShareLink roomId={roomState.roomId} />
          </div>

          <div className="flex items-center gap-3">
            {settings.showTimer && (
              <Timer
                timerStartedAt={timerStartedAt}
                duration={settings.timerDuration}
                isAdmin={isAdmin}
                onStart={onStartTimer}
                onStop={onStopTimer}
              />
            )}

            {isAdmin && participants.length > 1 && (
              <button
                onClick={onClearAllParticipants}
                className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                title="Remove all participants"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="17" y1="8" x2="23" y2="14" />
                  <line x1="23" y1="8" x2="17" y2="14" />
                </svg>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                title="Settings"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
        {/* Participants */}
        <div className="flex-1 flex items-center justify-center py-8">
          <div className="w-full">
            <ParticipantList
              participants={participants}
              votes={votes}
              isRevealed={isRevealed}
              currentSessionId={currentSessionId}
            />

            {/* Average and Reveal controls */}
            <div className="flex flex-col items-center gap-4 mt-6">
              {isRevealed && settings.showAverage && (
                <AverageDisplay votes={votes} estimateOptions={settings.estimateOptions} />
              )}

              {(canReveal || canReset) && (
                <RevealButton
                  isRevealed={isRevealed}
                  onReveal={onReveal}
                  onReset={onReset}
                  hasVotes={hasVotes}
                />
              )}
            </div>
          </div>
        </div>

        {/* Card Deck */}
        <div className="border-t border-slate-200 bg-white py-4">
          {selectedVote !== null && !isRevealed && (
            <p className="text-center text-sm text-blue-600 font-medium mb-2">
              Your vote: {selectedVote}
            </p>
          )}
          <CardDeck
            options={settings.estimateOptions}
            selectedValue={selectedVote}
            onSelect={onVote}
            disabled={isRevealed}
          />
        </div>
      </main>

      {/* Feedback link */}
      <div className="text-center py-2">
        <a
          href="mailto:feedback-planningpoker@vividbreeze.com?subject=Planning%20Poker%20Feedback"
          className="text-xs text-slate-300 hover:text-slate-500 transition-colors"
        >
          Feedback
        </a>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          roomId={roomState.roomId}
          onUpdate={onUpdateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
