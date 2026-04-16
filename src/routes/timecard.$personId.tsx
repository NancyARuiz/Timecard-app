import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { TimelineEvent } from "../components/TimelineItem";

export const Route = createFileRoute("/timecard/$personId")({
  component: TimecardDisplay,
});

export interface Person {
  id: number;
  name: string;
  birth_date: string;
  dead_date: string;
}

export function TimecardDisplay() {
  const { personId } = Route.useParams();
  const [person, setPerson] = useState<Person | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void invoke<Person | null>("get_current_display_state")
      .then((data) => {
        setPerson(data);
      })
      .catch((err) => {
        console.warn("Using Mock Data (Backend missing):", err);
        setPerson({
          id: 1,
          name: "Madeline Eleanor Banks",
          birth_date: "2006-06-08",
          dead_date: "Present",
        });
      });

    const fetchEvents = () => {
      void invoke<TimelineEvent[]>("get_events", {
        personId: parseInt(personId, 10),
      })
        .then((data) => {
          setEvents(data);
        })
        .catch((err) => {
          console.warn("Using Mock Events (Backend missing):", err);
          setEvents([
            {
              id: 1,
              person_id: 1,
              title: "First Steps",
              description:
                "Taking off in the living room for the very first time! She was so brave.",
              event_date: "2007-06-12",
              image_url:
                "https://images.unsplash.com/photo-1522771930-78848d9293e8?w=800&q=80",
            },
            {
              id: 2,
              person_id: 1,
              title: "Tummy Time Setup",
              description:
                "Testing out the new soft blue blanket in the nursery.",
              event_date: "2006-11-20",
              image_url:
                "https://images.unsplash.com/photo-1544126592-807ca20e29d7?w=800&q=80",
            },
            {
              id: 3,
              person_id: 1,
              title: "Smash Cake!",
              description: "First birthday party chaos at the park.",
              event_date: "2007-06-08",
              image_url:
                "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=800&q=80",
            },
            {
              id: 4,
              person_id: 1,
              title: "Beach Day",
              description:
                "Summer trip to the coastal bay. Collected seashells all afternoon.",
              event_date: "2009-08-14",
              image_url:
                "https://images.unsplash.com/photo-1471286174890-9c112225d57b?w=800&q=80",
            },
          ]);
        });
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 5000); // Check for new uploads every 5 seconds

    return () => clearInterval(interval);
  }, [personId]);

  // Slideshow Logic
  useEffect(() => {
    if (!isPlaying || events.length === 0) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % events.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isPlaying, events.length]);

  const PIXELS_PER_YEAR = 30; // Scale factor for timeline width

  const birthYear = person?.birth_date
    ? parseInt(person.birth_date.substring(0, 4), 10)
    : 1970;
  // Pad the timeline so the start is a clean decade.
  const startDecade = Math.floor(birthYear / 10) * 10;
  const endDecade = Math.ceil(new Date().getFullYear() / 10) * 10 + 10;

  // Auto-scroll the strip to center the active item PRECISELY on its timeline pixel coordinate
  useEffect(() => {
    if (stripRef.current && events.length > 0) {
      const container = stripRef.current;
      const activeEvent = events[activeIndex];
      if (activeEvent) {
        const date = new Date(activeEvent.event_date);
        const fractionalYear = date.getFullYear() + date.getMonth() / 12;
        const leftOffset = (fractionalYear - startDecade) * PIXELS_PER_YEAR;
        container.scrollTo({ left: leftOffset, behavior: "smooth" });
      }
    }
  }, [activeIndex, events, startDecade]);

  if (!person) {
    return (
      <div className="min-h-screen bg-[#e0f2fe] text-slate-900 flex flex-col items-center justify-center">
        <h1 className="text-3xl text-cyan-700 animate-pulse font-bold tracking-widest uppercase">
          Loading Framework...
        </h1>
      </div>
    );
  }

  const activeEvent = events[activeIndex];

  // Helper for pseudo-random scattered heights for the collage effect
  const getScatteredOffset = (index: number) => {
    const offsets = ["-60px", "-20px", "20px", "60px", "0px", "-40px", "40px"];
    return offsets[index % offsets.length];
  };

  // Helper for pseudo-random scattered width widths
  const getScatteredSize = (index: number) => {
    const sizes = ["w-32 h-32", "w-48 h-32", "w-32 h-48", "w-40 h-40"];
    return sizes[index % sizes.length];
  };

  // Generate ruler ticks (every 2 years)
  const ticks = [];
  for (let y = startDecade; y <= endDecade; y += 2) {
    ticks.push({ year: y, isMajor: y % 10 === 0 });
  }

  // Unified Middle and Bottom Scattered Photo Track
  const timelineContent = (
    <div className="absolute top-[45%] w-full h-[55vh] z-30 pointer-events-none">
      <div
        ref={stripRef}
        className="w-full h-full overflow-x-hidden flex items-start pointer-events-auto"
        style={{ scrollBehavior: "smooth" }}
      >
        {/* Start Padding - pushes coordinate 0 to exactly the center of the screen */}
        <div className="w-[50vw] h-full flex-shrink-0" />

        {/* Timeline Coordinate System Block */}
        <div
          className="relative h-full flex-shrink-0"
          style={{ width: `${(endDecade - startDecade) * PIXELS_PER_YEAR}px` }}
        >
          {/* === RULER ABSOLUTE LAYER === */}
          <div className="absolute bottom-[20%] w-full h-16 opacity-60">
            {ticks.map((tick) => (
              <div
                key={tick.year}
                className="absolute top-0 flex flex-col items-center justify-between"
                style={{
                  left: `${(tick.year - startDecade) * PIXELS_PER_YEAR}px`,
                  transform: "translateX(-50%)",
                  height: "100%",
                }}
              >
                {tick.isMajor ? (
                  <>
                    <div className="w-[1.5px] h-4 bg-slate-800" />
                    <span className="font-mono text-xl tracking-widest text-slate-800 -my-1">
                      {tick.year}
                    </span>
                    <div className="w-[1.5px] h-4 bg-slate-800" />
                  </>
                ) : (
                  <>
                    <div className="w-[1.5px] h-3 bg-slate-700" />
                    <div className="flex-grow" />
                    <div className="w-[1.5px] h-3 bg-slate-700" />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* === EVENTS ABSOLUTE LAYER === */}
          <div className="absolute top-0 w-full h-[30vh]">
            {events.map((event, i) => {
              const date = new Date(event.event_date);
              const fractionalYear = date.getFullYear() + date.getMonth() / 12;
              return (
                <div
                  key={event.id}
                  className={`absolute top-0 transform -translate-x-1/2 cursor-pointer transition-all duration-500 ease-out hover:z-50 ${
                    activeIndex === i
                      ? "z-40 scale-110 shadow-cyan-900/20"
                      : "z-20 opacity-80 hover:opacity-100 hover:scale-105"
                  }`}
                  style={{
                    left: `${(fractionalYear - startDecade) * PIXELS_PER_YEAR}px`,
                    marginTop: getScatteredOffset(i),
                  }}
                  onClick={() => {
                    setActiveIndex(i);
                    setIsPlaying(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setActiveIndex(i);
                      setIsPlaying(false);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <img
                    src={event.image_url}
                    className={`${getScatteredSize(i)} object-cover border-4 ${
                      activeIndex === i ? "border-sky-400" : "border-white"
                    } shadow-lg`}
                    alt=""
                    draggable={false}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* End Padding to allow the final event to freely reach the screen center */}
        <div className="w-[50vw] h-full flex-shrink-0" />
      </div>
    </div>
  );

  return (
    <div className="bg-[#e0f2fe] min-h-screen text-slate-800 font-sans overflow-hidden flex flex-col relative w-full h-full select-none cursor-default">
      {/* Background Grid Pattern (Subtle) */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz48L3N2Zz4=')] opacity-50 z-0"></div>

      {activeEvent && (
        <>
          {/* Top Focus Section */}
          <div className="absolute top-[8%] w-full flex justify-center z-20 transition-all duration-700 ease-in-out">
            <div className="flex gap-6 items-start max-w-3xl transform">
              <div className="relative">
                <img
                  src={activeEvent.image_url}
                  alt={activeEvent.title}
                  className="w-72 h-72 object-cover object-center bg-white p-3 pb-8 shadow-2xl transition-transform duration-700"
                  style={{ transform: "rotate(-2deg)" }}
                />
              </div>
              <div className="pt-4 max-w-sm">
                <h2 className="text-xl text-slate-600 font-medium mb-1">
                  {new Date(activeEvent.event_date).toLocaleDateString(
                    undefined,
                    { year: "numeric", month: "long", day: "numeric" },
                  )}
                </h2>
                <h3 className="text-2xl font-semibold text-slate-800 leading-tight mb-2">
                  {activeEvent.title}
                </h3>
                <p className="text-slate-500 text-base leading-relaxed line-clamp-4">
                  {activeEvent.description}
                </p>
              </div>
            </div>
          </div>

          {/* Thin Vertical Alignment Line */}
          <div className="absolute left-[50%] top-0 bottom-[10%] w-[2px] bg-red-500 z-50"></div>
        </>
      )}

      {events.length === 0 && (
        <div className="absolute top-[20%] w-full flex justify-center z-20">
          <p className="text-xl text-slate-400 italic">
            No memories uploaded yet.
          </p>
        </div>
      )}

      {/* Middle and Bottom Unified Scrolling Track */}
      {timelineContent}

      {/* Bottom Center Name Plate */}
      <div className="absolute bottom-[8%] w-full flex flex-col items-center z-20 pointer-events-none">
        <h1 className="text-2xl tracking-[0.2em] uppercase text-slate-600 font-semibold mb-1 bg-white/60 px-4 rounded-full shadow-sm">
          {person.name}
        </h1>
        <p className="text-sm tracking-widest text-slate-500 font-medium bg-white/60 px-3 rounded-full mt-1">
          {new Date(person.birth_date).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          {person.dead_date &&
            person.dead_date !== "Present" &&
            ` - ${new Date(person.dead_date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`}
        </p>
      </div>

      {/* Control Buttons Overlay */}
      <div className="absolute bottom-8 right-12 flex gap-8 z-50 text-xs tracking-widest uppercase font-semibold text-slate-400">
        <button
          type="button"
          className={`hover:text-slate-700 transition-colors cursor-pointer ${isPlaying ? "text-cyan-600" : ""}`}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? "Pause" : "Slideshow"}
        </button>
      </div>
    </div>
  );
}
