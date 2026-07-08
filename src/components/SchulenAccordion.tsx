import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { generiereWochentlicheTermine } from '../lib/kalenderwochen'
import type { Einheit, FerienZeitraum, Person, Schule, Settings, Terminstatus, Thema } from '../lib/types'
import './SchulenAccordion.css'

export function SchulenAccordion({
  schulen,
  settings,
  personen,
  ferien,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onEinheitenReplace,
}: {
  schulen: Schule[]
  settings: Settings
  personen: Person[]
  ferien: FerienZeitraum[]
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_id?: string | null }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onEinheitenReplace: (reiheId: string, einheiten: Einheit[]) => void
}) {
  function onTermineGenerieren(reiheId: string, startdatum: string, unterrichtszeitH: number, koordinationszeitH: number, anzahlTermine: number) {
    const einheiten = generiereWochentlicheTermine(reiheId, startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine, ferien)
    onEinheitenReplace(reiheId, einheiten)
  }

  return (
    <div className="schulen-accordion">
      {schulen.map((schule) => (
        <SchuleAkkordionItem
          key={schule.id}
          schule={schule}
          settings={settings}
          personen={personen}
          onEinheitToggle={onEinheitToggle}
          onEinheitAdd={onEinheitAdd}
          onEinheitRemove={onEinheitRemove}
          onEinheitFelderChange={onEinheitFelderChange}
          onTerminstatusChange={onTerminstatusChange}
          onTermineGenerieren={onTermineGenerieren}
        />
      ))}
    </div>
  )
}
