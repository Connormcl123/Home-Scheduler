import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ScreensaverSettings } from "@mirror-dashboard/shared";
import { fetchScreensaver } from "../api";
import { ambientKeyFor } from "../ambient";
import { nextSlide, screensaverDrift } from "./screensaverMath";

/**
 * Family photos after a few quiet minutes. Any touch brings the dashboard back;
 * the waking tap is swallowed so it never presses whatever sits underneath.
 * Photos live in the Pi's data/screensaver folder (docs/screensaver.md).
 */
export function Screensaver() {
  const [settings, setSettings] = useState<ScreensaverSettings | null>(null);
  const [showing, setShowing] = useState(false);
  const [slide, setSlide] = useState(0);
  const [now, setNow] = useState(new Date());
  const lastActivity = useRef(Date.now());

  // Re-read the folder now and then, so photos copied onto the Pi appear without a reload.
  useEffect(() => {
    const load = () => fetchScreensaver().then(setSettings).catch(() => undefined);
    load();
    const timer = window.setInterval(load, 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const touched = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel"] as const;
    events.forEach((name) => window.addEventListener(name, touched, { capture: true, passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, touched, { capture: true }));
  }, []);

  useEffect(() => {
    if (!settings?.photos.length) return;
    const idleMs = settings.idleMinutes * 60 * 1000;
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= idleMs) setShowing(true);
    }, 15 * 1000);
    return () => window.clearInterval(timer);
  }, [settings]);

  // The clock and the burn-in drift both move once a minute; slides advance on their own timer.
  useEffect(() => {
    if (!showing) return;
    setNow(new Date());
    const clock = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(clock);
  }, [showing]);

  useEffect(() => {
    if (!showing || !settings || settings.photos.length < 2) return;
    const timer = window.setInterval(() => setSlide((index) => nextSlide(index, settings.photos.length)), settings.slideSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [showing, settings]);

  if (!settings?.photos.length) return null;

  function wake() {
    lastActivity.current = Date.now();
    setShowing(false);
  }

  const photo = settings.photos[slide % settings.photos.length];
  const drift = screensaverDrift(now);
  const night = ambientKeyFor(now) === "night";

  return (
    <AnimatePresence>
      {showing && (
        <motion.div
          key="screensaver"
          className="fixed inset-0 z-[100] cursor-none overflow-hidden bg-black text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            wake();
          }}
        >
          {/* Dimmed at night on the inside, so the black backing still hides the dashboard. */}
          <div className="absolute inset-0 transition-[transform,opacity] duration-[60s] ease-linear" style={{ transform: `translate(${drift.x}px, ${drift.y}px)`, opacity: night ? 0.55 : 1 }}>
            <AnimatePresence mode="sync">
              <motion.img
                key={photo}
                src={photo}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full object-contain"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2 }}
              />
            </AnimatePresence>
            <div className="absolute bottom-12 right-14 text-right [text-shadow:0_2px_24px_rgba(0,0,0,0.7)]">
              <p className="font-display text-[9rem] leading-none">
                {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/, "")}
              </p>
              <p className="mt-2 text-3xl font-semibold text-white/80">
                {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
