"use client";
import React, { useState } from "react";

interface Props {
  children: React.ReactNode[];
  labels: string[];
}

const PayTabs = ({ children, labels }: Props) => {
  const [active, setActive] = useState(0);
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex gap-2 bg-[#1A1A1A] rounded-xl p-1">
        {labels.map((label, i) => (
          <button
            key={label}
            onClick={() => setActive(i)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              active === i
                ? "bg-[#C7F284] text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div>{children[active]}</div>
    </div>
  );
};

export default PayTabs;
