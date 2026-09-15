import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** A QR code that carries a link to a phone; the kiosk itself never leaves the dashboard. */
export function SlideQr({ url, label = "Scan to open on your phone" }: { url: string; label?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((data) => { if (live) setSrc(data); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [url]);
  if (!src) return null;
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white/95 p-4">
      <img src={src} alt="" className="h-28 w-28" />
      <p className="max-w-[9rem] text-lg font-bold leading-tight text-amb-ink">{label}</p>
    </div>
  );
}
