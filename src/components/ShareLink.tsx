"use client";

import { useState } from "react";

interface ShareLinkProps {
  roomId: string;
}

export default function ShareLink({ roomId }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${roomId}`
      : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Format room ID with dashes for readability (e.g., ABCD-EFGH-JKLM)
  const formattedId = roomId.match(/.{1,4}/g)?.join("-") ?? roomId;

  return (
    <div className="flex items-center gap-2">
      <code className="px-3 py-1.5 bg-slate-100 rounded-lg text-sm text-slate-700 font-mono tracking-wider">
        {formattedId}
      </code>
      <button
        onClick={handleCopy}
        className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
      >
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
}
