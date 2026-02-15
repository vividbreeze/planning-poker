"use client";

import { useState } from "react";
import { RoomSettings } from "@/types/shared";

interface SettingsPanelProps {
  settings: RoomSettings;
  roomId: string;
  onUpdate: (settings: Partial<RoomSettings>) => void;
  onClose: () => void;
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="flex gap-3">
        <button
          onClick={() => onChange(true)}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            value
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          Yes
        </button>
        <button
          onClick={() => onChange(false)}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            !value
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}

export default function SettingsPanel({
  settings,
  roomId,
  onUpdate,
  onClose,
}: SettingsPanelProps) {
  const [estimateText, setEstimateText] = useState(
    settings.estimateOptions.join(",")
  );

  const handleEstimateChange = (text: string) => {
    setEstimateText(text);
    const parsed = text
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
    if (parsed.length > 0) {
      onUpdate({ estimateOptions: parsed });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white shadow-xl overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800">Room Settings</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500"
            >
              {"✕"}
            </button>
          </div>

          {/* Room ID */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-500 mb-1">
              Room ID
            </label>
            <div className="px-3 py-2 bg-slate-50 rounded-lg text-slate-700 font-mono">
              {roomId}
            </div>
          </div>

          {/* Estimate Options */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-500 mb-1">
              Estimate Options
            </label>
            <input
              type="text"
              value={estimateText}
              onChange={(e) => handleEstimateChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1,2,3,5,8,13,20,40"
            />
            <p className="text-xs text-slate-400 mt-1">
              Comma-separated numbers. Changing this resets all votes.
            </p>
          </div>

          {/* Divider */}
          <hr className="my-4 border-slate-100" />

          {/* Permission toggles */}
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Permissions
          </h3>

          <ToggleRow
            label="Allow others to show estimates"
            value={settings.allowOthersToShowEstimates}
            onChange={(v) => onUpdate({ allowOthersToShowEstimates: v })}
          />
          <ToggleRow
            label="Allow others to delete estimates"
            value={settings.allowOthersToDeleteEstimates}
            onChange={(v) => onUpdate({ allowOthersToDeleteEstimates: v })}
          />
          <ToggleRow
            label="Allow others to clear users"
            value={settings.allowOthersToClearUsers}
            onChange={(v) => onUpdate({ allowOthersToClearUsers: v })}
          />

          <hr className="my-4 border-slate-100" />

          {/* Display toggles */}
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Display
          </h3>

          <ToggleRow
            label="Show timer"
            value={settings.showTimer}
            onChange={(v) => onUpdate({ showTimer: v })}
          />
          {settings.showTimer && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-700">Timer duration</span>
              <div className="flex gap-2">
                {[15, 30, 45].map((d) => (
                  <button
                    key={d}
                    onClick={() => onUpdate({ timerDuration: d })}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      settings.timerDuration === d
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
          )}
          <ToggleRow
            label="Show user presence"
            value={settings.showUserPresence}
            onChange={(v) => onUpdate({ showUserPresence: v })}
          />
          <ToggleRow
            label="Show average"
            value={settings.showAverage}
            onChange={(v) => onUpdate({ showAverage: v })}
          />
        </div>
      </div>
    </div>
  );
}
