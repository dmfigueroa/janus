import DOMPurify from "dompurify";
import { Calendar, Star } from "lucide-react";
import type { UnifiedMedia } from "@/server/Media";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import type { AddToWatchlistInsertionPosition } from "@/features/watchlists/add/Mutation";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/Sheet";
import { WatchlistSelector } from "@/components/watchlist/WatchlistSelector";
import { SearchMediaAdditionNotice } from "./SearchMediaAdditionNotice";

function MediaBackdrop({ title, backdrop }: Pick<UnifiedMedia, "title" | "backdrop">) {
  if (!backdrop) return null;
  return (
    <div className="relative -mx-6 -mt-6 mb-4 aspect-video w-[calc(100%+3rem)] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent z-10" />
      <img
        src={backdrop}
        alt={title}
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

function MediaPoster({
  title,
  poster,
  backdrop,
}: Pick<UnifiedMedia, "title" | "poster" | "backdrop">) {
  if (!poster || backdrop) return null;
  return (
    <img
      src={poster}
      alt={title}
      className="w-24 rounded-md shadow-md"
      referrerPolicy="no-referrer"
    />
  );
}

function getDisplayYear(year: UnifiedMedia["year"]) {
  return year || "TBA";
}

function getDisplayRating(rating: UnifiedMedia["rating"]) {
  if (rating) return rating.toFixed(1);
  return "N/A";
}

function getDisplayMediaType(mediaType: UnifiedMedia["mediaType"]) {
  if (mediaType === "tv") return "TV Series";
  return mediaType;
}

function MediaMetadata({ media }: { media: UnifiedMedia }) {
  return (
    <div className="space-y-1">
      <SheetTitle className="text-2xl font-bold">{media.title}</SheetTitle>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="size-3.5" /> {getDisplayYear(media.year)}
        </span>
        <span className="flex items-center gap-1">
          <Star className="size-3.5 text-yellow-500 fill-yellow-500" />{" "}
          {getDisplayRating(media.rating)}
        </span>
        <span className="capitalize border px-1.5 py-0.5 rounded text-xs">
          {getDisplayMediaType(media.mediaType)}
        </span>
      </div>
    </div>
  );
}

function getDescription(overview: UnifiedMedia["overview"]) {
  return overview || "No description available.";
}

const insertionPositionOptions = [
  ["watchlist-insert-beginning", "beginning", "Beginning"],
  ["watchlist-insert-end", "end", "End"],
  ["watchlist-insert-release-adjacent", "release-adjacent", "Release-adjacent"],
] as const;

function MediaDescription({ overview }: Pick<UnifiedMedia, "overview">) {
  return (
    <SheetDescription className="text-base leading-relaxed text-foreground/90" asChild>
      <div
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(getDescription(overview)),
        }}
      />
    </SheetDescription>
  );
}

export function SearchMediaSummary({ media }: { media: UnifiedMedia }) {
  return (
    <SheetHeader className="text-left space-y-4">
      <MediaBackdrop title={media.title} backdrop={media.backdrop} />
      <div className="flex gap-4 items-start">
        <MediaPoster title={media.title} poster={media.poster} backdrop={media.backdrop} />
        <MediaMetadata media={media} />
      </div>
      <MediaDescription overview={media.overview} />
    </SheetHeader>
  );
}

interface SearchMediaWatchlistControlsProps {
  mediaType: UnifiedMedia["mediaType"];
  watchlists?: WatchlistSummary[];
  selectedWatchlistId: string;
  insertionPosition: AddToWatchlistInsertionPosition | "";
  requiresInsertionChoice: boolean;
  isAdding: boolean;
  onWatchlistSelect: (watchlistId: string) => void;
  onInsertionPositionChange: (position: AddToWatchlistInsertionPosition) => void;
  onAdd: () => void;
}

function hasNoWatchlists(watchlists: WatchlistSummary[] | undefined) {
  if (!watchlists) return true;
  return watchlists.length === 0;
}

function getAddButtonLabel(isAdding: boolean) {
  if (isAdding) return "Adding...";
  return "Add";
}

type WatchlistSelectionProps = Pick<
  SearchMediaWatchlistControlsProps,
  "watchlists" | "selectedWatchlistId" | "isAdding" | "onWatchlistSelect" | "onAdd"
>;

function WatchlistSelection(props: WatchlistSelectionProps) {
  return (
    <div className="flex gap-3">
      <WatchlistSelector
        watchlists={props.watchlists}
        selectedWatchlistId={props.selectedWatchlistId}
        onSelect={props.onWatchlistSelect}
        disabled={hasNoWatchlists(props.watchlists)}
        className="flex-1"
      />
      <Button
        onClick={props.onAdd}
        disabled={!props.selectedWatchlistId || props.isAdding}
        className="min-w-[100px]"
      >
        {getAddButtonLabel(props.isAdding)}
      </Button>
    </div>
  );
}

interface InsertionPositionChoiceProps {
  visible: boolean;
  insertionPosition: AddToWatchlistInsertionPosition | "";
  onInsertionPositionChange: (position: AddToWatchlistInsertionPosition) => void;
}

function InsertionPositionChoice(props: InsertionPositionChoiceProps) {
  if (!props.visible) return null;
  return (
    <div className="space-y-3 rounded-md border bg-secondary/20 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Insert in custom order</p>
        <p className="text-xs text-muted-foreground">
          Choose where this item should land in the watchlist&apos;s manual sequence.
        </p>
      </div>
      <RadioGroup
        value={props.insertionPosition}
        onValueChange={(value) =>
          props.onInsertionPositionChange(value as AddToWatchlistInsertionPosition)
        }
      >
        {insertionPositionOptions.map(([id, value, label]) => (
          <div key={id} className="flex items-center gap-2">
            <RadioGroupItem id={id} value={value} />
            <Label htmlFor={id}>{label}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

export function SearchMediaWatchlistControls(props: SearchMediaWatchlistControlsProps) {
  return (
    <div className="mt-8 space-y-4">
      <h4 className="text-sm font-medium text-muted-foreground">Add to Watchlist</h4>
      <WatchlistSelection
        watchlists={props.watchlists}
        selectedWatchlistId={props.selectedWatchlistId}
        isAdding={props.isAdding}
        onWatchlistSelect={props.onWatchlistSelect}
        onAdd={props.onAdd}
      />
      <InsertionPositionChoice
        visible={props.requiresInsertionChoice}
        insertionPosition={props.insertionPosition}
        onInsertionPositionChange={props.onInsertionPositionChange}
      />
      <SearchMediaAdditionNotice mediaType={props.mediaType} />
    </div>
  );
}
