import { useRef, useState, type ChangeEvent } from "react";
import { format, isMatch, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { Input } from "@/components/ui/Input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";

type ReleaseDateFieldProps = {
  inputId: string;
  inputName: string;
  initialReleaseDate: string;
};

function parseReleaseDate(releaseDate: string): Date | undefined {
  return isMatch(releaseDate, "yyyy-MM-dd")
    ? parse(releaseDate, "yyyy-MM-dd", new Date())
    : undefined;
}

function formatReleaseDate(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

const dateFormatTokens = new Map([
  ["year", "yyyy"],
  ["month", "MM"],
  ["day", "dd"],
]);
const dateInputParts = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
  .formatToParts(new Date(2001, 10, 22))
  .map((part) => dateFormatTokens.get(part.type) ?? part.value);
const dateInputFormat = dateInputParts.join("");
const datePlaceholder = dateInputFormat.replace("yyyy", "YYYY").replace("dd", "DD");

function formatDateInput(releaseDate: string): string {
  const parsedReleaseDate = parseReleaseDate(releaseDate);
  return parsedReleaseDate ? format(parsedReleaseDate, dateInputFormat) : releaseDate;
}

function parseCompleteDateInput(dateInput: string): string | undefined {
  return isMatch(dateInput, dateInputFormat)
    ? formatReleaseDate(parse(dateInput, dateInputFormat, new Date()))
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

const releaseDateStartMonth = new Date(1440, 0);
const releaseDateEndMonth = new Date(new Date().getFullYear() + 10, 11);

export function ReleaseDateField({
  inputId,
  inputName,
  initialReleaseDate,
}: ReleaseDateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [releaseDate, setReleaseDate] = useState(initialReleaseDate);
  const [dateInput, setDateInput] = useState(() => formatDateInput(initialReleaseDate));
  const parsedReleaseDate = parseReleaseDate(releaseDate);
  const hasReleaseDate = releaseDate.length > 0;

  const handleReleaseDateChange = (date: Date | undefined) => {
    const nextReleaseDate = formatReleaseDate(date);
    setReleaseDate(nextReleaseDate);
    setDateInput(formatDateInput(nextReleaseDate));
    inputRef.current?.setCustomValidity("");
  };

  const handleDateInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDateInput = event.target.value;
    const nextReleaseDate = parseDateInput(nextDateInput);
    setDateInput(nextDateInput);
    setReleaseDate(nextReleaseDate ?? nextDateInput);
    event.target.setCustomValidity(getDateInputValidationMessage(nextDateInput, nextReleaseDate));
  };

  const handleClearReleaseDate = () => {
    setReleaseDate("");
    setDateInput("");
    inputRef.current?.setCustomValidity("");
  };

  return (
    <div className="relative">
      <input type="hidden" name={inputName} value={releaseDate} readOnly />
      <Input
        ref={inputRef}
        id={inputId}
        value={dateInput}
        placeholder={`${datePlaceholder} or YYYY`}
        title={`Enter a date as ${datePlaceholder} or YYYY`}
        inputMode="numeric"
        className="pr-10"
        onChange={handleDateInputChange}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 shadow-none"
            aria-label="Open date picker"
          >
            <CalendarIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-y-auto p-0"
          align="end"
          collisionPadding={8}
        >
          <Calendar
            mode="single"
            selected={parsedReleaseDate}
            defaultMonth={parsedReleaseDate}
            captionLayout="dropdown"
            startMonth={releaseDateStartMonth}
            endMonth={releaseDateEndMonth}
            navLayout="after"
            onSelect={handleReleaseDateChange}
          />
          {hasReleaseDate ? (
            <Button
              type="button"
              variant="ghost"
              className="m-2 w-[calc(100%-1rem)]"
              onClick={handleClearReleaseDate}
            >
              Clear date
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
