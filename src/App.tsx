import { useAppData } from './state/useAppData'
import { AmpelAntwort } from './components/AmpelAntwort'
import { WochenHeatmap } from './components/WochenHeatmap'
import { BedarfAngebotChart } from './components/BedarfAngebotChart'
import { SchulenAccordion } from './components/SchulenAccordion'
import { PersonenTabelle } from './components/PersonenTabelle'
import { PersonenKapazitaetsUebersicht } from './components/PersonenKapazitaetsUebersicht'
import { EngpassBericht } from './components/EngpassBericht'
import { ThemenUebersicht } from './components/ThemenUebersicht'
import { VeranstaltungenUebersicht } from './components/VeranstaltungenUebersicht'
import { PersonenUmverteilung } from './components/PersonenUmverteilung'
import { ExportImport } from './components/ExportImport'

export default function App() {
  const {
    data,
    setPerson,
    addPerson,
    removePerson,
    setPersonUrlaub,
    setEinheitBegleitung,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    addReihe,
    removeReihe,
    setReiheTitel,
    setReiheTerminstatus,
    setReiheEinheiten,
    addVeranstaltung,
    removeVeranstaltung,
    setVeranstaltungTitel,
    setVeranstaltungTerminstatus,
    setVeranstaltungSchulen,
    addVeranstaltungTermin,
    removeVeranstaltungTermin,
    setVeranstaltungTerminFelder,
    setSchulBesetzungFelder,
    addPersonenUmverteilung,
    removePersonenUmverteilung,
    ergebnis,
    themenGanttZeilen,
    personenKapazitaet,
    exportJson,
    importJson,
    importError,
    zuruecksetzen,
  } = useAppData()

  return (
    <main style={{ maxWidth: '75rem', margin: '0 auto', padding: '1rem' }}>
      <h1>Kapazitätsrechner Schulbegleitung</h1>
      <div className="card">
        <PersonenTabelle
          personen={data.personen}
          onChange={setPerson}
          onAdd={addPerson}
          onRemove={removePerson}
          onUrlaubChange={setPersonUrlaub}
        />
      </div>
      <div className="card">
        <PersonenKapazitaetsUebersicht personenKapazitaet={personenKapazitaet} />
      </div>
      <div className="card">
        <AmpelAntwort machbarkeit={ergebnis.machbarkeit} />
      </div>
      <div className="card">
        <WochenHeatmap wochen={ergebnis.wochen} />
      </div>
      <div className="card">
        <BedarfAngebotChart wochen={ergebnis.wochen} />
      </div>
      <div className="card">
        <EngpassBericht topEngpaesse={ergebnis.machbarkeit.topEngpaesse} />
      </div>
      <div className="card">
        <ThemenUebersicht zeilen={themenGanttZeilen} wochen={ergebnis.wochen} />
      </div>
      <h2>Schulen</h2>
      <SchulenAccordion
        schulen={data.schulen}
        settings={data.settings}
        personen={data.personen}
        onEinheitToggle={setEinheitBegleitung}
        onEinheitAdd={addEinheit}
        onEinheitRemove={removeEinheit}
        onEinheitFelderChange={setEinheitFelder}
        onTerminstatusChange={setReiheTerminstatus}
        onEinheitenReplace={setReiheEinheiten}
        onReiheAdd={addReihe}
        onReiheRemove={removeReihe}
        onReiheTitelChange={setReiheTitel}
        onVeranstaltungAdd={addVeranstaltung}
        ferien={data.kalender.ferien}
      />
      <div className="card">
        <VeranstaltungenUebersicht
          veranstaltungen={data.veranstaltungen}
          schulen={data.schulen}
          personen={data.personen}
          onAdd={addVeranstaltung}
          onRemove={removeVeranstaltung}
          onTitelChange={setVeranstaltungTitel}
          onTerminstatusChange={setVeranstaltungTerminstatus}
          onSchulenChange={setVeranstaltungSchulen}
          onTerminAdd={addVeranstaltungTermin}
          onTerminRemove={removeVeranstaltungTermin}
          onTerminFelderChange={setVeranstaltungTerminFelder}
          onBesetzungFelderChange={setSchulBesetzungFelder}
        />
      </div>
      <div className="card">
        <PersonenUmverteilung
          personen={data.personen}
          personenKapazitaet={personenKapazitaet}
          personenUmverteilungen={data.personenUmverteilungen ?? []}
          onAdd={addPersonenUmverteilung}
          onRemove={removePersonenUmverteilung}
        />
      </div>
      <div className="card">
        <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} zuruecksetzen={zuruecksetzen} />
      </div>
    </main>
  )
}
