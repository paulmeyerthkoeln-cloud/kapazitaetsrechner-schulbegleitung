import './WochenHeatmap.css'
import type { WochenErgebnis } from '../lib/berechnung'

export function WochenHeatmap({
  wochen,
  onWocheClick,
}: {
  wochen: WochenErgebnis[]
  onWocheClick?: (wochenKey: string) => void
}) {
  return (
    <div className="wochen-heatmap">
      {wochen.map((w) => (
        <button
          key={w.wochenKey}
          className={`wochen-heatmap-zelle ${w.istFerien ? 'ferien' : w.ampel}`}
          title={`${w.wochenKey}: ${Math.round(w.auslastung * 100)}%`}
          onClick={() => onWocheClick?.(w.wochenKey)}
        />
      ))}
    </div>
  )
}
