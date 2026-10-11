"use client";
import { useState } from "react";

// กราฟแบบเบา ๆ เขียนด้วย SVG/HTML เอง (ไม่ต้องติดตั้งไลบรารีเพิ่ม)

export const CHART_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b"];

export function fmtBaht(n: number, digits = 0) {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtShort(n: number) {
  const v = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (v >= 1_000_000) return sign + (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + "M";
  if (v >= 1_000) return sign + (v / 1_000).toFixed(v >= 10_000 ? 0 : 1) + "K";
  return sign + Math.round(v).toString();
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

type Series = { name: string; color: string; values: number[] };

/** กราฟแท่ง (หลายชุดได้) + เส้น (ถ้ามี) — ชี้เมาส์/แตะเพื่อดูตัวเลข */
export function BarLineChart({
  labels,
  bars,
  line,
  height = 240,
  format = (n: number) => fmtBaht(n),
}: {
  labels: string[];
  bars: Series[];
  line?: Series;
  height?: number;
  format?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const padL = 44, padR = 8, padT = 12, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const all = [...bars.flatMap((b) => b.values), ...(line?.values ?? [])];
  const maxV = niceMax(Math.max(0, ...all));
  const minV = Math.min(0, ...all);
  const range = maxV - (minV < 0 ? -niceMax(-minV) : 0);
  const lo = maxV - range;
  const y = (v: number) => padT + plotH - ((v - lo) / range) * plotH;
  const n = labels.length || 1;
  const slot = plotW / n;
  const groupW = slot * 0.72;
  const barW = groupW / Math.max(1, bars.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + range * t);
  const labelEvery = Math.ceil(n / 12);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeDasharray={t === 0 ? "" : "3 3"} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#9ca3af">{fmtShort(t)}</text>
          </g>
        ))}
        {labels.map((lb, i) => {
          const x0 = padL + slot * i + (slot - groupW) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill={hover === i ? "#f3f4f6" : "transparent"} />
              {bars.map((b, j) => {
                const v = b.values[i] ?? 0;
                const top = y(Math.max(v, 0));
                const h = Math.abs(y(v) - y(0));
                return <rect key={j} x={x0 + barW * j} y={top} width={Math.max(barW - 2, 1)} height={Math.max(h, v === 0 ? 0 : 1)} rx="2" fill={b.color} opacity={hover === null || hover === i ? 1 : 0.55} />;
              })}
              {i % labelEvery === 0 && (
                <text x={padL + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#6b7280">{lb}</text>
              )}
            </g>
          );
        })}
        {line && (
          <>
            <polyline
              fill="none"
              stroke={line.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              points={line.values.map((v, i) => `${padL + slot * i + slot / 2},${y(v)}`).join(" ")}
              pointerEvents="none"
            />
            {line.values.map((v, i) => (
              <circle key={i} cx={padL + slot * i + slot / 2} cy={y(v)} r={hover === i ? 4.5 : 3} fill="#fff" stroke={line.color} strokeWidth="2" pointerEvents="none" />
            ))}
          </>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border bg-white/95 px-3 py-2 text-xs shadow-lg"
          style={{ left: `${Math.min(Math.max(((padL + slot * hover + slot / 2) / W) * 100, 12), 78)}%`, transform: "translateX(-50%)" }}
        >
          <p className="mb-1 font-semibold text-gray-700">{labels[hover]}</p>
          {bars.map((b) => (
            <p key={b.name} className="flex items-center gap-1.5 text-gray-600">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: b.color }} />
              {b.name}: <span className="font-semibold text-gray-800">{format(b.values[hover] ?? 0)}</span>
            </p>
          ))}
          {line && (
            <p className="flex items-center gap-1.5 text-gray-600">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: line.color }} />
              {line.name}: <span className="font-semibold text-gray-800">{format(line.values[hover] ?? 0)}</span>
            </p>
          )}
        </div>
      )}
      <div className="mt-1 flex flex-wrap justify-center gap-3 text-[11px] text-gray-500">
        {bars.map((b) => (
          <span key={b.name} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />{b.name}</span>
        ))}
        {line && <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3" style={{ background: line.color }} />{line.name}</span>}
      </div>
    </div>
  );
}

/** กราฟโดนัท + คำอธิบาย */
export function DonutChart({
  items,
  format = (n: number) => fmtBaht(n),
  centerLabel = "รวม",
}: {
  items: { label: string; value: number }[];
  format?: (n: number) => string;
  centerLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = items.filter((i) => i.value > 0).slice(0, 7);
  const rest = items.filter((i) => i.value > 0).slice(7).reduce((t, i) => t + i.value, 0);
  const data = rest > 0 ? [...top, { label: "อื่นๆ", value: rest }] : top;
  const total = data.reduce((t, i) => t + i.value, 0);
  const R = 70, r = 44, C = 90;
  let acc = 0;
  const arcs = data.map((d, i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += d.value;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    const path = data.length === 1
      ? `M ${C - R},${C} A ${R},${R} 0 1 1 ${C + R},${C} A ${R},${R} 0 1 1 ${C - R},${C} M ${C - r},${C} A ${r},${r} 0 1 0 ${C + r},${C} A ${r},${r} 0 1 0 ${C - r},${C} Z`
      : `M ${p(R, a0)} A ${R},${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r},${r} 0 ${large} 0 ${p(r, a0)} Z`;
    return { path, color: CHART_COLORS[i % CHART_COLORS.length], ...d };
  });
  if (total <= 0) return <p className="py-10 text-center text-sm text-gray-400">ยังไม่มีข้อมูล</p>;
  const h = hover !== null ? arcs[hover] : null;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" onMouseLeave={() => setHover(null)}>
        {arcs.map((a, i) => (
          <path key={i} d={a.path} fill={a.color} fillRule="evenodd" opacity={hover === null || hover === i ? 1 : 0.4}
            onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: "pointer" }} />
        ))}
        <text x={C} y={C - 4} textAnchor="middle" fontSize="10" fill="#6b7280">{h ? h.label.slice(0, 14) : centerLabel}</text>
        <text x={C} y={C + 12} textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">{fmtShort(h ? h.value : total)}</text>
      </svg>
      <div className="w-full space-y-1.5 text-xs">
        {arcs.map((a, i) => (
          <div key={i} className={`flex items-center gap-2 rounded px-1 ${hover === i ? "bg-gray-50" : ""}`} onMouseEnter={() => setHover(i)}>
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: a.color }} />
            <span className="flex-1 truncate text-gray-600">{a.label}</span>
            <span className="font-semibold text-gray-800">{format(a.value)}</span>
            <span className="w-10 text-right text-gray-400">{((a.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** แถบแนวนอน (อันดับ) */
export function HBarList({
  items,
  color = CHART_COLORS[0],
  format = (n: number) => fmtBaht(n),
}: {
  items: { label: string; value: number; sub?: string }[];
  color?: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="py-10 text-center text-sm text-gray-400">ยังไม่มีข้อมูล</p>;
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-gray-700">{it.label}</span>
            <span className="shrink-0 font-semibold text-gray-800">
              {format(it.value)}
              {it.sub && <span className="ml-1 font-normal text-gray-400">{it.sub}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full" style={{ width: `${Math.max((it.value / max) * 100, it.value > 0 ? 2 : 0)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** แถบเปอร์เซ็นต์แบบวงกลม (เกจ) */
export function Gauge({ value, label, color = CHART_COLORS[1] }: { value: number; label: string; color?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const R = 34, c = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 90 90" className="h-20 w-20">
        <circle cx="45" cy="45" r={R} fill="none" stroke="#e5e7eb" strokeWidth="9" />
        <circle cx="45" cy="45" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 45 45)" />
        <text x="45" y="50" textAnchor="middle" fontSize="15" fontWeight="700" fill="#111827">{v.toFixed(0)}%</text>
      </svg>
      <p className="mt-1 text-center text-[11px] text-gray-500">{label}</p>
    </div>
  );
}
