"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";
import { useRoom } from "@/hooks/useRoom";
import { getAdminTokenKey, SESSION_ID_KEY, DISPLAY_NAME_KEY } from "@/lib/constants";
import RoomView from "@/components/RoomView";
import JoinRoomForm from "@/components/JoinRoomForm";

export default function AdminRoomPage() {
  const params = useParams();
  const router = useRouter();
  const requestedRoomId = params.roomId as string;
  const { socket, isConnected } = useSocket();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [actualRoomId, setActualRoomId] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);
  const [joining, setJoining] = useState(false);
  const [selectedVote, setSelectedVote] = useState<number | null>(null);
  const [redirectNotice, setRedirectNotice] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const notice = sessionStorage.getItem("__pp_redirect_notice");
    if (notice) {
      sessionStorage.removeItem("__pp_redirect_notice");
      return notice;
    }
    return null;
  });

  // Auto-dismiss redirect notice after 5 seconds
  useEffect(() => {
    if (!redirectNotice) return;
    const timer = setTimeout(() => setRedirectNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [redirectNotice]);

  const roomId = actualRoomId || requestedRoomId;

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

  // Check if we already have a session (returning admin)
  useEffect(() => {
    if (!isConnected) return;

    const storedSession = sessionStorage.getItem(SESSION_ID_KEY);
    const storedName = sessionStorage.getItem(DISPLAY_NAME_KEY);
    const storedToken = localStorage.getItem(getAdminTokenKey(requestedRoomId));

    if (storedToken) {
      // Has admin token - check if room still exists first
      socket.emit("check-room", { roomId: requestedRoomId });

      const handleRoomCheck = (result: { exists: boolean; hasAdmin: boolean }) => {
        if (result.exists) {
          // Room still exists - rejoin as returning admin
          if (storedSession && storedName) {
            // Has session from same browser tab - use it
            setSessionId(storedSession);
            setDisplayName(storedName);
            setActualRoomId(requestedRoomId);
          } else {
            // New tab/browser but has adminToken - create new session and rejoin
            const newSessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            const name = storedName || "Admin";
            sessionStorage.setItem(SESSION_ID_KEY, newSessionId);
            sessionStorage.setItem(DISPLAY_NAME_KEY, name);
            setSessionId(newSessionId);
            setDisplayName(name);
            setActualRoomId(requestedRoomId);
          }
        } else {
          // Room was closed - need to create new one
          // Clear old data and start fresh
          localStorage.removeItem(getAdminTokenKey(requestedRoomId));
          sessionStorage.removeItem(SESSION_ID_KEY);
          if (storedName) {
            setDisplayName(storedName);
            setNeedsName(false);
          } else {
            setNeedsName(true);
          }
        }
      };

      socket.once("room-check-result", handleRoomCheck);
    } else if (storedName) {
      // Has a name from another session, use it directly
      setDisplayName(storedName);
      setNeedsName(false);
    } else {
      setNeedsName(true);
    }
  }, [requestedRoomId, socket, isConnected]);

  // Once we have a name and connection but no session yet, join as admin
  useEffect(() => {
    if (!displayName || !isConnected || sessionId || joining || needsName) return;

    setJoining(true);
    socket.emit("join-as-admin", { roomId: requestedRoomId, displayName }, (response) => {
      if (response.success && response.roomId && response.adminToken && response.sessionId) {
        localStorage.setItem(getAdminTokenKey(response.roomId), response.adminToken);
        sessionStorage.setItem(SESSION_ID_KEY, response.sessionId);
        sessionStorage.setItem(DISPLAY_NAME_KEY, displayName);
        setSessionId(response.sessionId);
        setActualRoomId(response.roomId);

        // If server gave us a different room ID (because original was taken),
        // store notice in sessionStorage (survives remount) and redirect
        if (response.roomId !== requestedRoomId) {
          sessionStorage.setItem(
            "__pp_redirect_notice",
            "Room was already taken. A new room has been created for you."
          );
          router.replace(`/room/${response.roomId}/admin`);
        }
      }
      setJoining(false);
    });
  }, [displayName, isConnected, sessionId, joining, needsName, socket, requestedRoomId, router]);

  // Rejoin room for returning admin
  useEffect(() => {
    if (sessionId && displayName && isConnected && actualRoomId) {
      joinRoom(displayName, sessionId);
    }
  }, [sessionId, displayName, isConnected, actualRoomId, joinRoom]);

  // Reset selected vote when a new round starts
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

  // Needs name
  if (needsName) {
    return <JoinRoomForm roomId={requestedRoomId} onJoin={handleJoin} />;
  }

  // Loading
  if (!roomState || !sessionId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">{"🃏"}</div>
          <p className="text-slate-500">
            {isConnected ? "Setting up room..." : "Connecting..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {redirectNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 animate-fade-in">
          <span>{"⚠️"}</span>
          <span>{redirectNotice}</span>
          <button
            onClick={() => setRedirectNotice(null)}
            className="ml-2 text-amber-500 hover:text-amber-700"
          >
            {"✕"}
          </button>
        </div>
      )}
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
    </>
  );
}
