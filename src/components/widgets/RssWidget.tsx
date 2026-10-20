"use client";

import { useEffect, useRef, useState } from "react";
import { Rss } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useT, useLocale } from "@/lib/i18n/LocaleProvider";
import { intlDateLocale } from "@/lib/i18n/locales";

type RssItem = { title: string; link: string; date: string | null; image: string | null; summary?: string | null; source?: string };

// Titel mit drei Überlauf-Modi (wie beim Media-/Artwork-Widget):
//  truncate → mehrzeilig abschneiden mit …   (Standard)
//  shrink   → mehrzeilig, Schrift verkleinern bis der ganze Titel passt
//  scroll   → einzeilig als Laufschrift, wenn er zu lang ist
function SmartTitle({ text, mode, maxLines, accent, linkable, link, onLinkClick }: {
  text: string;
  mode: "truncate" | "shrink" | "scroll";
  maxLines: number;
  accent: string;
  linkable: boolean;
  link: string;
  onLinkClick: (e: React.MouseEvent) => void;
}) {
  const outer = useRef<HTMLAnchorElement | null>(null);
  const inner = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(1);
  const [over, setOver] = useState(0);
  useEffect(() => { setScale(1); setOver(0); }, [text, mode, maxLines]);
  useEffect(() => {
    if (mode === "truncate") return;
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const id = requestAnimationFrame(() => {
      if (mode === "scroll") {
        const next = Math.max(0, i.scrollWidth - o.clientWidth);
        setOver((prev) => (Math.abs(prev - next) > 2 ? next : prev));
      } else if (mode === "shrink" && scale === 1) {
        const lineH = parseFloat(getComputedStyle(o).lineHeight) || 0;
        const target = lineH * maxLines;
        if (target > 0 && o.scrollHeight > target + 1) setScale(Math.max(0.6, target / o.scrollHeight));
      }
    });
    return () => cancelAnimationFrame(id);
  });
  const linkClass = linkable && link ? "cursor-pointer hover:underline decoration-1 underline-offset-2" : "";
  const linkAttrs: any = linkable && link ? { href: link, target: "_blank", rel: "noopener noreferrer", onClick: onLinkClick } : {};
  const common: React.CSSProperties = { color: "inherit", textDecorationColor: accent, fontWeight: 600, lineHeight: 1.2 };

  if (mode === "scroll") {
    const dur = Math.max(7, over / 22);
    return (
      <a ref={outer} {...linkAttrs} className={linkClass} style={{ ...common, fontSize: "1.15em", display: "block", overflow: "hidden", whiteSpace: "nowrap" }}>
        <span ref={inner} className="inline-block" style={over > 0 ? ({ "--mf-marquee-dist": `-${over + 8}px`, animation: `mf-marquee ${dur}s linear infinite alternate` } as React.CSSProperties) : undefined}>{text}</span>
      </a>
    );
  }
  if (mode === "shrink") {
    return (
      <a ref={outer} {...linkAttrs} className={linkClass} style={{ ...common, fontSize: `${(1.15 * scale).toFixed(3)}em`, display: "block", overflow: "hidden", maxHeight: `${maxLines * 1.2}em` }}>
        <span ref={inner}>{text}</span>
      </a>
    );
  }
  return (
    <a ref={outer} {...linkAttrs} className={linkClass} style={{ ...common, fontSize: "1.15em", display: "-webkit-box", WebkitLineClamp: maxLines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
      <span ref={inner}>{text}</span>
    </a>
  );
}

export default function RssWidget({ config }: { config?: any }) {
  const t = useT();
  const { locale } = useLocale();
  const dateLocale = intlDateLocale(locale);

  // feeds: neu als Array einzelner URLs, rückwärtskompatibel zum alten String.
  const feedsRaw = config?.feeds;
  const feeds: string = (Array.isArray(feedsRaw) ? feedsRaw.filter(Boolean).join("\n") : (feedsRaw || "")).trim();
  const mode: "list" | "rotate" = config?.rssMode === "rotate" ? "rotate" : "list";
  const limit = Math.max(1, Math.min(30, Number(config?.limit) || 8));
  const rotateSec = Math.max(3, Math.min(60, Number(config?.rotateSec) || 8));
  const showSource = config?.showSource !== false;
  const showDate = config?.showDate !== false;
  const showImage = config?.showImage === true;
  const showSummary = config?.showSummary !== false;
  const linkable = config?.linkable === true;   // Titel/Zeile öffnet den Artikel (opt-in, Kiosk-sicher aus)
  const showQr = config?.showQr === true;        // QR-Code im Einzeln-Modus
  // Zeilen-Limits: 0 = Auto (an Kachelhöhe angepasst), sonst fester Wert.
  const titleLinesCfg = Math.max(0, Math.min(3, Number(config?.titleLines) || 0));
  const descLinesCfg = Math.max(0, Math.min(6, Number(config?.descLines) || 0));
  // Akzent hat ein EIGENES Feld. Vorher lag er auf config.color — genau dem
  // Feld, das der Text-&-Farbe-Tab als Textfarbe beschreibt. Beide Regler
  // hingen also aneinander, und eine echte Textfarbe gab es gar nicht.
  const accent: string = config?.rssAccent || "#f59e0b";
  // Theme-Awareness: NUR wenn die Kachel wirklich auf hellem Grund sitzt —
  // also wenn sie als Karte im Notification-Widget eingebettet ist und der
  // Host cardTheme mitgibt. Eigenständig liegt sie direkt auf dem Wallpaper;
  // würde sie dem View-Theme folgen, färbte sie ihren Text dunkel, ohne dass
  // hinter ihr irgendetwas hell wird — und man sieht nichts mehr.
  const isLight = config?.cardTheme === "light";
  // Textfarbe: gesetzte Farbe gewinnt, sonst passend zum Theme.
  const fg = config?.color || (isLight ? "rgba(15,23,42,0.92)" : "#ffffff");
  const fgDim = isLight ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.55)";
  const fgFaint = isLight ? "rgba(15,23,42,0.45)" : "rgba(255,255,255,0.40)";
  const dotIdle = isLight ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.3)";
  const showDots = config?.showDots !== false;
  const textOverflow: "truncate" | "shrink" | "scroll" =
    config?.textOverflow === "shrink" || config?.textOverflow === "scroll" ? config.textOverflow : "truncate";

  const [items, setItems] = useState<RssItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);          // Ziel-Index (Timer/Wisch)
  const [shownIdx, setShownIdx] = useState(0); // tatsächlich gezeigter Index (folgt idx weich)
  const [fadeOut, setFadeOut] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [navNonce, setNavNonce] = useState(0); // manuelles Wischen → Auto-Rotate-Timer neu starten
  const [loadedImgs, setLoadedImgs] = useState<Set<string>>(() => new Set());
  const markLoaded = (url: string | null | undefined) => {
    if (!url) return;
    setLoadedImgs((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
  };

  // Fetch + 10-Min-Intervall + Wake-Refresh (Monitor an → sofort frisch,
  // wie beim Wetter — Timer war im Standby pausiert).
  useEffect(() => {
    if (!feeds) { setItems([]); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/rss?urls=${encodeURIComponent(feeds)}&limit=${limit}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.error) { setError(data.error); return; }
        setItems(Array.isArray(data.items) ? data.items : []);
        setError(null);
      } catch {
        if (!cancelled) setError("load_failed");
      }
    };
    load();
    const iv = setInterval(load, 10 * 60 * 1000);
    const onWake = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => { cancelled = true; clearInterval(iv); document.removeEventListener("visibilitychange", onWake); window.removeEventListener("focus", onWake); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds, limit]);

  // Rotator: nächster Beitrag im Takt. navNonce in den Deps → nach einem
  // manuellen Wisch startet der Timer frisch (springt nicht sofort weiter).
  useEffect(() => {
    if (mode !== "rotate" || items.length < 2) return;
    const iv = setInterval(() => setIdx((i) => (i + 1) % items.length), rotateSec * 1000);
    return () => clearInterval(iv);
  }, [mode, items.length, rotateSec, navNonce]);
  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  // idx im gültigen Bereich halten, wenn sich die Feed-Länge ändert.
  useEffect(() => {
    if (idx > items.length - 1) setIdx(0);
    if (shownIdx > items.length - 1) setShownIdx(0);
  }, [items.length, idx, shownIdx]);

  // Thumbnails vorladen, damit sie beim Beitragswechsel nicht nachpoppen.
  // Der Preload füllt loadedImgs (inkl. .complete für bereits gecachte Bilder),
  // damit das <img> nie bei opacity:0 hängen bleibt, falls sein onLoad nicht feuert.
  useEffect(() => {
    if (typeof window === "undefined") return;
    for (const it of items) {
      if (!it.image) continue;
      const url = it.image;
      const im = new window.Image();
      im.onload = () => markLoaded(url);
      im.src = url;
      if (im.complete) markLoaded(url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Weicher Beitragswechsel: aktuellen Beitrag aus-, dann neuen einblenden
  // (statt hartem Schnitt). shownIdx folgt dem Ziel-idx verzögert.
  useEffect(() => {
    if (idx === shownIdx) return;
    setFadeOut(true);
    const tt = setTimeout(() => { setShownIdx(idx); setFadeOut(false); }, 320);
    return () => clearTimeout(tt);
  }, [idx, shownIdx]);

  // ── Kachel vermessen → Layout an echte Höhe/Breite koppeln (Einzeln-Modus).
  // Verhindert das Abschneiden oben/unten und passt QR + Teaser-Zeilen an. ──
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure); // Tizen-Fallback
    return () => window.removeEventListener("resize", measure);
  }, [mode, items.length]);

  // Content- vs. verfügbare Höhe messen → passt der Beitrag, wird zentriert;
  // läuft er über, oben gepinnt (Meta-Schutz). So rutscht bei festen Zeilen +
  // kurzem Feed nichts nach oben.
  const contentRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ content: 0, col: 0 });
  useEffect(() => {
    const c = contentRef.current, col = colRef.current;
    if (!c || !col) return;
    const measure = () => setFit({ content: c.offsetHeight, col: col.clientHeight });
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(c); ro.observe(col);
      return () => ro.disconnect();
    }
    return;
  }, [mode, items.length, shownIdx]);

  const relTime = (iso: string | null): string => {
    if (!iso) return "";
    const ts = Date.parse(iso);
    if (isNaN(ts)) return "";
    const mins = Math.round((nowMs - ts) / 60000);
    if (mins < 1) return t("gerade eben");
    if (mins < 60) return `${mins} min`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} ${t("Std")}`;
    return new Date(ts).toLocaleDateString(dateLocale, { day: "2-digit", month: "short" });
  };

  // ── Wisch-Geste (nur Einzeln-Modus) ──
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const go = (dir: number) => {
    setIdx((i) => (i + dir + items.length) % items.length);
    setNavNonce((n) => n + 1);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    swipedRef.current = false;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = dragRef.current;
    dragRef.current = null;
    if (!s || items.length < 2) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      swipedRef.current = true; // unterdrückt den Link-Klick nach einem Wisch
      go(dx < 0 ? 1 : -1);
    }
  };
  const onLinkClick = (e: React.MouseEvent) => {
    if (swipedRef.current) { e.preventDefault(); swipedRef.current = false; }
  };
  const linkProps = (link: string) =>
    linkable && link
      ? { href: link, target: "_blank" as const, rel: "noopener noreferrer", onClick: onLinkClick }
      : {};

  if (!feeds) {
    return <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center p-2" style={{ fontSize: 13, color: fgFaint }}>
      <Rss size={18} className="opacity-60" />{t("Feed-URL(s) im Inspector eintragen")}
    </div>;
  }
  if (error && items.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-red-400/70 text-center p-3" style={{ fontSize: 12 }}>⚠ {t("Feed konnte nicht geladen werden")}</div>;
  }
  if (items.length === 0) {
    return <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 12, color: fgFaint }}>{t("Lade Feed…")}</div>;
  }

  const meta = (it: RssItem) => (
    <div className="flex items-center gap-[0.6em] opacity-60 leading-none" style={{ fontSize: "0.62em" }}>
      {showSource && it.source && <span className="uppercase tracking-wider font-medium truncate max-w-[55%]" style={{ color: accent }}>{it.source}</span>}
      {showDate && relTime(it.date) && <span className="tabular-nums whitespace-nowrap">{relTime(it.date)}</span>}
    </div>
  );

  // ── Einzeln: ein Beitrag, groß, durchgeblendet; wischbar; optional QR ──
  if (mode === "rotate") {
    const it = items[Math.min(shownIdx, items.length - 1)];

    // Aus der gemessenen Kachel: Basis-Schrift, QR-Größe und wie viele
    // Teaser-Zeilen reinpassen — konservativ, damit nichts überläuft.
    const H = box.h || 200;
    const W = box.w || 600;
    const fs = Math.max(13, Math.min(H * 0.13, 30));
    const qrPx = Math.round(Math.min(H * 0.66, W * 0.22, 150));
    const qrOn = showQr && Boolean(it.link) && qrPx >= 60 && W >= 300;
    // Teaser-Zeilen: fester Wert aus Config, sonst aus der Kachelhöhe gemessen.
    const autoDesc = descLinesCfg <= 0;
    const metaH = fs * 0.62 + 6;
    const titleLineH = fs * 1.15 * 1.25;
    const teaserLineH = fs * 0.72 * 1.4;
    const pagerH = items.length > 1 ? fs * 1.4 : 0;
    const titleReserve = (titleLinesCfg > 0 ? titleLinesCfg : 2) * titleLineH;
    const avail = H - metaH - titleReserve - pagerH - fs * 1.2;
    const autoLines = showSummary && it.summary ? Math.max(0, Math.min(Math.floor(avail / teaserLineH), 6)) : 0;
    const summaryLines = autoDesc ? autoLines : (showSummary && it.summary ? descLinesCfg : 0);
    const summaryOn = summaryLines >= 1;
    const titleClamp = titleLinesCfg > 0 ? titleLinesCfg : (summaryOn ? 2 : 3);
    // Passt der gemessene Inhalt in die Spalte → zentrieren, sonst oben pinnen.
    const overflows = fit.content > 0 && fit.col > 0 && fit.content > fit.col + 1;
    const centerContent = !overflows;

    return (
      <div
        ref={boxRef}
        className="w-full h-full flex flex-col overflow-hidden px-[0.2em] select-none"
        style={{ touchAction: "pan-y", fontSize: fs, color: fg }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div className="flex items-center gap-[0.9em] flex-1 min-h-0" style={{ opacity: fadeOut ? 0 : 1, transition: "opacity 0.32s ease" }}>
          {showImage && it.image && (
            <img src={it.image} alt="" className="shrink-0 self-center rounded-[0.5em] object-cover" style={{ width: "3.4em", height: "3.4em", opacity: loadedImgs.has(it.image) ? 1 : 0, transition: "opacity 0.4s ease" }} decoding="async" onLoad={() => markLoaded(it.image)} onError={(e) => ((e.currentTarget.style.display = "none"))} />
          )}
          <div ref={colRef} className={`min-w-0 flex-1 self-stretch flex flex-col overflow-hidden ${centerContent ? "justify-center" : "justify-start"}`}>
            <div ref={contentRef} className="flex flex-col gap-[0.3em]">
              {meta(it)}
              <SmartTitle text={it.title} mode={textOverflow} maxLines={titleClamp} accent={accent} linkable={linkable} link={it.link} onLinkClick={onLinkClick} />
              {summaryOn && (
                <div className="opacity-55 leading-snug" style={{ fontSize: "0.72em", display: "-webkit-box", WebkitLineClamp: summaryLines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {it.summary}
                </div>
              )}
            </div>
          </div>
          {qrOn && (
            <div className="shrink-0 self-center bg-white rounded-[0.5em] flex items-center justify-center" style={{ width: qrPx, height: qrPx, padding: Math.round(qrPx * 0.08) }}>
              <QRCodeSVG value={it.link} size={Math.round(qrPx * 0.84)} level="M" bgColor="#ffffff" fgColor="#000000" />
            </div>
          )}
        </div>
        {items.length > 1 && showDots && (
          <div className="shrink-0 flex gap-[0.35em] mt-[0.5em] mb-[0.1em] justify-center">
            {items.slice(0, Math.min(items.length, 8)).map((_, i) => (
              <span key={i} className="rounded-full transition-all" style={{ width: i === shownIdx % Math.min(items.length, 8) ? "0.5em" : "0.35em", height: "0.35em", backgroundColor: i === shownIdx % Math.min(items.length, 8) ? accent : dotIdle }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Liste: mehrere Schlagzeilen untereinander, scrollbar; optional klickbar ──
  return (
    <div className="w-full h-full overflow-y-auto no-scrollbar" style={{ scrollbarWidth: "none", color: fg }}>
      <div className="flex flex-col">
        {items.map((it, i) => {
          const Wrap: any = linkable && it.link ? "a" : "div";
          return (
            <Wrap
              key={i}
              {...linkProps(it.link)}
              className={`flex items-start gap-[0.7em] py-[0.55em] ${i > 0 ? (isLight ? "border-t border-black/10" : "border-t border-white/10") : ""} ${linkable && it.link ? `cursor-pointer transition-colors ${isLight ? "hover:bg-black/[0.03]" : "hover:bg-white/[0.03]"} rounded-[0.4em] -mx-[0.3em] px-[0.3em]` : ""}`}
              style={{ color: "inherit" }}
            >
              {showImage && it.image && (
                <img src={it.image} alt="" className="shrink-0 rounded-[0.4em] object-cover mt-[0.1em]" style={{ width: "2.6em", height: "2.6em", opacity: loadedImgs.has(it.image) ? 1 : 0, transition: "opacity 0.4s ease" }} decoding="async" onLoad={() => markLoaded(it.image)} onError={(e) => ((e.currentTarget.style.display = "none"))} />
              )}
              <div className="min-w-0 flex-1 flex flex-col gap-[0.2em]">
                <div className="font-medium leading-snug" style={{ fontSize: "0.92em", display: "-webkit-box", WebkitLineClamp: titleLinesCfg > 0 ? titleLinesCfg : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {it.title}
                </div>
                {showSummary && it.summary && (
                  <div className="opacity-50 leading-snug" style={{ fontSize: "0.78em", display: "-webkit-box", WebkitLineClamp: descLinesCfg > 0 ? descLinesCfg : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {it.summary}
                  </div>
                )}
                {meta(it)}
              </div>
            </Wrap>
          );
        })}
      </div>
    </div>
  );
}
