import { useState } from 'react'
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
import { WochenDetailOverlay } from './components/WochenDetailOverlay'
import { berechneWochenDetailsProSchule } from './lib/wochenDetails'

export default function App() {
  const [ausgewaehlteWoche, setAusgewaehlteWoche] = useState<string | null>(null)
  const {
    data,
    ladePhase,
    ladeFehler,
    speicherFehler,
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
      {ladePhase === 'laedt' && <p>Lädt Datenbestand…</p>}
      {ladePhase === 'fehler' && (
        <p role="alert" style={{ color: 'crimson' }}>
          Datenbestand konnte nicht geladen werden: {ladeFehler}
        </p>
      )}
      {ladePhase === 'bereit' && (
        <>
          {speicherFehler && (
            <p role="alert" style={{ color: 'crimson' }}>
              Nicht gespeichert – bitte Internetverbindung prüfen ({speicherFehler})
            </p>
          )}
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
            <WochenHeatmap wochen={ergebnis.wochen} onWocheClick={setAusgewaehlteWoche} />
          </div>
          {ausgewaehlteWoche && (
            <WochenDetailOverlay
              wochenKey={ausgewaehlteWoche}
              details={berechneWochenDetailsProSchule(data, ausgewaehlteWoche)}
              onClose={() => setAusgewaehlteWoche(null)}
            />
          )}
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
        </>
      )}
    </main>
  )
}
