"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";
import { getAdminTokenKey, SESSION_ID_KEY, DISPLAY_NAME_KEY } from "@/lib/constants";

export default function CreateRoomForm() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { socket, isConnected } = useSocket();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !isConnected) return;

    setLoading(true);
    setError(null);

    socket.emit("create-room", { displayName: trimmed }, (response) => {
      if (response.success && response.roomId && response.adminToken && response.sessionId) {
        // Store admin token and session info
        localStorage.setItem(getAdminTokenKey(response.roomId), response.adminToken);
        sessionStorage.setItem(SESSION_ID_KEY, response.sessionId);
        sessionStorage.setItem(DISPLAY_NAME_KEY, trimmed);

        router.push(`/room/${response.roomId}/admin`);
      } else {
        setError(response.error || "Failed to create room");
        setLoading(false);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        maxLength={20}
        className="px-4 py-3 rounded-xl border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg"
        autoFocus
      />
      <button
        type="submit"
        disabled={!name.trim() || loading || !isConnected}
        className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
      >
        {loading ? "Creating..." : "Create Room"}
      </button>
      {!isConnected && (
        <p className="text-sm text-amber-600 text-center">Connecting to server...</p>
      )}
      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}
    </form>
  );
}
