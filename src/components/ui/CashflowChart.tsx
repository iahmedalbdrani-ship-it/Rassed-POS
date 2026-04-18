// ─── CashflowChart — grouped bar chart ────────────────────────
import { CASHFLOW_DATA } from '../../constants/theme';

interface CashflowChartProps {
  data?: typeof CASHFLOW_DATA;
}

export default function CashflowChart({ data = CASHFLOW_DATA }: CashflowChartProps) {
  const max = Math.max(...data.map(d => Math.max(d.i, d.o)));

  return (
    <div className="flex items-end gap-1.5 h-20 w-full" dir="ltr">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 flex-1 h-full justify-end">
          <div className="w-full flex gap-0.5 items-end h-full">
            <div
              className="flex-1 rounded-t-[3px] transition-all duration-700"
              style={{
                height:     `${(d.i / max) * 100}%`,
                background: 'linear-gradient(180deg,#34d399,#059669)',
              }}
            />
            <div
              className="flex-1 rounded-t-[3px] transition-all duration-700"
              style={{
                height:     `${(d.o / max) * 100}%`,
                background: 'linear-gradient(180deg,#f87171,#dc2626)',
              }}
            />
          </div>
          <span className="text-[7px] text-slate-600 whitespace-nowrap">{d.m}</span>
        </div>
      ))}
    </div>
  );
}
