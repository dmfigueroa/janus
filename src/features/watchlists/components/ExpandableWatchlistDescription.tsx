import { Button, Text } from "@chakra-ui/react";
import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";

type ExpandableWatchlistDescriptionProps = {
  description: string;
};

export function ExpandableWatchlistDescription({
  description,
}: ExpandableWatchlistDescriptionProps) {
  const descriptionId = useId();
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const canExpand = useDescriptionOverflow(descriptionRef, description, isExpanded);

  return (
    <>
      <Text
        id={descriptionId}
        ref={descriptionRef}
        fontSize="sm"
        color="fg.muted"
        display={{ base: "none", md: "block" }}
        lineClamp={getDescriptionLineClamp(isExpanded)}
      >
        {description}
      </Text>
      <DescriptionToggle
        descriptionId={descriptionId}
        canExpand={canExpand}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((expanded) => !expanded)}
      />
    </>
  );
}

function DescriptionToggle({
  descriptionId,
  canExpand,
  isExpanded,
  onToggle,
}: {
  descriptionId: string;
  canExpand: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (!canExpand) return null;

  return (
    <Button
      type="button"
      variant="plain"
      size="xs"
      alignSelf="start"
      display={{ base: "none", md: "inline-flex" }}
      color="fg.muted"
      aria-controls={descriptionId}
      aria-expanded={isExpanded}
      onClick={onToggle}
    >
      {isExpanded ? "Show less" : "Show more"}
    </Button>
  );
}

function useDescriptionOverflow(
  descriptionRef: RefObject<HTMLParagraphElement | null>,
  description: string,
  isExpanded: boolean,
) {
  const [canExpand, setCanExpand] = useState(false);

  useLayoutEffect(() => {
    const descriptionElement = descriptionRef.current;
    if (!descriptionElement) return;
    if (isExpanded) return;

    const measureOverflow = () => {
      setCanExpand(descriptionElement.scrollHeight > descriptionElement.clientHeight);
    };

    measureOverflow();
    const resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(descriptionElement);

    return () => resizeObserver.disconnect();
  }, [descriptionRef, description, isExpanded]);

  return canExpand;
}

function getDescriptionLineClamp(isExpanded: boolean) {
  return isExpanded ? undefined : 3;
}
