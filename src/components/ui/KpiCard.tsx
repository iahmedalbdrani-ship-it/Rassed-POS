// ─── KpiCard — metric tile with sparkline & delta ─────────────
import GlassPanel    from './GlassPanel';
import AnimatedNumber from './AnimatedNumber';
import Sparkline     from './Sparkline';

interface KpiCardProps {
  icon:     string;
  label:    string;
  value:    number;
  sub:      string;
  delta?:   number;
  spark?:   number[];
  accent?:  string;
}

export default function KpiCard({
  icon, label, value, sub, delta, spark, accent = '#f59e0b',
}: KpiCardProps) {
  return (
    <GlassPanel className="p-5 flex flex-col gap-3 group cursor-default" glow={accent}>
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg"
          style={{ background: `${accent}20`, border: `1px solid ${accent}35` }}
        >
          {icon}
        </div>
        {spark && <Sparkline data={spark} color={accent} />}
      </div>

      <div>
        <div className="text-2xl font-semibold text-white tracking-tight">
          <AnimatedNumber value={value} />
        </div>
        <div className="text-[12px] text-slate-400 mt-0.5">{label}</div>
      </div>

      <div className="flex items-center justify-between mt-auto pt-1 border-t border-white/[0.05]">
        <span className="text-[11px] text-slate-600">{sub}</span>
        {delta !== undefined && (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              color:      delta >= 0 ? '#34d399' : '#f87171',
              background: delta >= 0 ? '#34d39915' : '#f8717115',
            }}
          >
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </GlassPanel>
  );
}
