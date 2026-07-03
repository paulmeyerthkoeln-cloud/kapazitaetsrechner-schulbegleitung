import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { WochenErgebnis } from '../lib/berechnung'
import type { Settings } from '../lib/types'

export function BedarfAngebotChart({ wochen, settings }: { wochen: WochenErgebnis[]; settings: Settings }) {
  const chartData = wochen.map((w) => ({
    wochenKey: w.wochenKey,
    Einsatz: Number(w.einsatzBedarf.toFixed(2)),
    Koordination: Number(w.koordinationBedarf.toFixed(2)),
    Angebot: Number(w.angebot.toFixed(2)),
    Warnschwelle: Number((w.angebot * settings.schwellwert_warnung).toFixed(2)),
    Kritischeschwelle: Number((w.angebot * settings.schwellwert_kritisch).toFixed(2)),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <XAxis dataKey="wochenKey" hide />
        <YAxis />
        <Tooltip />
        <Bar dataKey="Angebot" fill="#a5d6a7" />
        <Bar dataKey="Einsatz" stackId="bedarf" fill="#1976d2" />
        <Bar dataKey="Koordination" stackId="bedarf" fill="#64b5f6" />
      </BarChart>
    </ResponsiveContainer>
  )
}
