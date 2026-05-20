import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

type Props = {
  data: number[];
  width?: number;
  height?: number;
  color: string;
  /** Rellena el área bajo la línea con un degradado suave. */
  fill?: boolean;
  /** Dibuja un punto en el último valor. */
  showLastDot?: boolean;
  strokeWidth?: number;
};

// Curva suavizada (Catmull-Rom → Bézier) para un look fintech.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export const Sparkline: React.FC<Props> = ({
  data,
  width = 100,
  height = 36,
  color,
  fill = true,
  showLastDot = true,
  strokeWidth = 2,
}) => {
  if (!data || data.length < 2) return null;

  const pad = strokeWidth + 1;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (data.length - 1);

  const points = data.map((v, i) => ({
    x: pad + i * stepX,
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }));

  const line = smoothPath(points);
  const area = fill
    ? `${line} L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`
    : '';
  const last = points[points.length - 1];
  const gid = `spark-${color.replace('#', '')}`;

  return (
    <Svg width={width} height={height}>
      {fill && (
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.25} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
      )}
      {fill && <Path d={area} fill={`url(#${gid})`} />}
      <Path d={line} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
      {showLastDot && <Circle cx={last.x} cy={last.y} r={strokeWidth + 1} fill={color} />}
    </Svg>
  );
};
