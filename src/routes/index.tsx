import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { type TimelineEvent, TimelineItem } from "../components/TimelineItem";

export const Home: React.FC = () => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async (): Promise<void> => {
    try {
      const data = await invoke<TimelineEvent[]>("get_events");
      setEvents(data);
    } catch (err) {
      console.error("Failed to load events from SQLite:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch immediately on load, and poll every 5 seconds for Web Uploads
  useEffect(() => {
    void fetchEvents();
    const interval = setInterval(() => {
      void fetchEvents();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  return (
    <div className="min-h-screen bg-slate-50 p-8 pb-20 font-[family-name:var(--font-inter-sans)] flex flex-col items-center">
      <header className="mb-12 text-center w-full">
        <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-600 mb-4 tracking-tight">
          Historical Timeline
        </h1>
        <p className="text-slate-500 max-w-lg mx-auto">
          Add new memories from your laptop by navigating to{" "}
          <strong className="text-cyan-600">http://localhost:8080</strong>
        </p>
      </header>

      <main className="w-full max-w-4xl px-4 py-8">
        {loading && events.length === 0 ? (
          <div className="text-center animate-pulse text-xl text-cyan-600 font-bold">
            Loading local memories...
          </div>
        ) : events.length === 0 ? (
          <div className="text-center text-slate-400 p-12 border-2 border-dashed border-slate-200 rounded-xl">
            No events found. Open your web browser to port 8080 and add the
            first memory!
          </div>
        ) : (
          <div className="relative wrap overflow-hidden">
            {/* The bold center line */}
            <div
              className="border-2-2 absolute border-opacity-20 border-gray-700 h-full border"
              style={{ left: "50%" }}
            ></div>

            {events.map((event, index) => (
              <TimelineItem
                key={event.id}
                event={event}
                isLeft={index % 2 === 0}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: Home,
});
