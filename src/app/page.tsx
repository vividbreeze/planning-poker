"use client";

import CreateRoomForm from "@/components/CreateRoomForm";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">🃏</div>
        <h1 className="text-4xl font-bold text-slate-800 mb-2">
          Planning Poker
        </h1>
        <p className="text-slate-500 text-lg">
          Estimate together. No sign-up required.
        </p>
      </div>

      <CreateRoomForm />

      <div className="mt-12 text-center text-sm text-slate-400 max-w-md">
        <p>
          Create a room, share the link with your team, and start estimating.
          Rooms expire after 24 hours.
        </p>
      </div>
    </div>
  );
}
