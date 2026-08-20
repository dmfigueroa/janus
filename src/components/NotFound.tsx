import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/Button";

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">404</h1>
      <p className="text-lg text-muted-foreground">
        Oops! The page you're looking for differs from reality.
      </p>
      <div className="flex gap-2 mt-4">
        <Button asChild variant="default">
          <Link to="/">Go Home</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="..">Go Back</Link>
        </Button>
      </div>
    </div>
  );
}
