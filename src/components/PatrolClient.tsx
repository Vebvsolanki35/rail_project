"use client";

/**
 * RAKSHAK PATROL — the gangman's handset (login-free).
 *
 * Designed for one hand, bright sunlight and no typing: tap a category, confirm
 * the section, attach the GPS/photograph, submit. The defect is created at stage
 * REPORTED and the screen immediately answers what happens next and who is
 * responsible — plus any recurrence or duplicate warning from the server.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, Crosshair, Loader2, Send, ShieldAlert } from "lucide-react";
import { PATROL_CATEGORIES, defaultDueDays } from "@/lib/engine/patrolCatalog";

interface SectionOption {
  id: number;
  code: string;
  corridor: string;
  dailyTrains: number;
}

interface ReportResult {
  defectId: number;
  defectCode: string;
  segmentCode: string;
  title: string;
  department: string;
  severity: number;
  dueInDays: number;
  stageLabel: string;
  happening: string;
  next: string;
  responsible: string;
  urgencyClass: string;
  recurrence: { occurrences: number; band: string; escalated: boolean };
  possibleDuplicate: { id: number; defectCode: string; title: string; ageDays: number } | null;
  message: string;
}

export default function PatrolClient({ sections }: { sections: SectionOption[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [segmentId, setSegmentId] = useState<number | null>(sections[0]?.id ?? null);
  const [severity, setSeverity] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [workerMobile, setWorkerMobile] = useState("");
  const [gps, setGps] = useState<string>("");
  const [photo, setPhoto] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);

  const meta = PATROL_CATEGORIES.find((c) => c.key === category) ?? null;
  const effectiveSeverity = severity ?? meta?.severity ?? 6;
  const section = sections.find((s) => s.id === segmentId) ?? null;

  /** Best-effort GPS fix; the form still works without it (device may deny). */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`),
      () => setGps("unavailable"),
      { timeout: 4000 }
    );
  }, []);

  async function submit() {
    if (!category) {
      setError("Choose the type of defect first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/defects/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          segmentId,
          severity: effectiveSeverity,
          note: note || undefined,
          gps: gps || undefined,
          photo: photo || undefined,
          reporterName: workerName || undefined,
          reporterMobile: workerMobile || undefined,
          needsPowerBlock: meta?.department === "TRD",
        }),
      });
      const json = (await res.json()) as ReportResult & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not register the report");
        return;
      }
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setCategory(null);
    setSeverity(null);
    setNote("");
    setPhoto("");
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <div className="anim-rise rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 size={18} />
            <h2 className="text-sm font-bold">Report registered</h2>
          </div>
          <p className="mt-2 font-mono text-lg font-semibold text-amber-400">{result.defectCode}</p>
          <p className="text-[12px] text-ink">{result.title}</p>
          <p className="mt-1 text-[11px] text-dim">
            {result.segmentCode} · {result.department} · severity {result.severity}/10 · {defaultDueDays(result.severity)}-day deadline policy
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-edge/70 bg-hull/40 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-faint">What&apos;s happening</p>
              <p className="mt-1 text-[11px] text-ink">{result.happening}</p>
            </div>
            <div className="rounded-xl border border-edge/70 bg-hull/40 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-faint">What&apos;s next</p>
              <p className="mt-1 text-[11px] text-ink">{result.next}</p>
            </div>
            <div className="rounded-xl border border-edge/70 bg-hull/40 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-faint">Responsible</p>
              <p className="mt-1 text-[11px] text-ink">{result.responsible}</p>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-dim">{result.message}</p>

          {result.recurrence.band !== "NONE" && (
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Recurrence {result.recurrence.band}: {result.recurrence.occurrences} similar {result.department} defects on this asset in
              the last 180 days (rule-based detection){result.recurrence.escalated ? " — priority escalated to HIGH" : ""}.
            </p>
          )}

          {result.possibleDuplicate && (
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 p-2.5 text-[11px] text-orange-200">
              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
              Possible duplicate of {result.possibleDuplicate.defectCode} ({result.possibleDuplicate.ageDays} d old): {result.possibleDuplicate.title}.
              The inspector will confirm during review.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={reset} className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-xs font-bold text-slate-950 transition hover:bg-amber-400">
            Report another defect
          </button>
          <Link href="/" className="rounded-xl border border-edge px-4 py-3 text-xs font-semibold text-dim transition hover:text-ink">
            Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-3">
      {/* Worker identity (optional — the handset is login-free) */}
      <div className="rounded-2xl border border-edge/70 bg-panel/50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-faint">Reporting karmi (optional)</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <input
            value={workerName}
            onChange={(e) => setWorkerName(e.target.value)}
            placeholder="Name"
            className="rounded-lg border border-edge bg-hull/50 px-2 py-2 text-[12px] text-ink outline-none"
          />
          <input
            value={workerMobile}
            onChange={(e) => setWorkerMobile(e.target.value)}
            placeholder="Mobile"
            inputMode="numeric"
            className="rounded-lg border border-edge bg-hull/50 px-2 py-2 text-[12px] text-ink outline-none"
          />
        </div>
      </div>

      {/* Category tiles */}
      <div className="rounded-2xl border border-edge/70 bg-panel/50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-faint">1 · What did you find?</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PATROL_CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                setCategory(c.key);
                setSeverity(null);
              }}
              className={`rounded-xl border p-2.5 text-left transition ${
                category === c.key ? "border-amber-500 bg-amber-500/15" : "border-edge bg-hull/40 hover:border-edge/80"
              }`}
            >
              <span className="text-base">{c.icon}</span>
              <p className="mt-0.5 text-[11px] font-semibold leading-tight text-ink">{c.label}</p>
              <p className="text-[10px] text-faint">{c.department} · {c.durationMin} min</p>
            </button>
          ))}
        </div>
        {meta && <p className="mt-2 text-[10px] text-dim">{meta.hint}</p>}
      </div>

      {/* Section + severity */}
      <div className="rounded-2xl border border-edge/70 bg-panel/50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-faint">2 · Where and how bad?</p>
        <select
          value={segmentId ?? ""}
          onChange={(e) => setSegmentId(Number(e.target.value))}
          className="mt-2 w-full rounded-lg border border-edge bg-hull/50 px-2 py-2 text-[12px] text-ink outline-none"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.corridor} ({s.dailyTrains} trains/day)
            </option>
          ))}
        </select>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-faint">
            <span>Severity</span>
            <span className="font-mono text-ink">{effectiveSeverity}/10 · deadline policy {defaultDueDays(effectiveSeverity)} d</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={effectiveSeverity}
            onChange={(e) => setSeverity(Number(e.target.value))}
            className="mt-1.5 w-full accent-amber-500"
          />
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Note for the inspector (optional)"
          className="mt-3 w-full rounded-lg border border-edge bg-hull/50 px-2 py-2 text-[12px] text-ink outline-none"
        />
      </div>

      {/* Evidence */}
      <div className="rounded-2xl border border-edge/70 bg-panel/50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-faint">3 · Evidence</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-dim">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-hull/40 px-2 py-1.5">
            <Crosshair size={12} className={gps && gps !== "unavailable" ? "text-emerald-400" : "text-faint"} />
            {gps || "locating…"}
          </span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-edge bg-hull/40 px-2 py-1.5">
            <Camera size={12} className={photo ? "text-emerald-400" : "text-faint"} />
            {photo ? "photo attached" : "attach photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setPhoto(String(reader.result).slice(0, 400));
                reader.readAsDataURL(file);
              }}
            />
          </label>
          {section && <span className="text-[10px] text-faint">{section.code} selected</span>}
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-2.5 text-[11px] text-red-200">{error}</p>}

      <button
        onClick={submit}
        disabled={busy || !category}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-4 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {busy ? "Registering…" : "Submit patrol report"}
      </button>

      <p className="text-center text-[10px] leading-relaxed text-faint">
        The handset needs no login. The report enters the Smart Defect Lifecycle at REPORTED with a permanent
        DEF-&lt;SECTION&gt;-&lt;YEAR&gt;-&lt;SEQ&gt; identity and is picked up by the section inspector&apos;s queue.
      </p>
    </div>
  );
}
