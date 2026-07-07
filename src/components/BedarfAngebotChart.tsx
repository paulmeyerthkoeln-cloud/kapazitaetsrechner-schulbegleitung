import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatWochenspanne, kwNummer } from '../lib/kalenderwochen'
import type { WochenErgebnis } from '../lib/berechnung'

export function BedarfAngebotChart({ wochen }: { wochen: WochenErgebnis[] }) {
  const chartData = wochen.map((w) => ({
    wochenKey: w.wochenKey,
    Unterrichtszeit: Number(w.einsatzBedarf.toFixed(2)),
    Koordination: Number(w.koordinationBedarf.toFixed(2)),
    Angebot: Number(w.angebot.toFixed(2)),
    'Ferien-Abzug': Number(w.abgezogenesFerienangebot.toFixed(2)),
  }))

  return (
    <div>
      <div className="chart-legende" aria-label="Legende Bedarf und Angebot">
        <span><i style={{ background: '#a5d6a7' }} /> Angebot nach Ferien-Abzug und Umverteilung</span>
        <span><i style={{ background: '#1976d2' }} /> Unterrichtszeit inkl. Vorbereitung/Fahrt</span>
        <span><i style={{ background: '#64b5f6' }} /> Koordination je Termin/KW</span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={chartData} margin={{ bottom: 20 }}>
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
          <Bar dataKey="Angebot" fill="#a5d6a7" />
          <Bar dataKey="Unterrichtszeit" stackId="bedarf" fill="#1976d2" />
          <Bar dataKey="Koordination" stackId="bedarf" fill="#64b5f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
