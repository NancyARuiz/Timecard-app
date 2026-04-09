import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
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
        <h1 className="text-4xl md:text-6xl text-center font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-600 mb-4 tracking-tight">
          Historical Timeline
        </h1>

        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-slate-200 flex flex-col md:flex-row items-center gap-8 my-6 w-full max-w-2xl justify-between">
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">
              Add a Memory!
            </h2>
            <div className="flex flex-col gap-3">
              <p className="text-slate-600">
                <span className="font-bold text-cyan-600 mr-2">1.</span>
                Join Wi-Fi:{" "}
                <strong className="text-slate-800 bg-slate-100 px-3 py-1 rounded-md text-lg">
                  makerspacenet
                </strong>
              </p>
              <p className="text-slate-600">
                <span className="font-bold text-cyan-600 mr-2">2.</span>
                Scan the QR code with your Camera
              </p>
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl shadow-md border border-slate-100 flex-shrink-0">
            <QRCode value="http://192.168.0.103:8080" size={140} />
          </div>
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
