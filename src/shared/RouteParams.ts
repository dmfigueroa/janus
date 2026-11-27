const POSITIVE_INTEGER_PATTERN = /^\d+$/;

function isPositiveSafeInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

export function parsePositiveIntegerParam(value: string): number | null {
  if (!POSITIVE_INTEGER_PATTERN.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return isPositiveSafeInteger(parsed) ? parsed : null;
}
