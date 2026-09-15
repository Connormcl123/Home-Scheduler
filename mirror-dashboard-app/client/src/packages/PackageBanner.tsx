import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { House, Truck } from "lucide-react";
import type { PackageEvent } from "@mirror-dashboard/shared";
import { fetchPackageEvents } from "../api";
import { eventLabel, nextBanner } from "./packageText";

/**
 * Announces "Out for delivery" and "Delivered". Asks the Pi every minute and
 * shows the newest new event for 20 seconds; tapping opens that package.
 * Waits while the share banner is up, since both sit in the same place.
 */
export function PackageBanner({ blocked, onOpen }: { blocked: boolean; onOpen: (event: PackageEvent) => void }) {
  const [queued, setQueued] = useState<PackageEvent | null>(null);
  const [current, setCurrent] = useState<PackageEvent | null>(null);
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    async function poll() {
      try {
        const response = await fetchPackageEvents(lastId.current ?? undefined);
        if (!live) return;
        const next = nextBanner(lastId.current, response);
        lastId.current = next.lastId;
        if (next.announce) setQueued(next.announce);
      } catch {
        // Offline for a moment: the next tick tries again.
      }
    }
    poll();
    const timer = window.setInterval(poll, 60_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!queued || blocked) return;
    setCurrent(queued);
    setQueued(null);
  }, [queued, blocked]);

  // The countdown runs only while the banner is on screen, so a share banner
  // defers the announcement instead of using up its 20 seconds unseen.
  useEffect(() => {
    if (!current || blocked) return;
    const timer = window.setTimeout(() => setCurrent(null), 20_000);
    return () => window.clearTimeout(timer);
  }, [current, blocked]);

  if (!current || blocked) return null;
  const Icon = current.status === "delivered" ? House : Truck;
  // The wrapper does the centring, because Motion's transform would override a translate class on the button.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center">
      <motion.button
        key={current.id}
        type="button"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
        onClick={() => {
          onOpen(current);
          setCurrent(null);
        }}
        className="pointer-events-auto flex items-center gap-4 rounded-[26px] border border-amb-border bg-amb-sheet py-3 pl-3 pr-6 text-left shadow-ambient"
      >
        {current.package.imageUrl
          ? <img src={current.package.imageUrl} alt="" className="h-16 w-16 rounded-2xl bg-white object-cover" />
          : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amb-well"><Icon className="h-8 w-8 text-amb-accent" /></span>}
        <span className="text-xl font-semibold text-amb-ink">{eventLabel(current)}</span>
      </motion.button>
    </div>
  );
}
