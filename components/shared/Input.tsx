import React from "react";

interface InputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  suffix?: React.ReactNode;
}

const Input = ({ label, value, onChange, placeholder, type = "text", hint, suffix }: InputProps) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-sm text-gray-400">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-[#0A0A0A] text-white border border-[#1F1F1F] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C7F284] transition-all placeholder:text-gray-600 ${suffix ? "pr-[74px]" : ""}`}
        />
        {suffix && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-[#C7F284]/10 border border-[#C7F284]/25 text-[#C7F284] text-xs font-semibold px-2.5 py-1.5 rounded-lg pointer-events-none">
            {suffix}
          </div>
        )}
      </div>
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </div>
  );
};

export default Input;
