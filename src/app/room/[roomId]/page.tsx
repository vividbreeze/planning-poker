"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";
import { useRoom } from "@/hooks/useRoom";
import { SESSION_ID_KEY, DISPLAY_NAME_KEY } from "@/lib/constants";
import RoomView from "@/components/RoomView";
import JoinRoomForm from "@/components/JoinRoomForm";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { socket, isConnected } = useSocket();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);
  const [selectedVote, setSelectedVote] = useState<number | null>(null);
  const [roomEnsured, setRoomEnsured] = useState(false);
  const [roomUnavailable, setRoomUnavailable] = useState(false);
  const ensuredRef = useRef(false);

  const {
    roomState,
    roomClosed,
    error,
    isAdmin,
    joinRoom,
    vote,
    reveal,
    reset,
    updateSettings,
    deleteEstimate,
    clearAllParticipants,
    startTimer,
    stopTimer,
  } = useRoom(roomId, sessionId);

  // Ensure room exists (create if needed) before joining
  useEffect(() => {
    if (!isConnected || ensuredRef.current) return;
    ensuredRef.current = true;

    socket.emit("ensure-room", { roomId }, (response) => {
      if (response.exists) {
        setRoomEnsured(true);
      } else {
        setRoomUnavailable(true);
      }
    });
  }, [isConnected, socket, roomId]);

  // Initialize session
  useEffect(() => {
    const storedSession = sessionStorage.getItem(SESSION_ID_KEY);
    const storedName = sessionStorage.getItem(DISPLAY_NAME_KEY);

    if (storedSession && storedName) {
      setSessionId(storedSession);
      setDisplayName(storedName);
    } else {
      setNeedsName(true);
    }
  }, []);

  // Join room once we have session, connection, and room is ensured
  useEffect(() => {
    if (sessionId && displayName && isConnected && roomEnsured) {
      joinRoom(displayName, sessionId);
    }
  }, [sessionId, displayName, isConnected, roomEnsured, joinRoom]);

  // Reset selected vote when a new round starts (votes reset)
  useEffect(() => {
    if (
      roomState &&
      !roomState.isRevealed &&
      !roomState.participants.some((p) => p.hasVoted)
    ) {
      setSelectedVote(null);
    }
  }, [roomState]);

  const handleJoin = useCallback(
    (name: string) => {
      const newSessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_ID_KEY, newSessionId);
      sessionStorage.setItem(DISPLAY_NAME_KEY, name);
      setSessionId(newSessionId);
      setDisplayName(name);
      setNeedsName(false);
    },
    []
  );

  const handleVote = useCallback(
    (value: number) => {
      if (!sessionId) return;
      if (selectedVote === value) {
        setSelectedVote(null);
        deleteEstimate(sessionId);
      } else {
        setSelectedVote(value);
        vote(value, sessionId);
      }
    },
    [sessionId, vote, deleteEstimate, selectedVote]
  );

  // Room closed
  if (roomClosed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4">{"👋"}</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Room Closed
          </h2>
          <p className="text-slate-500 mb-6">
            This room has been closed by the admin.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            Create New Room
          </button>
        </div>
      </div>
    );
  }

  // Room ID unavailable (reserved)
  if (roomUnavailable) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4">{"😕"}</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Room Unavailable
          </h2>
          <p className="text-slate-500 mb-6">
            This room ID is no longer available.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            Create New Room
          </button>
        </div>
      </div>
    );
  }

  // Error state - room not found or expired
  if (error && !roomState) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4">{"😕"}</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Room Not Found
          </h2>
          <p className="text-slate-500 mb-6">
            The room <span className="font-mono font-bold">{roomId}</span>{" "}
            does not exist or has expired.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            Create New Room
          </button>
        </div>
      </div>
    );
  }

  // Needs name
  if (needsName) {
    return <JoinRoomForm roomId={roomId} onJoin={handleJoin} />;
  }

  // Loading
  if (!roomState || !sessionId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">{"🃏"}</div>
          <p className="text-slate-500">
            {isConnected ? "Loading room..." : "Connecting..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <RoomView
      roomState={roomState}
      isAdmin={isAdmin}
      currentSessionId={sessionId}
      selectedVote={selectedVote}
      onVote={handleVote}
      onReveal={reveal}
      onReset={reset}
      onUpdateSettings={updateSettings}
      onClearAllParticipants={clearAllParticipants}
      onStartTimer={startTimer}
      onStopTimer={stopTimer}
    />
  );
}
