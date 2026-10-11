/** The colour a trip idea wears, wherever it appears: the Travel tab or Home. */
const DEAL_ACCENTS: Record<string, { card: string; chip: string; ring: string }> = {
  sky: { card: "from-sky-500 to-sky-700", chip: "bg-sky-100 text-sky-800", ring: "ring-sky-300" },
  amber: { card: "from-amber-500 to-orange-600", chip: "bg-amber-100 text-amber-900", ring: "ring-amber-300" },
  emerald: { card: "from-emerald-500 to-teal-700", chip: "bg-emerald-100 text-emerald-900", ring: "ring-emerald-300" },
  rose: { card: "from-rose-500 to-pink-700", chip: "bg-rose-100 text-rose-900", ring: "ring-rose-300" },
  violet: { card: "from-violet-500 to-indigo-700", chip: "bg-violet-100 text-violet-900", ring: "ring-violet-300" },
  teal: { card: "from-teal-500 to-cyan-700", chip: "bg-teal-100 text-teal-900", ring: "ring-teal-300" }
};

export function dealAccent(name: string) {
  return DEAL_ACCENTS[name] || DEAL_ACCENTS.sky;
}
