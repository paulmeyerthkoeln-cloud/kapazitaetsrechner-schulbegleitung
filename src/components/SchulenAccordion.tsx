import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { wendeBesetzungPreset } from '../lib/besetzung'
import type { BesetzungsPreset, Schule, Settings, Thema } from '../lib/types'
import './SchulenAccordion.css'

export function SchulenAccordion({
  schulen,
  settings,
  onKoordinationChange,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
}: {
  schulen: Schule[]
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
}) {
  function onPresetApply(reiheId: string, preset: BesetzungsPreset) {
    for (const schule of schulen) {
      const reihe = schule.reihen.find((r) => r.id === reiheId)
      if (!reihe) continue
      const aktualisiert = wendeBesetzungPreset(reihe.einheiten, preset)
      aktualisiert.forEach((e) => onEinheitToggle(reiheId, e.id, e.wir_begleiten))
    }
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
        />
      ))}
    </div>
  )
}
