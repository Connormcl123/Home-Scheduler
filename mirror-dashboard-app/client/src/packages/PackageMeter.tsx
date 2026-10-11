import { motion } from "motion/react";
import { Check, House, Package, Truck, type LucideIcon } from "lucide-react";
import type { PackageView } from "@mirror-dashboard/shared";
import { STEPS, arrivalLine, stepIndex } from "./packageText";

const ICONS = { ordered: Package, shipped: Truck, out_for_delivery: Truck, delivered: House } as const;
const LAST = STEPS.length - 1;

/** Keeps the first and last labels inside the card: they hang off the dot's outer edge. */
function labelShift(index: number) {
  if (index === 0) return "translateX(-12px)";
  if (index === LAST) return "translateX(calc(-100% + 12px))";
  return "translateX(-50%)";
}

/**
 * The four-step meter from the family's Amazon screenshot: labelled dots on a
 * line, filled up to the current step, with the item above and an icon riding
 * the meter. On Home the icon slides in from the first dot as part of the
 * entrance; it moves by transform only, so the Pi composites it.
 */
export function PackageMeter({ pkg, now, size = "home", animate = false, bare = false }: { pkg: PackageView; now: Date; size?: "home" | "full"; animate?: boolean; bare?: boolean }) {
  const current = stepIndex(pkg.status);
  const percent = (current / LAST) * 100;
  const Icon = ICONS[pkg.status];
  const full = size === "full";
  // Bare is the Home header strip: just what it is and the meter.
  if (bare) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-center font-display text-[30px] leading-tight text-amb-ink">{pkg.item}</p>
        <Steps current={current} percent={percent} Icon={Icon} full={false} animate={animate} />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-4">
        {pkg.imageUrl && (
          <img
            src={pkg.imageUrl}
            alt=""
            className={`${full ? "h-20 w-20" : "h-12 w-12"} shrink-0 rounded-2xl bg-white object-cover`}
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
        )}
        <div className="min-w-0">
          <p className={`truncate font-display ${full ? "text-[34px]" : "text-[26px]"} leading-tight text-amb-ink`}>{pkg.item}</p>
          <p className={`truncate ${full ? "text-xl" : "text-base"} font-medium text-amb-muted`}>{arrivalLine(pkg, now)}</p>
        </div>
      </div>

      <Steps current={current} percent={percent} Icon={Icon} full={full} animate={animate} />

      {pkg.issue && <p className={`${full ? "text-xl" : "text-base"} font-semibold text-amber-700 dark:text-amber-300`}>{pkg.issue}</p>}
    </div>
  );
}

function Steps({ current, percent, Icon, full, animate }: { current: number; percent: number; Icon: LucideIcon; full: boolean; animate: boolean }) {
  return (
      /* Dots sit 12px in from each end of this padded box. */
      <div className="px-3">
        <div className="relative h-9">
          <motion.div
            className="absolute inset-x-0 top-0"
            initial={animate ? { x: "0%" } : false}
            animate={{ x: `${percent}%` }}
            transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1], delay: animate ? 0.5 : 0 }}
          >
            <Icon className="-ml-4 block h-8 w-8 text-amb-accent" />
          </motion.div>
        </div>
        <div className="relative h-6">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-amb-border" />
          <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-amb-accent" style={{ width: `${percent}%` }} />
          {STEPS.map((step, index) => {
            const done = index <= current;
            return (
              <span
                key={step.status}
                className={`absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ${done ? "bg-amb-accent text-amb-accent-ink" : "border-2 border-amb-muted bg-amb-card"}`}
                style={{ left: `${(index / LAST) * 100}%` }}
              >
                {done && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
            );
          })}
        </div>
        <div className="relative mt-2 h-7">
          {STEPS.map((step, index) => (
            <span
              key={step.status}
              className={`absolute top-0 whitespace-nowrap ${full ? "text-lg" : "text-base"} ${index === current ? "font-bold text-amb-ink" : "font-medium text-amb-muted"}`}
              style={{ left: `${(index / LAST) * 100}%`, transform: labelShift(index) }}
            >
              {step.label}
            </span>
          ))}
        </div>
      </div>
  );
}
