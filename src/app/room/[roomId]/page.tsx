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
  const [waitingForAdmin, setWaitingForAdmin] = useState(false);
  const [roomChecked, setRoomChecked] = useState(false);
  const [roomExists, setRoomExists] = useState(false);

  const {
    roomState,
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

  // Initialize session
  useEffect(() => {
    const storedSession = sessionStorage.getItem(SESSION_ID_KEY);
    const storedName = sessionStorage.getItem(DISPLAY_NAME_KEY);

    if (storedSession && storedName) {
      setSessionId(storedSession);
      setDisplayName(storedName);
      setNeedsName(false);
    } else {
      setNeedsName(true);
    }
  }, []);

  // Check room existence (only after we know if we need a name)
  useEffect(() => {
    if (!isConnected) return;

    // Wait until needsName is determined (after initialization)
    if (sessionId === null && displayName === null) return;

    // If we need a name, don't check the room yet
    if (needsName) return;

    const handleRoomCheckResult = (result: { exists: boolean; hasAdmin: boolean }) => {
      setRoomChecked(true);
      setRoomExists(result.exists);

      if (!result.exists) {
        // Room doesn't exist - error will be shown
        return;
      }

      if (!result.hasAdmin) {
        // Room exists but no admin - show waiting spinner
        setWaitingForAdmin(true);
        return;
      }

      // Room exists and has admin - proceed with normal flow
      setWaitingForAdmin(false);
    };

    socket.on("room-check-result", handleRoomCheckResult);
    socket.emit("check-room", { roomId });

    return () => {
      socket.off("room-check-result", handleRoomCheckResult);
    };
  }, [socket, isConnected, roomId, needsName, sessionId, displayName]);

  // Join room once we have session, connection, and room is valid
  useEffect(() => {
    if (sessionId && displayName && isConnected && roomChecked && roomExists && !waitingForAdmin) {
      joinRoom(displayName, sessionId);
    }
  }, [sessionId, displayName, isConnected, roomChecked, roomExists, waitingForAdmin, joinRoom]);

  // Handle "Waiting for admin" error
  useEffect(() => {
    if (error && error.includes("Waiting for admin")) {
      setWaitingForAdmin(true);
    }
  }, [error]);

  // When room state arrives, check if admin is now present
  useEffect(() => {
    if (roomState && waitingForAdmin) {
      const hasAdmin = roomState.participants.some((p) => p.isAdmin && p.isConnected);
      if (hasAdmin) {
        setWaitingForAdmin(false);
        // Try to join now that admin is present
        if (sessionId && displayName) {
          joinRoom(displayName, sessionId);
        }
      }
    }
  }, [roomState, waitingForAdmin, sessionId, displayName, joinRoom]);

  // Listen for admin disconnect/reconnect events
  useEffect(() => {
    const handleAdminDisconnected = () => {
      setWaitingForAdmin(true);
    };

    const handleAdminReconnected = () => {
      setWaitingForAdmin(false);
      // Re-check room when admin reconnects (in case we were waiting)
      if (sessionId && displayName) {
        joinRoom(displayName, sessionId);
      }
    };

    socket.on("admin-disconnected", handleAdminDisconnected);
    socket.on("admin-reconnected", handleAdminReconnected);

    return () => {
      socket.off("admin-disconnected", handleAdminDisconnected);
      socket.off("admin-reconnected", handleAdminReconnected);
    };
  }, [socket, sessionId, displayName, joinRoom]);

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

  // Waiting for admin
  if (waitingForAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">{"⏳"}</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Waiting for Admin
          </h2>
          <p className="text-slate-500 mb-6">
            The room admin hasn't joined yet. Please wait...
          </p>
        </div>
      </div>
    );
  }

  // Error state - room not found or expired
  if (roomChecked && !roomExists) {
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

  // Needs name (show before checking room, or after room is validated)
  if (needsName) {
    // If we haven't checked the room yet, show the join form
    if (!roomChecked) {
      return <JoinRoomForm roomId={roomId} onJoin={handleJoin} />;
    }
    // If we checked and room exists with admin, show join form
    if (roomExists && !waitingForAdmin) {
      return <JoinRoomForm roomId={roomId} onJoin={handleJoin} />;
    }
    // Otherwise (room doesn't exist or waiting for admin), don't show form
    // Fall through to other states (Room Not Found or Waiting for Admin)
  }

  // Loading
  if (!roomChecked || !roomState || !sessionId) {
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
