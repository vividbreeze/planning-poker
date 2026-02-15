"use client";

import { useState, useEffect, useRef } from "react";

interface TimerProps {
  timerStartedAt: number | null;
  duration: number; // countdown duration in seconds
  isAdmin: boolean;
  onStart: () => void;
  onStop: () => void;
}

export default function Timer({
  timerStartedAt,
  duration,
  isAdmin,
  onStart,
  onStop,
}: TimerProps) {
  const [remaining, setRemaining] = useState(duration);
  const [expired, setExpired] = useState(false);
  const hasPlayedSound = useRef(false);

  useEffect(() => {
    if (!timerStartedAt) {
      setRemaining(duration);
      setExpired(false);
      hasPlayedSound.current = false;
      return;
    }

    const update = () => {
      const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000);
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);

      if (left === 0 && !hasPlayedSound.current) {
        hasPlayedSound.current = true;
        setExpired(true);
        // Play a short beep sound
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 800;
          gain.gain.value = 0.3;
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
          // Second beep
          setTimeout(() => {
            try {
              const osc2 = ctx.createOscillator();
              const gain2 = ctx.createGain();
              osc2.connect(gain2);
              gain2.connect(ctx.destination);
              osc2.frequency.value = 1000;
              gain2.gain.value = 0.3;
              osc2.start();
              osc2.stop(ctx.currentTime + 0.3);
            } catch {}
          }, 400);
        } catch {}
      }
    };

    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [timerStartedAt, duration]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isRunning = timerStartedAt !== null;
  const isLow = isRunning && remaining <= 5 && remaining > 0;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`font-mono text-lg font-bold transition-colors ${
          expired
            ? "text-red-500 animate-pulse"
            : isLow
              ? "text-orange-500"
              : isRunning
                ? "text-blue-600"
                : "text-slate-400"
        }`}
      >
        {display}
      </span>
      {isAdmin && (
        <button
          onClick={isRunning ? onStop : onStart}
          className={`px-2 py-1 text-xs rounded-md transition-colors ${
            expired
              ? "bg-red-100 hover:bg-red-200 text-red-600"
              : "bg-slate-100 hover:bg-slate-200 text-slate-600"
          }`}
        >
          {isRunning ? "Reset" : "Start"}
        </button>
      )}
    </div>
  );
}
