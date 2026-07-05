import { useAppData } from './state/useAppData'
import { AmpelAntwort } from './components/AmpelAntwort'
import { WochenHeatmap } from './components/WochenHeatmap'
import { BedarfAngebotChart } from './components/BedarfAngebotChart'
import { SchulenAccordion } from './components/SchulenAccordion'
import { PersonenTabelle } from './components/PersonenTabelle'
import { EngpassBericht } from './components/EngpassBericht'
import { ThemenUebersicht } from './components/ThemenUebersicht'
import { RestkapazitaetPlanner } from './components/RestkapazitaetPlanner'
import { KapazitaetsUmverteilung } from './components/KapazitaetsUmverteilung'
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
    setReiheTerminstatus,
    setReiheEinheiten,
    addUmverteilung,
    removeUmverteilung,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    themenUebersicht,
    exportJson,
    importJson,
    importError,
  } = useAppData()

  return (
    <main style={{ maxWidth: '75rem', margin: '0 auto', padding: '1rem' }}>
      <h1>Kapazitätsrechner Schulbegleitung</h1>
      <div className="card">
        <SzenarioAuswahl
          szenario={szenario}
          onSzenarioChange={setSzenario}
          sensitivitaet={sensitivitaet}
          onSensitivitaetChange={setSensitivitaet}
        />
      </div>
      <div className="card">
        <AmpelAntwort machbarkeit={ergebnis.machbarkeit} />
      </div>
      <div className="card">
        <WochenHeatmap wochen={ergebnis.wochen} />
      </div>
      <div className="card">
        <BedarfAngebotChart wochen={ergebnis.wochen} settings={data.settings} />
      </div>
      <div className="card">
        <EngpassBericht topEngpaesse={ergebnis.machbarkeit.topEngpaesse} />
      </div>
      <div className="card">
        <ThemenUebersicht zeilen={themenUebersicht} />
      </div>
      <h2>Schulen</h2>
      <SchulenAccordion
        schulen={data.schulen}
        settings={data.settings}
        onKoordinationChange={setSchuleKoordination}
        onEinheitToggle={setEinheitBegleitung}
        onEinheitAdd={addEinheit}
        onEinheitRemove={removeEinheit}
        onEinheitFelderChange={setEinheitFelder}
        onTerminstatusChange={setReiheTerminstatus}
        onEinheitenReplace={setReiheEinheiten}
        ferien={data.kalender.ferien}
      />
      <div className="card">
        <PersonenTabelle personen={data.personen} onChange={setPerson} />
      </div>
      <div className="card">
        <RestkapazitaetPlanner data={data} />
      </div>
      <div className="card">
        <KapazitaetsUmverteilung
          umverteilungen={data.umverteilungen ?? []}
          ferien={data.kalender.ferien}
          wochen={ergebnis.wochen}
          onAdd={addUmverteilung}
          onRemove={removeUmverteilung}
        />
      </div>
      <div className="card">
        <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} />
      </div>
    </main>
  )
}
