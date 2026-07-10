import React from "react";

interface InputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}

const Input = ({ label, value, onChange, placeholder, type = "text", hint }: InputProps) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-sm text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[#0A0A0A] text-white border border-[#1F1F1F] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C7F284] transition-all placeholder:text-gray-600"
      />
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </div>
  );
};

export default Input;
