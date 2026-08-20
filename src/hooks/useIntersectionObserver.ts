import { useEffect, useRef } from "react";

interface UseIntersectionObserverProps {
  threshold?: number;
  root?: Element | null;
  rootMargin?: string;
  onIntersect?: () => void;
  enabled?: boolean;
}

function invokeIntersect(callback: (() => void) | undefined) {
  if (callback) callback();
}

function withDefault<T>(value: T | undefined, fallback: T) {
  if (value === undefined) return fallback;
  return value;
}

function createObserver(
  onIntersectRef: React.RefObject<(() => void) | undefined>,
  options: IntersectionObserverInit,
) {
  return new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) invokeIntersect(onIntersectRef.current);
  }, options);
}

export function useIntersectionObserver(observerProps: UseIntersectionObserverProps = {}) {
  const { threshold, root, rootMargin, onIntersect, enabled } = {
    ...observerProps,
    threshold: withDefault(observerProps.threshold, 0),
    root: withDefault(observerProps.root, null),
    rootMargin: withDefault(observerProps.rootMargin, "0%"),
    enabled: withDefault(observerProps.enabled, true),
  };
  const ref = useRef<HTMLDivElement | null>(null);
  const onIntersectRef = useRef(onIntersect);

  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    if (!enabled) return;

    const node = ref.current;
    if (!node) return;

    const observer = createObserver(onIntersectRef, { threshold, root, rootMargin });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [threshold, root, rootMargin, enabled]);

  return { ref };
}
