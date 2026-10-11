import { useCallback, useEffect, useState } from "react";
import { Delete, Plus, Trash2, X } from "lucide-react";
import type { BudgetSummary, BudgetView } from "@mirror-dashboard/shared";
import { deleteBudget, fetchBudgets, saveBudget, updateBudget } from "../api";

const money = (value: number) => `$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;

const STATE_TEXT: Record<BudgetView["state"], string> = {
  under: "On track",
  ahead: "Running ahead",
  over: "Over"
};

/**
 * The household's budgets, edited on the wall. Amounts are whole dollars typed
 * on a keypad: a budget is "six hundred", never $612.37, and the Pi's on-screen
 * keyboard is too small a target for a number this often changed.
 */
export function BudgetsPanel({ onChanged }: { onChanged?: () => void }) {
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BudgetView | "new" | null>(null);

  const load = useCallback(() => {
    fetchBudgets()
      .then((next) => { setSummary(next); setError(null); })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 300_000);
    return () => window.clearInterval(timer);
  }, [load]);

  function done() {
    setEditing(null);
    load();
    onChanged?.();
  }

  const left = summary ? summary.daysInMonth - summary.dayOfMonth : 0;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-amb-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-black">Budgets</h3>
        <button onClick={() => setEditing("new")} className="touch-button bg-amb-accent px-5 text-amb-accent-ink">
          <Plus className="h-6 w-6" />
          New
        </button>
      </div>

      {summary && (
        <p className="mt-2 text-lg font-semibold text-amb-muted">
          {money(summary.totalSpent)} of {money(summary.totalLimit)} this month, {left === 0 ? "last day" : `${left} days left`}
          {summary.unbudgetedSpent > 0 ? `, plus ${money(summary.unbudgetedSpent)} unbudgeted` : ""}
        </p>
      )}
      {error && <p className="mt-2 text-lg font-bold text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
        {summary && !summary.budgets.length && (
          <p className="rounded-2xl bg-amb-well p-5 text-xl font-semibold text-amb-muted">
            No budgets yet. Press New, or say &ldquo;Hey Siri, set my groceries budget to 600&rdquo;.
          </p>
        )}
        {summary?.budgets.map((budget) => {
          const percent = Math.min(100, budget.percent);
          const tone = budget.state === "over" ? "text-rose-600 dark:text-rose-400" : budget.state === "ahead" ? "text-amber-700 dark:text-amber-300" : "text-amb-muted";
          return (
            <button key={budget.id} onClick={() => setEditing(budget)} className="w-full rounded-2xl bg-amb-well p-4 text-left active:scale-[0.99]">
              <div className="mb-2 flex items-center justify-between gap-4 text-xl font-bold">
                <span className="truncate">{budget.category}</span>
                <span className={tone}>{budget.state === "over" ? `${money(budget.remaining)} over` : `${money(budget.remaining)} left`}</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-amb-card">
                <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: budget.state === "over" ? "#e11d48" : budget.color }} />
              </div>
              <p className="mt-2 flex items-center justify-between text-lg font-semibold text-amb-muted">
                <span>{money(budget.spentAmount)} of {money(budget.limitAmount)}</span>
                <span className={tone}>{STATE_TEXT[budget.state]}{budget.state !== "over" && budget.projected > budget.limitAmount ? `, heading for ${money(budget.projected)}` : ""}</span>
              </p>
            </button>
          );
        })}
      </div>

      {editing && summary && (
        <BudgetEditor
          budget={editing === "new" ? null : editing}
          available={summary.available}
          onClose={() => setEditing(null)}
          onSaved={done}
        />
      )}
    </div>
  );
}

function BudgetEditor({
  budget,
  available,
  onClose,
  onSaved
}: {
  budget: BudgetView | null;
  available: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(budget?.category ?? available[0] ?? "");
  const [amount, setAmount] = useState(budget ? String(Math.round(budget.limitAmount)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = (key: string) => setAmount((current) => {
    if (key === "back") return current.slice(0, -1);
    const next = `${current}${key}`.replace(/^0+(?=\d)/, "");
    return next.length > 6 ? current : next;
  });

  async function save() {
    setBusy(true);
    try {
      if (budget) await updateBudget(budget.id, { limitAmount: Number(amount) });
      else await saveBudget({ category, limitAmount: Number(amount) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That budget could not be saved.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!budget) return;
    setBusy(true);
    try {
      await deleteBudget(budget.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That budget could not be removed.");
      setBusy(false);
    }
  }

  const valid = Number(amount) > 0 && (budget || category);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-8" onClick={onClose}>
      <div className="w-[720px] max-w-full rounded-3xl bg-amb-sheet p-7" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-4xl text-amb-ink">{budget ? budget.category : "New budget"}</h3>
            <p className="mt-1 text-xl text-amb-muted">
              {budget ? `${money(budget.spentAmount)} spent this month` : "Pick a category, then set the monthly amount."}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amb-well active:scale-95">
            <X className="h-7 w-7" />
          </button>
        </div>

        {!budget && (
          <div className="mt-5 flex flex-wrap gap-2">
            {available.map((name) => (
              <button
                key={name}
                onClick={() => setCategory(name)}
                className={`rounded-2xl px-5 py-3 text-xl font-bold active:scale-95 ${name === category ? "bg-amb-accent text-amb-accent-ink" : "bg-amb-well text-amb-ink"}`}
              >
                {name}
              </button>
            ))}
            {!available.length && <p className="text-xl text-amb-muted">Every category already has a budget.</p>}
          </div>
        )}

        <p className="mt-6 text-center font-display text-[64px] leading-none text-amb-ink">${amount || "0"}<span className="text-3xl text-amb-muted"> a month</span></p>

        <div className="mx-auto mt-5 grid w-[420px] max-w-full grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"].map((key) => (
            <button
              key={key}
              onClick={() => press(key)}
              className="flex h-16 items-center justify-center rounded-2xl bg-amb-well text-3xl font-bold text-amb-ink active:scale-95"
              aria-label={key === "back" ? "Delete a digit" : key}
            >
              {key === "back" ? <Delete className="h-7 w-7" /> : key}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-center text-lg font-bold text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="mt-6 flex items-center justify-between gap-4">
          {budget ? (
            <button onClick={remove} disabled={busy} className="touch-button bg-rose-100 px-6 text-rose-700 disabled:opacity-40">
              <Trash2 className="h-6 w-6" />
              Remove
            </button>
          ) : <span />}
          <button onClick={save} disabled={busy || !valid} className="touch-button bg-amb-accent px-8 text-amb-accent-ink disabled:opacity-40">
            {busy ? "Saving..." : budget ? "Save" : "Create budget"}
          </button>
        </div>
      </div>
    </div>
  );
}
