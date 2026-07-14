import { Bar, BarChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatWochenspanne, kwNummer } from '../lib/kalenderwochen'
import { berechneFerienBaender } from '../lib/themenUebersicht'
import type { WochenErgebnis } from '../lib/berechnung'

export function BedarfAngebotChart({
  wochen,
  onWocheClick,
}: {
  wochen: WochenErgebnis[]
  onWocheClick?: (wochenKey: string) => void
}) {
  const chartData = wochen.map((w) => ({
    wochenKey: w.wochenKey,
    Unterrichtszeit: Number(w.einsatzBedarf.toFixed(2)),
    Koordination: Number(w.koordinationBedarf.toFixed(2)),
    Angebot: Number(w.angebot.toFixed(2)),
  }))
  const ferienBaender = berechneFerienBaender(wochen)

  return (
    <div>
      <div className="chart-legende" aria-label="Legende Bedarf und Angebot">
        <span><i style={{ background: '#a5d6a7' }} /> Angebot (Personen-Kapazität)</span>
        <span><i style={{ background: '#1976d2' }} /> Unterrichtszeit</span>
        <span><i style={{ background: '#64b5f6' }} /> Koordination je Termin/KW</span>
        <span><i style={{ background: '#cccccc' }} /> Ferien</span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart
          data={chartData}
          margin={{ bottom: 20 }}
          onClick={(state) => {
            if (typeof state?.activeLabel === 'string') onWocheClick?.(state.activeLabel)
          }}
          style={{ cursor: onWocheClick ? 'pointer' : undefined }}
        >
          <XAxis
            dataKey="wochenKey"
            tickFormatter={kwNummer}
            angle={-45}
            textAnchor="end"
            height={50}
            interval={0}
            tick={{ fontSize: 11 }}
          />
          <YAxis />
          <Tooltip labelFormatter={(label) => formatWochenspanne(String(label))} />
          {ferienBaender.map((band) => (
            <ReferenceArea
              key={`${band.name}-${band.startWochenKey}`}
              x1={band.startWochenKey}
              x2={band.endWochenKey}
              fill="#cccccc"
              fillOpacity={0.3}
              ifOverflow="visible"
              label={{ value: band.name, position: 'insideTop', fontSize: 10, fill: '#666' }}
            />
          ))}
          <Bar dataKey="Angebot" fill="#a5d6a7" />
          <Bar dataKey="Unterrichtszeit" stackId="bedarf" fill="#1976d2" />
          <Bar dataKey="Koordination" stackId="bedarf" fill="#64b5f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
