import { cn } from "@/utils/Cn";
import type { ReactNode } from "react";

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

export function ToggleButton({ active, onClick, disabled, children }: ToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-60",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
