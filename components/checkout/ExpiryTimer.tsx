"use client";
import React, { useState, useEffect } from "react";

interface Props {
  createdAtMs: number;
  durationMinutes?: number;
}

const ExpiryTimer = ({ createdAtMs, durationMinutes = 30 }: Props) => {
  const expiresAt = createdAtMs + durationMinutes * 60 * 1000;
  const [remaining, setRemaining] = useState(expiresAt - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(expiresAt - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (remaining <= 0) {
    return (
      <span className="text-xs font-mono text-red-400/80 tracking-wide">
        Request expired
      </span>
    );
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const urgent = totalSeconds < 120;

  return (
    <span
      className={`text-xs font-mono tracking-wide ${
        urgent ? "text-orange-400" : "text-gray-500"
      }`}
    >
      Expires in {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
};

export default ExpiryTimer;
