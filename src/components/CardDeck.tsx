"use client";

import EstimationCard from "./EstimationCard";

interface CardDeckProps {
  options: number[];
  selectedValue: number | null;
  onSelect: (value: number) => void;
  disabled?: boolean;
}

export default function CardDeck({
  options,
  selectedValue,
  onSelect,
  disabled = false,
}: CardDeckProps) {
  return (
    <div className="flex flex-wrap justify-center gap-3 p-4">
      {options.map((value) => (
        <EstimationCard
          key={value}
          value={value}
          selected={selectedValue === value}
          revealed={true}
          onClick={() => onSelect(value)}
          disabled={disabled}
          size="md"
        />
      ))}
    </div>
  );
}
