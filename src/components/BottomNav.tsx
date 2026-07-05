import { Search, List as ListIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/utils/cn";

export function BottomNav() {
  const navItems = [
    { icon: ListIcon, label: "My Lists", to: "/" },
    { icon: Search, label: "Search", to: "/search" }, // Placeholder route
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-md border-t border-border z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-around">
        {navItems.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            preload="intent"
            activeOptions={{ exact: item.to === "/" }}
            className="flex flex-col items-center justify-center gap-1 w-20 py-2 rounded-xl transition-all duration-300"
            activeProps={{
              className: "text-primary",
            }}
            inactiveProps={{
              className: "text-muted-foreground hover:text-foreground hover:bg-white/5",
            }}
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    "w-6 h-6",
                    isActive && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]",
                  )}
                />
                <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
              </>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
