// ─── StatusBadge — colored dot + label chip ───────────────────
import { STATUS_META } from '../../constants/theme';

interface StatusBadgeProps {
  status: string;
  size?:  'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META['DRAFT'];
  const px   = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${px}`}
      style={{ color: meta.text, background: `${meta.dot}15` }}
    >
      <span
        className="rounded-full flex-shrink-0"
        style={{
          width:      size === 'sm' ? 5 : 6,
          height:     size === 'sm' ? 5 : 6,
          background: meta.dot,
        }}
      />
      {meta.label}
    </span>
  );
}
