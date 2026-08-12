import { useState } from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ReleaseDateFieldProps = {
  inputId: string;
  inputName: string;
  initialReleaseDate: string;
};

function parseReleaseDate(releaseDate: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    return undefined;
  }

  const parsedReleaseDate = parse(releaseDate, "yyyy-MM-dd", new Date());
  return isValid(parsedReleaseDate) ? parsedReleaseDate : undefined;
}

function formatDateInput(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

const releaseDateStartMonth = new Date(1440, 0);
const releaseDateEndMonth = new Date(new Date().getFullYear() + 10, 11);

export function ReleaseDateField({
  inputId,
  inputName,
  initialReleaseDate,
}: ReleaseDateFieldProps) {
  const [releaseDate, setReleaseDate] = useState(initialReleaseDate);
  const parsedReleaseDate = parseReleaseDate(releaseDate);
  const hasReleaseDate = releaseDate.length > 0;

  const handleReleaseDateChange = (date: Date | undefined) => {
    setReleaseDate(formatDateInput(date));
  };

  const handleClearReleaseDate = () => {
    setReleaseDate("");
  };

  return (
    <div className="relative">
      <Input
        id={inputId}
        name={inputName}
        value={releaseDate}
        placeholder="YYYY or YYYY-MM-DD"
        pattern="(?:\d{4}|\d{4}-\d{2}-\d{2})"
        title="Enter a year (YYYY) or complete date (YYYY-MM-DD)"
        inputMode="numeric"
        className="pr-10"
        onChange={(event) => setReleaseDate(event.target.value)}
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
