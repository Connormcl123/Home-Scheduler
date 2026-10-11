import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TravelDeal } from "@mirror-dashboard/shared";

/**
 * The lazy-susan rail of trip ideas, shared by the Travel tab and Home so both
 * behave identically: drag or tap a side card to bring it round, tap the front
 * one to open it.
 *
 * A drag moves the cards by writing transforms straight onto the elements. The
 * obvious version - state per pointermove - re-renders every card sixty times a
 * second, and on Home that re-rendered the whole screen with it, which the Pi
 * cannot manage inside a frame. React is told only where the rail settled.
 */

type Size = "full" | "home";

const SIZES = {
  full: { card: "h-[450px] w-[470px]", rail: "min-h-[470px]", step: 240, slide: 46, turn: -32, shrink: 0.18 },
  home: { card: "h-[136px] w-[420px]", rail: "min-h-[140px]", step: 200, slide: 52, turn: -26, shrink: 0.14 }
} as const;

/** How a card sits when it is `offset` cards away from the middle. */
function placement(offset: number, look: (typeof SIZES)[Size]) {
  const distance = Math.abs(offset);
  return {
    transform: `translate3d(-50%, -50%, 0) translateX(${offset * look.slide}%) rotateY(${offset * look.turn}deg) scale(${1 - Math.min(distance, 1) * look.shrink})`,
    zIndex: String(10 - Math.round(distance)),
    opacity: String(Math.max(0, Math.min(1, 2.6 - distance)))
  };
}

export function DealCarousel({
  deals,
  index,
  onIndex,
  onOpen,
  size = "full",
  accentOf,
  children
}: {
  deals: TravelDeal[];
  index: number;
  onIndex: (index: number) => void;
  onOpen: (deal: TravelDeal) => void;
  size?: Size;
  /** The Travel tab's colour scheme for a deal, so both places look the same. */
  accentOf: (accent: string) => { card: string };
  /** What each card shows, which differs between a wall-sized card and the Home band. */
  children: (deal: TravelDeal, centred: boolean) => React.ReactNode;
}) {
  const look = SIZES[size];
  const cardsRef = useRef(new Map<number, HTMLButtonElement>());
  const dragRef = useRef<{ startX: number; startIndex: number; moved: boolean; frame: number } | null>(null);
  const suppressClickRef = useRef(false);

  // Cards exist at whole positions in the markup; the fractional positions a
  // finger drags through are written here, outside React.
  function layout(centre: number, animate: boolean) {
    for (const [position, card] of cardsRef.current) {
      const place = placement(position - centre, look);
      card.style.transition = animate ? "transform 500ms cubic-bezier(0.2, 0.7, 0.2, 1)" : "none";
      card.style.transform = place.transform;
      card.style.zIndex = place.zIndex;
      card.style.opacity = place.opacity;
    }
  }

  // Settling after a drag, and any change from the arrows or the dots.
  useLayoutEffect(() => {
    if (!dragRef.current) layout(index, true);
  });

  useEffect(() => () => {
    if (dragRef.current) cancelAnimationFrame(dragRef.current.frame);
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!deals.length) return;
    // Deliberately no pointer capture yet. Capturing here retargets the
    // pointerup to the rail, so the browser fires click on the rail rather than
    // the card and a plain tap never opens the trip.
    dragRef.current = { startX: event.clientX, startIndex: index, moved: false, frame: 0 };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) > 8) {
      drag.moved = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety: the drag still works while the finger stays on the rail.
      }
    }
    if (!drag.moved) return;
    // One write per frame; pointermove can outrun the Pi's compositor.
    cancelAnimationFrame(drag.frame);
    drag.frame = requestAnimationFrame(() => layout(drag.startIndex - dx / look.step, false));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    cancelAnimationFrame(drag.frame);
    dragRef.current = null;
    const dx = event.clientX - drag.startX;
    const landed = Math.min(deals.length - 1, Math.max(0, Math.round(drag.startIndex - dx / look.step)));
    layout(landed, true);
    // pointerup is followed by click; a drag must not also open the card.
    suppressClickRef.current = drag.moved;
    if (landed !== index) onIndex(landed);
  }

  function openOrCentre(deal: TravelDeal, position: number, centred: boolean) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (centred) onOpen(deal);
    else onIndex(position);
  }

  return (
    <div
      className={`relative ${look.rail} flex-1 touch-none select-none overflow-hidden`}
      style={{ perspective: "1400px" }}
      data-no-touch-scroll
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {deals.map((deal, position) => {
        const offset = position - index;
        // Two either side: deep enough to read as a stack, few enough to paint.
        if (Math.abs(offset) > 2) return null;
        const centred = offset === 0;
        const place = placement(offset, look);
        return (
          <button
            key={deal.id}
            ref={(element) => {
              if (element) cardsRef.current.set(position, element);
              else cardsRef.current.delete(position);
            }}
            onClick={() => openOrCentre(deal, position, centred)}
            aria-label={centred ? `Open ${deal.destination}` : `Show ${deal.destination}`}
            className={`absolute left-1/2 top-1/2 flex flex-col justify-between overflow-hidden rounded-[28px] bg-gradient-to-br text-left text-white ${look.card} ${accentOf(deal.accent).card} ${centred ? "shadow-xl" : ""}`}
            style={{
              transform: place.transform,
              zIndex: place.zIndex,
              opacity: place.opacity,
              // Keeps each card on its own layer rather than repainting the rail.
              willChange: "transform",
              backfaceVisibility: "hidden"
            }}
          >
            {deal.imageUrl && (
              <>
                <img
                  src={deal.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                  // A dead image link should leave the gradient, not a broken icon.
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                />
                {/* Scrim: the photo is arbitrary, so text needs a guaranteed contrast floor. */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/25" />
              </>
            )}
            {children(deal, centred)}
          </button>
        );
      })}
    </div>
  );
}

/** The arrows and dots under a rail. */
export function CarouselControls({
  deals,
  index,
  onIndex,
  size = "full"
}: {
  deals: TravelDeal[];
  index: number;
  onIndex: (index: number) => void;
  size?: Size;
}) {
  const small = size === "home";
  return (
    <div className={`flex shrink-0 items-center justify-center ${small ? "gap-3" : "gap-5"}`}>
      <button
        onClick={() => onIndex(Math.max(0, index - 1))}
        disabled={index === 0}
        className={`touch-button bg-amb-card text-amb-muted disabled:opacity-30 ${small ? "h-12 w-14" : "w-20"}`}
        aria-label="Previous trip"
      >
        <ChevronLeft className={small ? "h-6 w-6" : "h-8 w-8"} />
      </button>
      <div className="flex items-center gap-2">
        {deals.map((deal, position) => (
          <button
            key={deal.id}
            onClick={() => onIndex(position)}
            aria-label={`Go to ${deal.destination}`}
            className={`rounded-full transition-all ${small ? "h-2.5" : "h-4"} ${position === index ? (small ? "w-7 bg-amb-accent" : "w-10 bg-sky-600") : `${small ? "w-2.5" : "w-4"} bg-slate-300 dark:bg-slate-600`}`}
          />
        ))}
      </div>
      <button
        onClick={() => onIndex(Math.min(deals.length - 1, index + 1))}
        disabled={index >= deals.length - 1}
        className={`touch-button bg-amb-card text-amb-muted disabled:opacity-30 ${small ? "h-12 w-14" : "w-20"}`}
        aria-label="Next trip"
      >
        <ChevronRight className={small ? "h-6 w-6" : "h-8 w-8"} />
      </button>
    </div>
  );
}

/** State a carousel keeps to itself, so dragging never re-renders the screen around it. */
export function useCarouselIndex() {
  return useState(0);
}
