export interface CardTheme {
  emoji: string;
  color: string;
  bgColor: string;
}

const CARD_THEMES: Record<number, CardTheme> = {
  1: {
    emoji: "🥜",
    color: "#8B7355",
    bgColor: "#FFF8DC",
  },
  2: {
    emoji: "🧩",
    color: "#6F4E37",
    bgColor: "#FFF0E0",
  },
  3: {
    emoji: "🔧",
    color: "#4B5563",
    bgColor: "#F3F4F6",
  },
  5: {
    emoji: "💻",
    color: "#2563EB",
    bgColor: "#EFF6FF",
  },
  8: {
    emoji: "🏋️",
    color: "#EA580C",
    bgColor: "#FFF7ED",
  },
  13: {
    emoji: "⛰️",
    color: "#4D7C0F",
    bgColor: "#F7FEE7",
  },
  20: {
    emoji: "🏗️",
    color: "#C2410C",
    bgColor: "#FEF2F2",
  },
  40: {
    emoji: "🚀",
    color: "#1E3A5F",
    bgColor: "#EFF6FF",
  },
};

export function getThemeForValue(value: number): CardTheme {
  if (CARD_THEMES[value]) return CARD_THEMES[value];
  const known = Object.keys(CARD_THEMES)
    .map(Number)
    .sort((a, b) => a - b);
  const closest = known.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
  return CARD_THEMES[closest];
}
