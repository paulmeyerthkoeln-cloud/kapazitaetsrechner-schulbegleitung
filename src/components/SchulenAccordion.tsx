import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { wendeBesetzungPreset } from '../lib/besetzung'
import { generiereWochentlicheTermine } from '../lib/kalenderwochen'
import type { BesetzungsPreset, Einheit, FerienZeitraum, Schule, Settings, Terminstatus, Thema } from '../lib/types'
import './SchulenAccordion.css'

export function SchulenAccordion({
  schulen,
  settings,
  ferien,
  onKoordinationChange,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onEinheitenReplace,
}: {
  schulen: Schule[]
  settings: Settings
  ferien: FerienZeitraum[]
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onEinheitenReplace: (reiheId: string, einheiten: Einheit[]) => void
}) {
  function onPresetApply(reiheId: string, preset: BesetzungsPreset) {
    for (const schule of schulen) {
      const reihe = schule.reihen.find((r) => r.id === reiheId)
      if (!reihe) continue
      const aktualisiert = wendeBesetzungPreset(reihe.einheiten, preset)
      aktualisiert.forEach((e) => onEinheitToggle(reiheId, e.id, e.wir_begleiten))
    }
  }

  function onTermineGenerieren(reiheId: string, startdatum: string, unterrichtszeitH: number, anzahlTermine: number) {
    const einheiten = generiereWochentlicheTermine(reiheId, startdatum, unterrichtszeitH, anzahlTermine, ferien)
    onEinheitenReplace(reiheId, einheiten)
  }

  return (
    <div className="schulen-accordion">
      {schulen.map((schule) => (
        <SchuleAkkordionItem
          key={schule.id}
          schule={schule}
          settings={settings}
          onKoordinationChange={onKoordinationChange}
          onEinheitToggle={onEinheitToggle}
          onPresetApply={onPresetApply}
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
