import { useState } from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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

function formatReleaseDate(releaseDate: string, parsedReleaseDate: Date | undefined): string {
  if (/^\d{4}$/.test(releaseDate)) {
    return releaseDate;
  }

  return parsedReleaseDate ? format(parsedReleaseDate, "PPP") : "Select date";
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
  const formattedReleaseDate = formatReleaseDate(releaseDate, parsedReleaseDate);
  const hasReleaseDate = releaseDate.length > 0;

  const handleReleaseDateChange = (date: Date | undefined) => {
    setReleaseDate(formatDateInput(date));
  };

  const handleClearReleaseDate = () => {
    setReleaseDate("");
  };

  return (
    <Popover>
      <input type="hidden" name={inputName} value={releaseDate} readOnly />
      <PopoverTrigger asChild>
        <Button
          id={inputId}
          type="button"
          variant="outline"
          className="justify-start text-left font-normal"
        >
          <CalendarIcon />
          {formattedReleaseDate}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
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
  );
}
