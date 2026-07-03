import { useAppData } from './state/useAppData'
import { AmpelAntwort } from './components/AmpelAntwort'
import { WochenHeatmap } from './components/WochenHeatmap'
import { BedarfAngebotChart } from './components/BedarfAngebotChart'
import { SchulenTabelle } from './components/SchulenTabelle'
import { PersonenTabelle } from './components/PersonenTabelle'
import { ReihenEditor } from './components/ReihenEditor'
import { EngpassBericht } from './components/EngpassBericht'
import { RestkapazitaetPlanner } from './components/RestkapazitaetPlanner'
import { SzenarioAuswahl } from './components/SzenarioAuswahl'
import { ExportImport } from './components/ExportImport'
import { wendeBesetzungPreset } from './lib/besetzung'

export default function App() {
  const {
    data,
    setPerson,
    setEinheitBegleitung,
    setSchuleKoordination,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    exportJson,
    importJson,
    importError,
  } = useAppData()

  function onPresetApply(reiheId: string, preset: Parameters<typeof wendeBesetzungPreset>[1]) {
    for (const schule of data.schulen) {
      const reihe = schule.reihen.find((r) => r.id === reiheId)
      if (!reihe) continue
      const aktualisiert = wendeBesetzungPreset(reihe.einheiten, preset)
      aktualisiert.forEach((e) => setEinheitBegleitung(reiheId, e.id, e.wir_begleiten))
    }
  }

  return (
    <main style={{ maxWidth: '75rem', margin: '0 auto', padding: '1rem' }}>
      <h1>Kapazitätsrechner Schulbegleitung</h1>
      <SzenarioAuswahl
        szenario={szenario}
        onSzenarioChange={setSzenario}
        sensitivitaet={sensitivitaet}
        onSensitivitaetChange={setSensitivitaet}
      />
      <AmpelAntwort machbarkeit={ergebnis.machbarkeit} />
      <WochenHeatmap wochen={ergebnis.wochen} />
      <BedarfAngebotChart wochen={ergebnis.wochen} settings={data.settings} />
      <EngpassBericht topEngpaesse={ergebnis.machbarkeit.topEngpaesse} />
      <SchulenTabelle schulen={data.schulen} settings={data.settings} onKoordinationChange={setSchuleKoordination} />
      <PersonenTabelle personen={data.personen} onChange={setPerson} />
      {data.schulen.flatMap((schule) =>
        schule.reihen.map((reihe) => (
          <ReihenEditor
            key={reihe.id}
            reihe={reihe}
            onEinheitToggle={(einheitId, wert) => setEinheitBegleitung(reihe.id, einheitId, wert)}
            onPresetApply={(preset) => onPresetApply(reihe.id, preset)}
          />
        ))
      )}
      <RestkapazitaetPlanner data={data} />
      <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} />
    </main>
  )
}
