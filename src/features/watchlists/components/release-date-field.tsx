import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ReleaseDateFieldProps = {
  inputId: string;
  releaseDate: string;
  setReleaseDate: (releaseDate: string) => void;
};

function parseReleaseDate(releaseDate: string): Date | undefined {
  if (!releaseDate) {
    return undefined;
  }

  return parse(releaseDate, "yyyy-MM-dd", new Date());
}

function formatReleaseDate(releaseDate: Date | undefined): string {
  if (!releaseDate) {
    return "Select date";
  }

  return format(releaseDate, "PPP");
}

function formatDateInput(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

export function ReleaseDateField({ inputId, releaseDate, setReleaseDate }: ReleaseDateFieldProps) {
  const parsedReleaseDate = parseReleaseDate(releaseDate);
  const formattedReleaseDate = formatReleaseDate(parsedReleaseDate);
  const hasReleaseDate = releaseDate.length > 0;

  const handleReleaseDateChange = (date: Date | undefined) => {
    setReleaseDate(formatDateInput(date));
  };

  const handleClearReleaseDate = () => {
    setReleaseDate("");
  };

  return (
    <Popover>
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
