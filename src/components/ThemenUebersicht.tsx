import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatWochenspanne } from '../lib/kalenderwochen'
import type { ThemenZeile } from '../lib/themenUebersicht'
import type { Thema } from '../lib/types'

const ALLE_THEMEN: (Thema | 'Ohne Thema')[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie', 'Ohne Thema']

const THEMEN_FARBEN: Record<Thema | 'Ohne Thema', string> = {
  Ernährung: '#e07a5f',
  Stadtgrün: '#3d9970',
  Mobilität: '#4a7fbf',
  Energie: '#e6b800',
  'Ohne Thema': '#9e9e9e',
}

export function ThemenUebersicht({ zeilen }: { zeilen: ThemenZeile[] }) {
  if (zeilen.length === 0) {
    return (
      <div>
        <h3>Themen-Übersicht</h3>
        <p>Keine Einheiten mit Terminstatus ungleich „offen“ vorhanden.</p>
      </div>
    )
  }

  const wochenKeys = Array.from(new Set(zeilen.map((z) => z.wochenKey))).sort()
  const chartData = wochenKeys.map((wochenKey) => {
    const eintrag: Record<string, number | string> = { wochenspanne: formatWochenspanne(wochenKey) }
    for (const thema of ALLE_THEMEN) {
      eintrag[thema] = zeilen
        .filter((z) => z.wochenKey === wochenKey && z.thema === thema)
        .reduce((summe, z) => summe + z.stunden, 0)
    }
    return eintrag
  })
  const chartBreite = Math.max(600, wochenKeys.length * 60)

  return (
    <div>
      <h3>Themen-Übersicht</h3>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ width: `${chartBreite}px`, height: '20rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="wochenspanne" angle={-45} textAnchor="end" height={70} interval={0} />
              <YAxis label={{ value: 'Stunden', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              {ALLE_THEMEN.map((thema) => (
                <Bar key={thema} dataKey={thema} stackId="themen" fill={THEMEN_FARBEN[thema]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Woche</th>
            <th>Schule</th>
            <th>Thema</th>
            <th>Stunden</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={`${z.wochenKey}__${z.schule}__${z.thema}`}>
              <td>{formatWochenspanne(z.wochenKey)}</td>
              <td>{z.schule}</td>
              <td>{z.thema}</td>
              <td>{Math.round(z.stunden * 10) / 10}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
