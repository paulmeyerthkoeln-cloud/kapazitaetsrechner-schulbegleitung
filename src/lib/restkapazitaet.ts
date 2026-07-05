import { endOfMonth, format, parseISO } from 'date-fns'
import { berechneWochenuebersicht, berechneMachbarkeit } from './berechnung'
import { wendeBesetzungPreset } from './besetzung'
import { expandiereMuster } from './kalenderwochen'
import type { Datenbestand, Muster, BesetzungsPreset } from './types'

export interface PlatzhalterKonfiguration {
  titel: string
  fahrzeit_h: number
  muster: Omit<Muster, 'von' | 'bis'>
  besetzung: BesetzungsPreset
}

export interface StartmonatErgebnis {
  startmonat: string
  machbar: boolean
}

export function pruefeStartmonate(
  data: Datenbestand,
  konfiguration: PlatzhalterKonfiguration,
  kandidatenMonate: string[]
): StartmonatErgebnis[] {
  return kandidatenMonate.map((startmonat) => {
    const von = parseISO(`${startmonat}-01`)
    const bis = endOfMonth(parseISO(data.settings.planungszeitraum.ende))
    const muster: Muster = { ...konfiguration.muster, von: format(von, 'yyyy-MM-dd'), bis: format(bis, 'yyyy-MM-dd') }
    const einheitenRoh = expandiereMuster(muster, 'schule_x_platzhalter', data.kalender.ferien)
    const einheiten = wendeBesetzungPreset(einheitenRoh, konfiguration.besetzung)

    const schuleX = {
      id: 'schule_x_platzhalter',
      name: konfiguration.titel,
      reihen: [
        {
          id: 'reihe_x_platzhalter',
          titel: konfiguration.titel,
          betreuungsmodell: 'B' as const,
          fahrzeit_h: konfiguration.fahrzeit_h,
          status: 'platzhalter',
          extern_betreut: false, terminstatus: 'festgelegt' as const,
          einheiten,
        },
      ],
    }

    const testData: Datenbestand = { ...data, schulen: [...data.schulen, schuleX] }
    const wochen = berechneWochenuebersicht(testData)
    return { startmonat, machbar: berechneMachbarkeit(wochen).machbar }
  })
}
