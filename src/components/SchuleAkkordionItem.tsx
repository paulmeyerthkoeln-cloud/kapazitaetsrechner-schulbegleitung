import { ReihenEditor } from './ReihenEditor'
import type { Person, Schule, Settings, Terminstatus, Thema } from '../lib/types'

export function SchuleAkkordionItem({
  schule,
  personen,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onTermineGenerieren,
}: {
  schule: Schule
  settings: Settings
  personen: Person[]
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_id?: string | null }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onTermineGenerieren: (reiheId: string, startdatum: string, unterrichtszeitH: number, koordinationszeitH: number, anzahlTermine: number) => void
}) {
  return (
    <details className="schule-akkordion-item">
      <summary>{schule.name}</summary>
      <div className="schule-akkordion-inhalt">
        {schule.reihen.map((reihe) => (
          <div key={reihe.id}>
            <p className="reihe-meta">
              Modell {reihe.betreuungsmodell} · Status: {reihe.status}
            </p>
            <ReihenEditor
              reihe={reihe}
              personen={personen}
              onEinheitToggle={(einheitId, wert) => onEinheitToggle(reihe.id, einheitId, wert)}
              onEinheitAdd={() => onEinheitAdd(reihe.id)}
              onEinheitRemove={(einheitId) => onEinheitRemove(reihe.id, einheitId)}
              onEinheitFelderChange={(einheitId, patch) => onEinheitFelderChange(reihe.id, einheitId, patch)}
              onTerminstatusChange={(wert) => onTerminstatusChange(reihe.id, wert)}
              onTermineGenerieren={(startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine) =>
                onTermineGenerieren(reihe.id, startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine)
              }
            />
          </div>
        ))}
      </div>
    </details>
  )
}
