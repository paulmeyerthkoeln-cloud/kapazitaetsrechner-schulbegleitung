import { berechneWochenuebersicht, berechneMachbarkeit } from './berechnung'
import type { WochenErgebnis, Machbarkeitsergebnis } from './berechnung'
import type { Datenbestand } from './types'

export type SzenarioTyp = 'basis' | 'ziel' | 'verstaerkt' | 'sensitivitaet'

export interface SensitivitaetsParameter {
  stundenProPersonUeberschreiben?: number
}

export function berechneSzenario(
  data: Datenbestand,
  typ: SzenarioTyp,
  sensitivitaet?: SensitivitaetsParameter
): { wochen: WochenErgebnis[]; machbarkeit: Machbarkeitsergebnis } {
  const nurBasisPersonen = typ !== 'verstaerkt'
  const personen = data.personen
    .filter((p) => !nurBasisPersonen || !p.szenario_optional)
    .map((p) => ({
      ...p,
      stunden_pro_woche_fuer_begleitung:
        sensitivitaet?.stundenProPersonUeberschreiben ?? p.stunden_pro_woche_fuer_begleitung,
    }))

  const schulen = typ === 'basis' ? data.schulen.filter((s) => s.id !== 'schule_x') : data.schulen

  const szenarioData: Datenbestand = { ...data, personen, schulen }
  const wochen = berechneWochenuebersicht(szenarioData)
  return { wochen, machbarkeit: berechneMachbarkeit(wochen) }
}
