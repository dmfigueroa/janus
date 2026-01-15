import { Search, List as ListIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/utils/cn";

export function BottomNav() {
  const navItems = [
    { icon: ListIcon, label: "My Lists", to: "/", active: true },
    { icon: Search, label: "Search", to: "/" }, // Placeholder route
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#0F0D13]/90 backdrop-blur-md border-t border-white/5 z-50 padding-safe-bottom">
      <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-around">
        {navItems.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className={cn(
              "flex flex-col items-center justify-center gap-1 w-20 py-2 rounded-xl transition-all duration-300",
              item.active ? "text-[#FF0055]" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5",
            )}
          >
            <item.icon
              className={cn(
                "w-6 h-6",
                item.active && "fill-current drop-shadow-[0_0_8px_rgba(255,0,85,0.5)]",
              )}
            />
            <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
