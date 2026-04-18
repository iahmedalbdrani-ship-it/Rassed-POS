// ─── Sparkline — lightweight SVG trend line ───────────────────
interface SparklineProps {
  data:    number[];
  color?:  string;
  width?:  number;
  height?: number;
}

export default function Sparkline({
  data,
  color  = '#f59e0b',
  width  = 100,
  height = 36,
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const max   = Math.max(...data);
  const min   = Math.min(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="opacity-80"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}
