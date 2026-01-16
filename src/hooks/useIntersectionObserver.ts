import { useEffect, useRef, useState } from "react";

interface UseIntersectionObserverProps {
  threshold?: number;
  root?: Element | null;
  rootMargin?: string;
}

export function useIntersectionObserver({
  threshold = 0,
  root = null,
  rootMargin = "0%",
}: UseIntersectionObserverProps = {}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isIntersecting, setIntersecting] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIntersecting(entry.isIntersecting);
      },
      {
        threshold,
        root,
        rootMargin,
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [threshold, root, rootMargin]);

  return { ref, isIntersecting };
}
