import { useAppData } from './state/useAppData'
import { AmpelAntwort } from './components/AmpelAntwort'
import { WochenHeatmap } from './components/WochenHeatmap'
import { BedarfAngebotChart } from './components/BedarfAngebotChart'
import { SchulenAccordion } from './components/SchulenAccordion'
import { PersonenTabelle } from './components/PersonenTabelle'
import { EngpassBericht } from './components/EngpassBericht'
import { RestkapazitaetPlanner } from './components/RestkapazitaetPlanner'
import { SzenarioAuswahl } from './components/SzenarioAuswahl'
import { ExportImport } from './components/ExportImport'

export default function App() {
  const {
    data,
    setPerson,
    setEinheitBegleitung,
    setSchuleKoordination,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    exportJson,
    importJson,
    importError,
  } = useAppData()

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
      <SchulenAccordion
        schulen={data.schulen}
        settings={data.settings}
        onKoordinationChange={setSchuleKoordination}
        onEinheitToggle={setEinheitBegleitung}
        onEinheitAdd={addEinheit}
        onEinheitRemove={removeEinheit}
        onEinheitFelderChange={setEinheitFelder}
      />
      <PersonenTabelle personen={data.personen} onChange={setPerson} />
      <RestkapazitaetPlanner data={data} />
      <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} />
    </main>
  )
}
