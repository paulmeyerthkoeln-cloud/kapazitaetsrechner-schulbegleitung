import './WochenHeatmap.css'
import { formatWochenspanne, kwNummer } from '../lib/kalenderwochen'
import type { WochenErgebnis } from '../lib/berechnung'

export function WochenHeatmap({
  wochen,
  onWocheClick,
}: {
  wochen: WochenErgebnis[]
  onWocheClick?: (wochenKey: string) => void
}) {
  return (
    <div>
      <div className="wochen-heatmap-legende" aria-label="Legende Kapazitätsampel">
        <span><i className="wochen-legende-farbe gruen" /> Grün: unkritisch</span>
        <span><i className="wochen-legende-farbe gelb" /> Gelb: Warnung</span>
        <span><i className="wochen-legende-farbe rot" /> Rot: Problemwoche</span>
        <span><i className="wochen-legende-farbe ferien" /> Ferien</span>
      </div>
      <div className="wochen-heatmap">
        {wochen.map((w) => (
          <div className="wochen-heatmap-zelle-wrapper" key={w.wochenKey}>
            <button
              className={`wochen-heatmap-zelle ${w.istFerien ? 'ferien' : w.ampel}`}
              title={
                w.istFerien
                  ? `Ferien: ${w.ferienName}`
                  : `${formatWochenspanne(w.wochenKey)}: ${Math.round(w.auslastung * 100)}% Auslastung, ${Math.round(w.bedarf * 10) / 10}h Bedarf bei ${Math.round(w.angebot * 10) / 10}h Angebot`
              }
              aria-label={
                w.istFerien
                  ? `${formatWochenspanne(w.wochenKey)} Ferien ${w.ferienName}`
                  : `${formatWochenspanne(w.wochenKey)} ${w.ampel}, ${Math.round(w.auslastung * 100)} Prozent Auslastung`
              }
              onClick={() => onWocheClick?.(w.wochenKey)}
            />
            <span className="wochen-heatmap-kw">{kwNummer(w.wochenKey)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
