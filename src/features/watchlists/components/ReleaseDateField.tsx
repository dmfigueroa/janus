import { Button, DatePicker, IconButton, Input, Portal } from "@chakra-ui/react";
import { CalendarDate, parseDate, type DateValue } from "@internationalized/date";
import { format, isMatch, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";

type ReleaseDateFieldProps = {
  inputId: string;
  inputName: string;
  initialReleaseDate: string;
};

function parseReleaseDate(releaseDate: string): DateValue | undefined {
  if (!isMatch(releaseDate, "yyyy-MM-dd")) {
    return undefined;
  }

  return parseDate(releaseDate);
}

const dateFormatTokens = new Map([
  ["year", "yyyy"],
  ["month", "MM"],
  ["day", "dd"],
]);
const dateInputParts = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
  .formatToParts(new Date(2001, 10, 22))
  .map((part) => dateFormatTokens.get(part.type) ?? part.value);
const dateInputFormat = dateInputParts.join("");
const datePlaceholder = dateInputFormat.replace("yyyy", "YYYY").replace("dd", "DD");

function formatDateInput(releaseDate: string): string {
  if (!isMatch(releaseDate, "yyyy-MM-dd")) {
    return releaseDate;
  }

  return format(parse(releaseDate, "yyyy-MM-dd", new Date()), dateInputFormat);
}

function parseCompleteDateInput(dateInput: string): string | undefined {
  return isMatch(dateInput, dateInputFormat)
    ? format(parse(dateInput, dateInputFormat, new Date()), "yyyy-MM-dd")
    : undefined;
}

function parseDateInput(dateInput: string): string | undefined {
  return /^\d{4}$/.test(dateInput) ? dateInput : parseCompleteDateInput(dateInput);
}

function getDateInputValidationMessage(dateInput: string, releaseDate: string | undefined): string {
  return dateInput.length > 0 && !releaseDate
    ? `Enter a valid date as ${datePlaceholder} or YYYY.`
    : "";
}

const releaseDateMinimum = new CalendarDate(1440, 1, 1);
const releaseDateMaximum = new CalendarDate(new Date().getFullYear() + 10, 12, 31);
const currentDate = new Date();
const releaseDateToday = new CalendarDate(
  currentDate.getFullYear(),
  currentDate.getMonth() + 1,
  currentDate.getDate(),
);

function releaseDateOrEmpty(date: DateValue | undefined) {
  return date ? date.toString() : "";
}

function setFocusedDateIfPresent(
  date: DateValue | undefined,
  setFocusedDate: (date: DateValue) => void,
) {
  if (date) {
    setFocusedDate(date);
  }
}

function useReleaseDateField(initialReleaseDate: string) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [releaseDate, setReleaseDate] = useState(initialReleaseDate);
  const [dateInput, setDateInput] = useState(() => formatDateInput(initialReleaseDate));
  const parsedReleaseDate = useMemo(() => parseReleaseDate(releaseDate), [releaseDate]);
  const [focusedDate, setFocusedDate] = useState<DateValue>(
    () => parseReleaseDate(initialReleaseDate) ?? releaseDateToday,
  );
  const selectedDates = useMemo(
    () => (parsedReleaseDate ? [parsedReleaseDate] : []),
    [parsedReleaseDate],
  );

  const handleReleaseDateChange = (date: DateValue | undefined) => {
    const nextReleaseDate = releaseDateOrEmpty(date);
    setReleaseDate(nextReleaseDate);
    setDateInput(formatDateInput(nextReleaseDate));
    setFocusedDateIfPresent(date, setFocusedDate);
    inputRef.current?.setCustomValidity("");
  };

  const handleDateInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDateInput = event.target.value;
    const nextReleaseDate = parseDateInput(nextDateInput);
    setDateInput(nextDateInput);
    setReleaseDate(nextReleaseDate ?? nextDateInput);
    setFocusedDateIfPresent(parseReleaseDate(nextReleaseDate ?? ""), setFocusedDate);
    event.target.setCustomValidity(getDateInputValidationMessage(nextDateInput, nextReleaseDate));
  };

  return {
    inputRef,
    releaseDate,
    dateInput,
    selectedDates,
    focusedDate,
    setFocusedDate,
    handleReleaseDateChange,
    handleDateInputChange,
  };
}

export function ReleaseDateField({
  inputId,
  inputName,
  initialReleaseDate,
}: ReleaseDateFieldProps) {
  const {
    inputRef,
    releaseDate,
    dateInput,
    selectedDates,
    focusedDate,
    setFocusedDate,
    handleReleaseDateChange,
    handleDateInputChange,
  } = useReleaseDateField(initialReleaseDate);
  const hasReleaseDate = releaseDate.length > 0;

  return (
    <DatePicker.Root
      value={selectedDates}
      focusedValue={focusedDate}
      min={releaseDateMinimum}
      max={releaseDateMaximum}
      positioning={{ placement: "bottom-end", gutter: 4 }}
      onFocusChange={({ focusedValue }) => setFocusedDate(focusedValue)}
      onValueChange={({ value }) => handleReleaseDateChange(value[0])}
    >
      <DatePicker.Control>
        <input type="hidden" name={inputName} value={releaseDate} readOnly />
        <Input
          ref={inputRef}
          id={inputId}
          value={dateInput}
          placeholder={`${datePlaceholder} or YYYY`}
          title={`Enter a date as ${datePlaceholder} or YYYY`}
          inputMode="numeric"
          pe={10}
          onChange={handleDateInputChange}
        />
        <DatePicker.Trigger asChild>
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            position="absolute"
            insetEnd={0}
            top={0}
            shadow="none"
            aria-label="Open date picker"
          >
            <CalendarIcon />
          </IconButton>
        </DatePicker.Trigger>
      </DatePicker.Control>
      <Portal>
        <DatePicker.Positioner>
          <DatePicker.Content maxH="var(--available-height)" overflowY="auto">
            <DatePicker.View view="day">
              <DatePicker.ViewControl>
                <DatePicker.PrevTrigger />
                <DatePicker.MonthSelect />
                <DatePicker.YearSelect />
                <DatePicker.NextTrigger />
              </DatePicker.ViewControl>
              <DatePicker.DayTable />
            </DatePicker.View>
            {hasReleaseDate ? (
              <Button
                type="button"
                variant="ghost"
                w="calc(100% - 1rem)"
                m={2}
                onClick={() => handleReleaseDateChange(undefined)}
              >
                Clear date
              </Button>
            ) : null}
          </DatePicker.Content>
        </DatePicker.Positioner>
      </Portal>
    </DatePicker.Root>
  );
}
