/**
 * Small accessible charts (single series): bars, a line and a calendar heatmap. Thin marks, rounded data ends
 * anchored to the baseline, recessive axes, a hover/focus tooltip per mark and a visually hidden data table.
 * Text always uses text colours; the chart hue carries identity only.
 */
import { useState } from 'react';
import { formatNumber } from '../lib/platform';

export interface Datum {
  label: string;
  value: number;
  /** Tooltip text (defaults to "label: value"). */
  detail?: string;
}

function DataTable({ caption, data, valueLabel }: { caption: string; data: Datum[]; valueLabel: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{caption}</th>
          <th scope="col">{valueLabel}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}>
            <th scope="row">{d.label}</th>
            <td>{d.detail ?? formatNumber(d.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BarChart({
  data,
  caption,
  valueLabel,
  height = 140,
}: {
  data: Datum[];
  caption: string;
  valueLabel: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="relative">
      <div className="flex items-end gap-1.5" style={{ height }} aria-hidden>
        {data.map((d, i) => {
          const h = d.value ? Math.max(4, (d.value / max) * (height - 24)) : 0;
          return (
            <div
              key={d.label}
              className="relative flex h-full flex-1 flex-col items-center justify-end"
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <span className="mb-1 text-xs font-bold text-muted">
                {d.value ? formatNumber(d.value) : ''}
              </span>
              <div
                className="w-full max-w-9 rounded-t-[4px]"
                style={{
                  height: h,
                  background: 'var(--sn-chart)',
                  opacity: hover === null || hover === i ? 1 : 0.55,
                }}
              />
              {hover === i && (
                <span className="absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-text px-2 py-1 text-xs font-semibold text-bg shadow-card">
                  {d.detail ?? `${d.label}: ${formatNumber(d.value)}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 border-t border-border pt-1" aria-hidden>
        {data.map((d) => (
          <span key={d.label} className="flex-1 truncate text-center text-xs text-muted">
            {d.label}
          </span>
        ))}
      </div>
      <DataTable caption={caption} data={data} valueLabel={valueLabel} />
    </figure>
  );
}

/** Line chart for a 0–1 measure (e.g. accuracy per week). */
export function LineChart({
  data,
  caption,
  valueLabel,
  height = 140,
}: {
  data: Datum[];
  caption: string;
  valueLabel: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 320;
  const pad = 10;
  const x = (i: number) => (data.length <= 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (data.length - 1));
  const y = (v: number) => pad + (1 - Math.min(1, Math.max(0, v))) * (height - 2 * pad);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full overflow-visible" aria-hidden>
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="var(--sn-border)" strokeWidth="1" />
        ))}
        <path
          d={path}
          fill="none"
          stroke="var(--sn-chart)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((d, i) => (
          <g key={d.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <circle cx={x(i)} cy={y(d.value)} r="14" fill="transparent" />
            <circle
              cx={x(i)}
              cy={y(d.value)}
              r="4.5"
              fill="var(--sn-chart)"
              stroke="var(--sn-surface)"
              strokeWidth="2"
            />
          </g>
        ))}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={pad}
            y2={height - pad}
            stroke="var(--sn-text-muted)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
      </svg>
      {hover !== null && (
        <span
          className="absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-text px-2 py-1 text-xs font-semibold text-bg shadow-card"
          style={{ left: `${(x(hover) / w) * 100}%` }}
          aria-hidden
        >
          {data[hover]!.detail ?? data[hover]!.label}
        </span>
      )}
      <div className="flex justify-between text-xs text-muted" aria-hidden>
        <span>{data[0]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </div>
      <DataTable caption={caption} data={data} valueLabel={valueLabel} />
    </figure>
  );
}

/** Calendar heatmap: columns are weeks, rows are weekdays; level 0–4 picks a step of the sequential ramp. */
export function Heatmap({
  cells,
  caption,
  valueLabel,
  legend,
}: {
  cells: Array<{ key: string; level: 0 | 1 | 2 | 3 | 4; detail: string; frozen?: boolean; empty?: boolean }>;
  caption: string;
  valueLabel: string;
  legend: { less: string; more: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const weeks = Math.ceil(cells.length / 7);
  return (
    <figure className="relative">
      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
          gridAutoFlow: 'column',
          gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
        }}
        aria-hidden
      >
        {cells.map((c, i) => (
          <div
            key={c.key}
            className="relative aspect-square rounded-[3px]"
            style={{
              background: c.empty ? 'transparent' : `var(--sn-heat-${c.level})`,
              outline: c.frozen ? '2px solid var(--sn-star)' : undefined,
              outlineOffset: -2,
            }}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </div>
      {hover !== null && !cells[hover]!.empty && (
        <p className="mt-1 text-center text-xs font-semibold" aria-hidden>
          {cells[hover]!.detail}
        </p>
      )}
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted" aria-hidden>
        <span>{legend.less}</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="size-3 rounded-[3px]" style={{ background: `var(--sn-heat-${l})` }} />
        ))}
        <span>{legend.more}</span>
      </div>
      <DataTable
        caption={caption}
        data={cells
          .filter((c) => !c.empty && c.level > 0)
          .map((c) => ({ label: c.key, value: c.level, detail: c.detail }))}
        valueLabel={valueLabel}
      />
    </figure>
  );
}
