import { ReihenEditor } from './ReihenEditor'
import type { BesetzungsPreset, Schule, Settings, Terminstatus, Thema } from '../lib/types'

export function SchuleAkkordionItem({
  schule,
  settings,
  onKoordinationChange,
  onEinheitToggle,
  onPresetApply,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onTermineGenerieren,
}: {
  schule: Schule
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onPresetApply: (reiheId: string, preset: BesetzungsPreset) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onTermineGenerieren: (reiheId: string, startdatum: string, unterrichtszeitH: number, anzahlTermine: number) => void
}) {
  return (
    <details className="schule-akkordion-item">
      <summary>{schule.name}</summary>
      <div className="schule-akkordion-inhalt">
        <label>
          Koordination h/Monat:{' '}
          <input
            type="number"
            step={0.5}
            min={0}
            value={schule.koordination_h_pro_monat ?? settings.koordination_h_pro_schule_pro_monat}
            onChange={(e) => onKoordinationChange(schule.id, Number(e.target.value))}
            style={{ width: '4rem' }}
          />
        </label>
        {schule.reihen.map((reihe) => (
          <div key={reihe.id}>
            <p className="reihe-meta">
              Modell {reihe.betreuungsmodell} · Status: {reihe.status}
            </p>
            <ReihenEditor
              reihe={reihe}
              onEinheitToggle={(einheitId, wert) => onEinheitToggle(reihe.id, einheitId, wert)}
              onPresetApply={(preset) => onPresetApply(reihe.id, preset)}
              onEinheitAdd={() => onEinheitAdd(reihe.id)}
              onEinheitRemove={(einheitId) => onEinheitRemove(reihe.id, einheitId)}
              onEinheitFelderChange={(einheitId, patch) => onEinheitFelderChange(reihe.id, einheitId, patch)}
              onTerminstatusChange={(wert) => onTerminstatusChange(reihe.id, wert)}
              onTermineGenerieren={(startdatum, unterrichtszeitH, anzahlTermine) =>
                onTermineGenerieren(reihe.id, startdatum, unterrichtszeitH, anzahlTermine)
              }
            />
          </div>
        ))}
      </div>
    </details>
  )
}
