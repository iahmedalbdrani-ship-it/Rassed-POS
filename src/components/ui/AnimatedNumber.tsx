// ─── AnimatedNumber — eased count-up animation ────────────────
import { useState, useEffect, useRef } from 'react';
import { fmt } from '../../constants/theme';

interface AnimatedNumberProps {
  value:     number;
  duration?: number;
  prefix?:   string;
  format?:   (n: number) => string;
}

export default function AnimatedNumber({
  value,
  duration = 1200,
  prefix   = '',
  format   = fmt,
}: AnimatedNumberProps) {
  const [display, setDisplay]     = useState(0);
  const raf                        = useRef<number>(0);
  const startRef                   = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    const step = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const p      = Math.min((ts - startRef.current) / duration, 1);
      const eased  = 1 - Math.pow(1 - p, 4);
      setDisplay(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return <>{prefix}{format(display)}</>;
}
