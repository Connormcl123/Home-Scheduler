import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { ShareImport } from "@mirror-dashboard/shared";
import { fetchRecentShares } from "./api";

/**
 * Announces things saved from the phone's Share sheet. Asks the Pi for new
 * shares every 30 seconds (tabs only load their lists when opened, and the
 * dashboard refresh is every 5 minutes) and shows the newest saved one for
 * 20 seconds. Tapping it opens the item.
 */
export function ShareBanner({ onArrived, onOpen, onVisibleChange }: { onArrived: (share: ShareImport) => void; onOpen: (share: ShareImport) => void; onVisibleChange?: (visible: boolean) => void }) {
  const [current, setCurrent] = useState<ShareImport | null>(null);
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    async function poll() {
      try {
        if (lastId.current === null) {
          // First run: remember where history ends, so old shares are not announced.
          const latest = await fetchRecentShares();
          lastId.current = latest.reduce((max, share) => Math.max(max, share.id), 0);
          return;
        }
        const fresh = await fetchRecentShares(lastId.current);
        if (!live || !fresh.length) return;
        lastId.current = fresh.reduce((max, share) => Math.max(max, share.id), lastId.current);
        const saved = fresh.filter((share) => share.status === "saved");
        // Newest by id, whatever order the list arrives in (the server lists newest-first when there is no marker yet).
        const newest = saved.reduce<ShareImport | undefined>((best, share) => (!best || share.id > best.id ? share : best), undefined);
        if (newest) {
          setCurrent(newest);
          onArrived(newest);
        }
      } catch {
        // Offline for a moment: the next tick tries again.
      }
    }
    poll();
    const timer = window.setInterval(poll, 30_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [onArrived]);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setCurrent(null), 20_000);
    return () => window.clearTimeout(timer);
  }, [current]);

  useEffect(() => {
    onVisibleChange?.(current !== null);
  }, [current, onVisibleChange]);

  if (!current) return null;
  // The wrapper does the centring, because Motion's transform would override a translate class on the button.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center">
      <motion.button
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
        {current.imageUrl ? <img src={current.imageUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : null}
        <span className="text-xl text-amb-ink">
          From your phone: <b className="font-semibold">{current.title}</b>, saved to {current.kind === "trip" ? "Trips" : "Recipes"}
        </span>
      </motion.button>
    </div>
  );
}
