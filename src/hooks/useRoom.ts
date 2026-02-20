"use client";

import React, { useEffect, useReducer, useCallback, useRef, useState } from "react";
import { useSocket } from "./useSocket";
import {
  RoomState,
  Participant,
  Vote,
  RoomSettings,
} from "@/types/shared";
import { getAdminTokenKey } from "@/lib/constants";

type RoomAction =
  | { type: "SET_STATE"; payload: RoomState }
  | { type: "PARTICIPANT_JOINED"; payload: Participant }
  | { type: "PARTICIPANT_LEFT"; payload: string }
  | { type: "PARTICIPANT_UPDATED"; payload: Participant }
  | { type: "VOTE_CAST"; payload: { sessionId: string; hasVoted: boolean } }
  | { type: "VOTES_REVEALED"; payload: Vote[] }
  | { type: "VOTES_RESET" }
  | { type: "SETTINGS_UPDATED"; payload: RoomSettings }
  | { type: "TIMER_STARTED"; payload: number }
  | { type: "TIMER_STOPPED" };

function roomReducer(
  state: RoomState | null,
  action: RoomAction
): RoomState | null {
  switch (action.type) {
    case "SET_STATE":
      return action.payload;

    case "PARTICIPANT_JOINED":
      if (!state) return state;
      // Don't add if already exists
      if (state.participants.find((p) => p.sessionId === action.payload.sessionId)) {
        return {
          ...state,
          participants: state.participants.map((p) =>
            p.sessionId === action.payload.sessionId ? action.payload : p
          ),
        };
      }
      return {
        ...state,
        participants: [...state.participants, action.payload],
      };

    case "PARTICIPANT_LEFT":
      if (!state) return state;
      return {
        ...state,
        participants: state.participants.filter(
          (p) => p.sessionId !== action.payload
        ),
      };

    case "PARTICIPANT_UPDATED":
      if (!state) return state;
      return {
        ...state,
        participants: state.participants.map((p) =>
          p.sessionId === action.payload.sessionId ? action.payload : p
        ),
      };

    case "VOTE_CAST":
      if (!state) return state;
      return {
        ...state,
        participants: state.participants.map((p) =>
          p.sessionId === action.payload.sessionId
            ? { ...p, hasVoted: action.payload.hasVoted }
            : p
        ),
      };

    case "VOTES_REVEALED":
      if (!state) return state;
      return {
        ...state,
        isRevealed: true,
        votes: action.payload,
      };

    case "VOTES_RESET":
      if (!state) return state;
      return {
        ...state,
        isRevealed: false,
        votes: [],
        timerStartedAt: null,
        participants: state.participants.map((p) => ({
          ...p,
          hasVoted: false,
        })),
      };

    case "SETTINGS_UPDATED":
      if (!state) return state;
      return {
        ...state,
        settings: action.payload,
      };

    case "TIMER_STARTED":
      if (!state) return state;
      return {
        ...state,
        timerStartedAt: action.payload,
      };

    case "TIMER_STOPPED":
      if (!state) return state;
      return {
        ...state,
        timerStartedAt: null,
      };

    default:
      return state;
  }
}

export function useRoom(roomId: string, sessionId: string | null) {
  const { socket, isConnected } = useSocket();
  const [roomState, dispatch] = useReducer(roomReducer, null);
  const [error, setError] = useState<string | null>(null);

  // Use refs to avoid stale closures
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  useEffect(() => {
    const onRoomState = (state: RoomState) =>
      dispatch({ type: "SET_STATE", payload: state });
    const onParticipantJoined = (p: Participant) =>
      dispatch({ type: "PARTICIPANT_JOINED", payload: p });
    const onParticipantLeft = (sessionId: string) =>
      dispatch({ type: "PARTICIPANT_LEFT", payload: sessionId });
    const onParticipantUpdated = (p: Participant) =>
      dispatch({ type: "PARTICIPANT_UPDATED", payload: p });
    const onVoteCast = (v: { sessionId: string; hasVoted: boolean }) =>
      dispatch({ type: "VOTE_CAST", payload: v });
    const onVotesRevealed = (votes: Vote[]) =>
      dispatch({ type: "VOTES_REVEALED", payload: votes });
    const onVotesReset = () => dispatch({ type: "VOTES_RESET" });
    const onSettingsUpdated = (s: RoomSettings) =>
      dispatch({ type: "SETTINGS_UPDATED", payload: s });
    const onTimerStarted = (t: number) =>
      dispatch({ type: "TIMER_STARTED", payload: t });
    const onTimerStopped = () => dispatch({ type: "TIMER_STOPPED" });
    const onError = (e: { message: string }) => setError(e.message);

    socket.on("room-state", onRoomState);
    socket.on("participant-joined", onParticipantJoined);
    socket.on("participant-left", onParticipantLeft);
    socket.on("participant-updated", onParticipantUpdated);
    socket.on("vote-cast", onVoteCast);
    socket.on("votes-revealed", onVotesRevealed);
    socket.on("votes-reset", onVotesReset);
    socket.on("settings-updated", onSettingsUpdated);
    socket.on("timer-started", onTimerStarted);
    socket.on("timer-stopped", onTimerStopped);
    socket.on("error", onError);

    return () => {
      socket.off("room-state", onRoomState);
      socket.off("participant-joined", onParticipantJoined);
      socket.off("participant-left", onParticipantLeft);
      socket.off("participant-updated", onParticipantUpdated);
      socket.off("vote-cast", onVoteCast);
      socket.off("votes-revealed", onVotesRevealed);
      socket.off("votes-reset", onVotesReset);
      socket.off("settings-updated", onSettingsUpdated);
      socket.off("timer-started", onTimerStarted);
      socket.off("timer-stopped", onTimerStopped);
      socket.off("error", onError);
    };
  }, [socket]);

  const getAdminToken = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(getAdminTokenKey(roomIdRef.current));
  }, []);

  const vote = useCallback(
    (value: number, sessionId: string) => {
      socket.emit("vote", {
        roomId: roomIdRef.current,
        sessionId,
        value,
      });
    },
    [socket]
  );

  const reveal = useCallback(() => {
    const token = getAdminToken();
    socket.emit("reveal", {
      roomId: roomIdRef.current,
      adminToken: token ?? undefined,
    });
  }, [socket, getAdminToken]);

  const reset = useCallback(() => {
    const token = getAdminToken();
    socket.emit("reset", {
      roomId: roomIdRef.current,
      adminToken: token ?? undefined,
    });
  }, [socket, getAdminToken]);

  const updateSettings = useCallback(
    (settings: Partial<RoomSettings>) => {
      const token = getAdminToken();
      if (!token) return;
      socket.emit("update-settings", {
        roomId: roomIdRef.current,
        adminToken: token,
        settings,
      });
    },
    [socket, getAdminToken]
  );

  const deleteEstimate = useCallback(
    (targetSessionId: string) => {
      const token = getAdminToken();
      socket.emit("delete-estimate", {
        roomId: roomIdRef.current,
        targetSessionId,
        adminToken: token ?? undefined,
      });
    },
    [socket, getAdminToken]
  );

  const clearUser = useCallback(
    (targetSessionId: string) => {
      const token = getAdminToken();
      socket.emit("clear-user", {
        roomId: roomIdRef.current,
        targetSessionId,
        adminToken: token ?? undefined,
      });
    },
    [socket, getAdminToken]
  );

  const startTimer = useCallback(() => {
    const token = getAdminToken();
    if (!token) return;
    socket.emit("start-timer", {
      roomId: roomIdRef.current,
      adminToken: token,
    });
  }, [socket, getAdminToken]);

  const stopTimer = useCallback(() => {
    const token = getAdminToken();
    if (!token) return;
    socket.emit("stop-timer", {
      roomId: roomIdRef.current,
      adminToken: token,
    });
  }, [socket, getAdminToken]);

  const clearAllParticipants = useCallback(() => {
    const token = getAdminToken();
    if (!token) return;
    socket.emit("clear-all-participants", {
      roomId: roomIdRef.current,
      adminToken: token,
    });
  }, [socket, getAdminToken]);

  const joinRoom = useCallback(
    (displayName: string, sessionId: string) => {
      const token = getAdminToken();
      socket.emit("join-room", {
        roomId: roomIdRef.current,
        displayName,
        sessionId,
        adminToken: token ?? undefined,
      });
    },
    [socket, getAdminToken]
  );

  // Determine admin status from the server-provided participant state.
  // This correctly handles multiple tabs in the same browser (different sessionIds).
  const isAdmin = roomState && sessionId
    ? !!roomState.participants.find((p) => p.sessionId === sessionId)?.isAdmin
    : !!getAdminToken();

  return {
    roomState,
    error,
    isConnected,
    isAdmin,
    joinRoom,
    vote,
    reveal,
    reset,
    updateSettings,
    deleteEstimate,
    clearUser,
    clearAllParticipants,
    startTimer,
    stopTimer,
  };
}

