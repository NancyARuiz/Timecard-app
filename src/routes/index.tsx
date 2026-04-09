import { createFileRoute, Link } from "@tanstack/react-router";
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
      <header className="mb-12 w-full flex flex-col items-center">
        <h1 className="text-5xl md:text-7xl text-center font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-600 mb-6 tracking-tight mt-4">
          Historical Timeline
        </h1>

        <div className="my-4">
          <Link
            to="/connect"
            className="group relative inline-flex items-center justify-center px-8 py-4 text-xl font-bold text-white transition-all duration-200 bg-cyan-600 rounded-full hover:bg-cyan-500 hover:shadow-lg hover:-translate-y-1 overflow-hidden"
          >
            <span className="relative z-10 w-full flex gap-2 items-center">
              <span className="text-2xl leading-none">+</span> Add a Memory
            </span>
          </Link>
        </div>
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
