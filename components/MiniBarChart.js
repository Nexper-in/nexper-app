"use client";

export default function MiniBarChart({ data, color = "var(--accent)", formatValue }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 400, H = 110, barW = 32, gap = (W - data.length * barW) / (data.length + 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const x = gap + i * (barW + gap);
        const barH = Math.max(4, (d.value / max) * 72);
        const y = 78 - barH;
        return (
          <g key={i}>
            <rect
              x={x} y={y} width={barW} height={barH} rx={6}
              style={{ fill: color, opacity: d.isHighlight ? 1 : 0.35 }}
            />
            {d.value > 0 && (
              <text
                x={x + barW / 2} y={y - 4}
                textAnchor="middle" fontSize={9} fontWeight={600}
                style={{ fill: d.isHighlight ? color : "var(--text-secondary)" }}
              >
                {formatValue ? formatValue(d.value) : d.value}
              </text>
            )}
            <text x={x + barW / 2} y={96} textAnchor="middle" fontSize={10} style={{ fill: "var(--text-secondary)" }}>
              {d.label}
            </text>
            {d.sublabel && (
              <text x={x + barW / 2} y={108} textAnchor="middle" fontSize={9} style={{ fill: "var(--text-secondary)", opacity: 0.75 }}>
                {d.sublabel}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
