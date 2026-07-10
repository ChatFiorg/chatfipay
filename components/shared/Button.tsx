import React from "react";

interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: "primary" | "outline" | "ghost";
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const Button = ({ label, onClick, variant = "primary", disabled, fullWidth, icon }: ButtonProps) => {
  const base = "flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-bold text-sm transition-all";
  const variants = {
    primary: "bg-[#C7F284] text-black hover:bg-[#b8e873]",
    outline: "border border-[#C7F284] text-[#C7F284] hover:bg-[#C7F284]/10",
    ghost: "text-[#C7F284] hover:bg-[#C7F284]/10",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
};

export default Button;
