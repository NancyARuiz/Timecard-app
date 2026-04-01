export interface TimelineEvent {
  id: number;
  event_date: string;
  title: string;
  description: string;
  image_url: string;
}

interface TimelineItemProps {
  event: TimelineEvent;
  isLeft: boolean;
}

export function TimelineItem({ event, isLeft }: TimelineItemProps) {
  return (
    <div className={`mb-8 flex justify-between items-center w-full ${isLeft ? 'flex-row-reverse left-timeline' : 'right-timeline'}`}>
      <div className="order-1 w-5/12"></div>
      
      <div className="z-20 flex items-center order-1 bg-cyan-500 shadow-xl w-8 h-8 rounded-full">
        <h1 className="mx-auto text-white font-semibold text-lg hover:animate-ping cursor-pointer">•</h1>
      </div>
      
      <div className="order-1 bg-white hover:bg-slate-50 transition-colors shadow-xl w-5/12 px-6 py-4 rounded-lg border border-slate-200">
        <h3 className="mb-1 font-bold text-gray-800 text-xl">{event.title}</h3>
        <p className="text-sm leading-snug tracking-wide text-cyan-600 mb-2 font-mono">
          {event.event_date}
        </p>
        
        {event.image_url && (
          <img 
            src={event.image_url} 
            alt={event.title} 
            className="w-full h-48 object-cover rounded-md mb-3"
            onError={(e) => {
              // Hide broken images gracefully if test URLs fail
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        
        <p className="text-sm leading-snug tracking-wide text-gray-700 text-opacity-100">
          {event.description}
        </p>
      </div>
    </div>
  );
}
