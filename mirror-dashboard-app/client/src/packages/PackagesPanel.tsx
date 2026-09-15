import { Fragment, useCallback, useEffect, useState } from "react";
import { Package, RefreshCw, X } from "lucide-react";
import type { GmailConnection, PackageView, PackagesResponse } from "@mirror-dashboard/shared";
import { checkPackagesNow, fetchPackages, hidePackage } from "../api";
import { SlideQr } from "../SlideQr";
import { PackageMeter } from "./PackageMeter";
import { arrivalLine, groupByDay, trackingUrl, updatedAgo } from "./packageText";

const ago = (iso: string, now: Date) => updatedAgo(iso, now).replace(/^Updated /, "");

export function PackagesPanel({ focusPackageId, onFocusHandled }: { focusPackageId: number | null; onFocusHandled: () => void }) {
  const [data, setData] = useState<PackagesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<PackageView | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => {
    fetchPackages()
      .then((next) => { setData(next); setError(null); setNow(new Date()); })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // The banner can ask for one package to be opened.
  useEffect(() => {
    if (!data || focusPackageId === null) return;
    const match = [...data.active, ...data.delivered].find((pkg) => pkg.id === focusPackageId);
    if (match) setSelected(match);
    onFocusHandled();
  }, [data, focusPackageId, onFocusHandled]);

  async function checkNow() {
    setBusy(true);
    try {
      setData(await checkPackagesNow());
      setError(null);
      setNow(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check did not finish.");
    } finally {
      setBusy(false);
    }
  }

  async function notAPackage(pkg: PackageView) {
    try {
      setData(await hidePackage(pkg.id));
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not hide that package.");
    }
  }

  const groups = data ? groupByDay(data.active, now) : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex shrink-0 items-center justify-between gap-6">
        <h1 className="flex items-center gap-3 font-display text-5xl text-amb-ink"><Package className="h-9 w-9" />Packages</h1>
        {error && <p className="text-xl font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      {data && !data.gmail.configured ? (
        <SetupSteps />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px] gap-5">
          <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
            {!data && <p className="text-2xl text-amb-muted">Loading packages...</p>}
            {data && !groups.length && (
              <div className="rounded-[28px] border border-amb-border bg-amb-card p-8 text-2xl text-amb-muted">Nothing on the way.</div>
            )}
            {groups.map((group) => (
              <section key={group.heading} className="mb-6">
                <h2 className="mb-3 text-2xl font-semibold text-amb-ink">{group.heading}</h2>
                <div className="flex flex-col gap-4">
                  {group.packages.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelected(pkg)}
                      className="flex flex-col gap-4 rounded-[28px] border border-amb-border bg-amb-card p-6 text-left shadow-ambient active:scale-[0.99]"
                    >
                      <PackageMeter pkg={pkg} now={now} size="full" />
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-lg text-amb-muted">
                        {pkg.carrier && <span>{pkg.carrier}</span>}
                        {pkg.trackingNumber && <span>Tracking {pkg.trackingNumber}</span>}
                        {pkg.orderNumber && <span>Order {pkg.orderNumber}</span>}
                        <span>{updatedAgo(pkg.updatedAt, now)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain">
            <section className="rounded-[28px] border border-amb-border bg-amb-card p-6">
              <h2 className="text-2xl font-semibold text-amb-ink">Delivered this week</h2>
              {data && !data.delivered.length && <p className="mt-3 text-lg text-amb-muted">Nothing delivered in the last 7 days.</p>}
              <div className="mt-3 flex flex-col gap-2">
                {data?.delivered.map((pkg) => (
                  <button key={pkg.id} type="button" onClick={() => setSelected(pkg)} className="flex items-center gap-3 rounded-2xl bg-amb-well p-3 text-left active:scale-[0.99]">
                    {pkg.imageUrl
                      ? <img src={pkg.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-white object-cover" />
                      : <Package className="h-8 w-8 shrink-0 text-amb-muted" />}
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-semibold text-amb-ink">{pkg.item}</span>
                      <span className="block truncate text-base text-amb-muted">{arrivalLine(pkg, now)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <GmailBox gmail={data?.gmail} busy={busy} now={now} onCheck={checkNow} />
          </aside>
        </div>
      )}

      {selected && <PackageSheet pkg={selected} now={now} onClose={() => setSelected(null)} onHide={() => notAPackage(selected)} />}
    </div>
  );
}

function GmailBox({ gmail, busy, now, onCheck }: { gmail: GmailConnection | undefined; busy: boolean; now: Date; onCheck: () => void }) {
  const status = !gmail
    ? "Checking..."
    : gmail.status === "connected"
      ? `Connected as ${gmail.email}`
      : gmail.status === "needs_reconnect"
        ? `Sign in again for ${gmail.email}; the steps are in docs/gmail-setup.md.`
        : "Not connected yet; the steps are in docs/gmail-setup.md.";
  return (
    <section className="rounded-[28px] border border-amb-border bg-amb-card p-6">
      <h2 className="text-2xl font-semibold text-amb-ink">Gmail</h2>
      <p className="mt-2 text-lg text-amb-muted">{status}</p>
      {gmail?.lastCheckedAt && <p className="mt-1 text-lg text-amb-muted">Last checked {ago(gmail.lastCheckedAt, now)}</p>}
      {gmail?.lastError && <p className="mt-1 text-lg font-semibold text-amber-700 dark:text-amber-300">{gmail.lastError}</p>}
      <button
        type="button"
        onClick={onCheck}
        disabled={busy || gmail?.status !== "connected"}
        className="mt-4 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-amb-accent text-xl font-bold text-amb-accent-ink active:scale-95 disabled:opacity-40"
      >
        <RefreshCw className={`h-6 w-6 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Checking Gmail..." : "Check now"}
      </button>
    </section>
  );
}

function SetupSteps() {
  return (
    <div className="max-w-4xl rounded-[28px] border border-amb-border bg-amb-card p-8 text-xl leading-relaxed text-amb-ink">
      <p className="text-2xl font-semibold">Packages appear here once Gmail is connected.</p>
      <ol className="mt-4 list-decimal space-y-2 pl-7 text-amb-muted">
        <li>In Google Cloud, create a project, turn on the Gmail API and publish the app so it is In production.</li>
        <li>Create an OAuth client of type Desktop app and put its ID and secret in the Pi's .env as GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET, then restart the dashboard.</li>
        <li>On a PC, run ssh -L 4175:localhost:4174 connor@192.168.1.185 and open http://localhost:4175/gmail/connect.</li>
      </ol>
      <p className="mt-4 text-amb-muted">The full steps are in docs/gmail-setup.md.</p>
    </div>
  );
}

function PackageSheet({ pkg, now, onClose, onHide }: { pkg: PackageView; now: Date; onClose: () => void; onHide: () => void }) {
  const url = trackingUrl(pkg);
  const rows: Array<[string, string | null]> = [
    ["Store", pkg.store],
    ["Carrier", pkg.carrier],
    ["Tracking number", pkg.trackingNumber],
    ["Order number", pkg.orderNumber],
    ["Arrival", arrivalLine(pkg, now)],
    ["Last email", ago(pkg.updatedAt, now)]
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-10" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-5xl flex-col gap-6 overflow-y-auto rounded-[28px] bg-amb-sheet p-8" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1"><PackageMeter pkg={pkg} now={now} size="full" /></div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amb-well text-amb-ink active:scale-95">
            <X className="h-7 w-7" />
          </button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-8">
          <div>
            <dl className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-2 text-xl">
              {rows.filter(([, value]) => value).map(([label, value]) => (
                <Fragment key={label}>
                  <dt className="text-amb-muted">{label}</dt>
                  <dd className="break-words font-semibold text-amb-ink">{value}</dd>
                </Fragment>
              ))}
            </dl>
            {pkg.subjects.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xl font-semibold text-amb-ink">Emails</h3>
                <ul className="mt-2 space-y-1 text-lg text-amb-muted">
                  {pkg.subjects.map((subject, index) => <li key={index}>{subject}</li>)}
                </ul>
              </div>
            )}
          </div>
          {url && <SlideQr url={url} label="Scan to track on your phone" />}
        </div>
        <button type="button" onClick={onHide} className="min-h-14 self-start rounded-2xl border border-amb-border bg-amb-card px-6 text-xl font-semibold text-amb-ink active:scale-95">
          Not a package
        </button>
      </div>
    </div>
  );
}
