import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Minus, Plus } from "lucide-react";
import type { CalendarEvent } from "@mirror-dashboard/shared";
import { timeOf } from "../home/homeText";
import {
  addDaysTo, flipHalfDay, lastDay, monthDays, moveToDay, sameDay, setLastDay, setStart, setWholeDay, spanOf, stepMinutes, type EventSpan
} from "./eventTime";

const sourceLabel: Record<CalendarEvent["source"], string> = {
  ical: "Subscribed calendar",
  google: "Google Calendar",
  local: "Added here",
  voice: "Added by voice",
  demo: "Example"
};
const lengths = [["30 min", 30], ["1 hour", 60], ["1.5 hours", 90], ["2 hours", 120], ["3 hours", 180]] as const;
const round = "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amb-well text-amb-ink active:scale-95 disabled:opacity-30";
const longDay = (date: Date) => date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function describe(span: EventSpan) {
  const last = lastDay(span);
  const oneDay = sameDay(span.start, last);
  if (span.whole) return `${longDay(span.start)}${oneDay ? "" : ` to ${longDay(last)}`}, all day`;
  return `${longDay(span.start)}, ${timeOf(span.start)} to ${oneDay ? "" : `${longDay(last)}, `}${timeOf(span.end)}`;
}

/**
 * An event's details, with its day and times changed by tapping. Nothing here
 * needs typing, and a stray tap outside does not close it and lose the change.
 */
export function EventEditor({
  event,
  color,
  onSave,
  onClose
}: {
  event: CalendarEvent;
  color: string;
  onSave: (start: Date, end: Date) => Promise<void>;
  onClose: () => void;
}) {
  const [original] = useState(() => spanOf(event));
  const [span, setSpan] = useState<EventSpan>(original);
  const [month, setMonth] = useState(() => new Date(original.start.getFullYear(), original.start.getMonth(), 1));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const valid = span.end > span.start;
  const changed = span.start.getTime() !== original.start.getTime() || span.end.getTime() !== original.end.getTime();
  const last = lastDay(span);
  const fromFeed = event.source === "ical" || event.source === "google";
  const now = new Date();
  const earliest = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const latest = addDaysTo(earliest, 365);

  function change(next: EventSpan) {
    setSpan(next);
    setMonth(new Date(next.start.getFullYear(), next.start.getMonth(), 1));
  }

  // Switching All day back before saving gives the original times back.
  function toggleWholeDay() {
    change(!span.whole === original.whole ? moveToDay(original, span.start) : setWholeDay(span, !span.whole));
  }

  async function save() {
    setSaving(true);
    setFailed(false);
    try {
      await onSave(span.start, span.end);
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6">
      <div
        role="dialog"
        aria-label={event.title}
        className="flex max-h-full w-full max-w-[1280px] flex-col overflow-y-auto rounded-[28px] bg-amb-sheet p-8 text-amb-ink"
        style={{ borderTop: `10px solid ${color}` }}
      >
        <p className="text-lg font-semibold text-amb-muted">{sourceLabel[event.source] ?? event.source}</p>
        <h2 className="mt-1 line-clamp-2 shrink-0 font-display text-[46px] leading-tight">{event.title}</h2>
        {event.location && (
          <p className="mt-1 flex shrink-0 items-center gap-2 text-xl text-amb-muted">
            <MapPin className="h-5 w-5 shrink-0" />
            <span className="line-clamp-2">{event.location}</span>
          </p>
        )}

        <div className="mt-6 grid shrink-0 grid-cols-[500px_1fr] gap-10">
          <div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className={round} aria-label="Previous month">
                <ChevronLeft className="h-8 w-8" />
              </button>
              <p className="text-2xl font-bold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className={round} aria-label="Next month">
                <ChevronRight className="h-8 w-8" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={index} className="text-base font-semibold text-amb-muted">{day}</span>)}
              {monthDays(month).map((day) => {
                const picked = sameDay(day, span.start);
                const outside = day.getMonth() !== month.getMonth();
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={!picked && (day < earliest || day > latest)}
                    onClick={() => change(moveToDay(span, day))}
                    aria-label={day.toDateString()}
                    aria-pressed={picked}
                    className={`h-14 rounded-xl text-2xl font-semibold active:scale-95 disabled:opacity-25 ${picked ? "bg-amb-accent text-amb-accent-ink" : "bg-amb-well"} ${outside ? "opacity-50" : ""} ${sameDay(day, now) && !picked ? "ring-2 ring-inset ring-amb-accent" : ""}`}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <button
              type="button"
              aria-pressed={span.whole}
              onClick={toggleWholeDay}
              className={`h-16 rounded-2xl text-2xl font-bold active:scale-[0.98] ${span.whole ? "bg-amb-accent text-amb-accent-ink" : "bg-amb-well"}`}
            >
              All day
            </button>
            {!span.whole && (
              <>
                <TimeRow label="Starts" value={span.start} onChange={(start) => change(setStart(span, start))} />
                <TimeRow label="Ends" value={span.end} onChange={(end) => change({ ...span, end })} />
                <div className="grid grid-cols-5 gap-2">
                  {lengths.map(([label, minutes]) => {
                    const picked = span.end.getTime() - span.start.getTime() === minutes * 60_000;
                    return (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() => change({ ...span, end: new Date(span.start.getTime() + minutes * 60_000) })}
                        className={`h-14 rounded-xl text-lg font-semibold active:scale-95 ${picked ? "bg-amb-accent text-amb-accent-ink" : "bg-amb-well"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <div className="flex items-center gap-3">
              <span className="w-28 text-xl font-semibold text-amb-muted">Last day</span>
              <button type="button" disabled={sameDay(last, span.start)} onClick={() => change(setLastDay(span, addDaysTo(last, -1)))} className={round} aria-label="One day shorter">
                <Minus className="h-7 w-7" />
              </button>
              <span className="flex-1 text-center text-2xl font-semibold">{longDay(last)}</span>
              <button type="button" onClick={() => change(setLastDay(span, addDaysTo(last, 1)))} className={round} aria-label="One day longer">
                <Plus className="h-7 w-7" />
              </button>
            </div>
          </div>
        </div>

        <p className={`mt-5 shrink-0 text-2xl font-semibold ${valid ? "" : "text-rose-600 dark:text-rose-300"}`}>
          {valid ? describe(span) : "The end needs to be after the start."}
        </p>
        {fromFeed && <p className="mt-1 text-lg text-amb-muted">Changes show on this dashboard only. The original calendar keeps its own time.</p>}
        {failed && <p role="alert" className="mt-1 text-lg font-semibold text-rose-600 dark:text-rose-300">That did not save. Try again.</p>}

        <div className="mt-5 grid shrink-0 grid-cols-2 gap-4">
          <button type="button" onClick={onClose} className="touch-button bg-amb-well text-amb-ink">{changed ? "Cancel" : "Close"}</button>
          <button type="button" onClick={save} disabled={!changed || !valid || saving} className="touch-button bg-amb-accent text-amb-accent-ink">
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeRow({ label, value, onChange }: { label: string; value: Date; onChange: (next: Date) => void }) {
  const hour = (by: number) => new Date(value.getTime() + by * 3_600_000);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xl font-semibold text-amb-muted">{label}</span>
      <button type="button" onClick={() => onChange(hour(-1))} className={round} aria-label={`${label} an hour earlier`}><Minus className="h-7 w-7" /></button>
      <span className="w-14 text-center text-4xl font-semibold">{value.getHours() % 12 || 12}</span>
      <button type="button" onClick={() => onChange(hour(1))} className={round} aria-label={`${label} an hour later`}><Plus className="h-7 w-7" /></button>
      <span className="text-3xl text-amb-muted">:</span>
      <button type="button" onClick={() => onChange(stepMinutes(value, -1))} className={round} aria-label={`${label} five minutes earlier`}><Minus className="h-7 w-7" /></button>
      <span className="w-14 text-center text-4xl font-semibold">{String(value.getMinutes()).padStart(2, "0")}</span>
      <button type="button" onClick={() => onChange(stepMinutes(value, 1))} className={round} aria-label={`${label} five minutes later`}><Plus className="h-7 w-7" /></button>
      <button type="button" onClick={() => onChange(flipHalfDay(value))} className={`${round} text-xl font-bold`} aria-label={`${label} AM or PM`}>
        {value.getHours() < 12 ? "AM" : "PM"}
      </button>
    </div>
  );
}
