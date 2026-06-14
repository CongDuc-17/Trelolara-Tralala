import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <>
      <div className="flex flex-col justify-center items-center h-screen text-center gap-6">
        <div className="flex justify-center items-center text-9xl font-bold">
          404 - Page Not Found
        </div>
        <Button className="mx-auto mb-8" asChild>
          <a href="/dashboard">Go to Dashboard</a>
        </Button>
      </div>
    </>
  );
}
