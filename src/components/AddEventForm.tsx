import { invoke } from "@tauri-apps/api/core";
import { useId, useState } from "react";

interface AddEventFormProps {
  onEventAdded: () => void;
}

export function AddEventForm({ onEventAdded }: AddEventFormProps) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const dateId = useId();
  const titleId = useId();
  const imageUrlId = useId();
  const descriptionId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !title || !description) return;

    setLoading(true);
    try {
      await invoke("add_event", {
        eventDate: date,
        title,
        description,
        imageUrl,
      });
      // Reset form
      setDate("");
      setTitle("");
      setDescription("");
      setImageUrl("");
      // Trigger parent to refresh
      onEventAdded();
    } catch (err) {
      console.error("Failed to add event:", err);
      alert(`Error adding event: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 mb-12 max-w-2xl mx-auto w-full">
      <h3 className="text-xl font-bold mb-4 text-cyan-800">
        Add Timeline Event
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={dateId}
              className="text-sm font-semibold text-slate-600"
            >
              Date (e.g. 1995-05-12)
            </label>
            <input
              id={dateId}
              type="text"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border rounded-md"
              placeholder="YYYY-MM-DD"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={titleId}
              className="text-sm font-semibold text-slate-600"
            >
              Title
            </label>
            <input
              id={titleId}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="px-3 py-2 border rounded-md"
              placeholder="Born in Paris..."
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={imageUrlId}
            className="text-sm font-semibold text-slate-600"
          >
            Image URL
          </label>
          <input
            id={imageUrlId}
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="px-3 py-2 border rounded-md"
            placeholder="https://example.com/image.jpg"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={descriptionId}
            className="text-sm font-semibold text-slate-600"
          >
            Description
          </label>
          <textarea
            id={descriptionId}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="px-3 py-2 border rounded-md h-24"
            placeholder="A short story about this moment..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white py-2 px-4 rounded-md font-bold transition-all shadow-md active:scale-95"
        >
          {loading ? "Adding..." : "Save to SQLite"}
        </button>
      </form>
    </div>
  );
}
