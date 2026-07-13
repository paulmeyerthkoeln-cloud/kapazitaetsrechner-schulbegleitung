export function ExportImport({
  exportJson,
  importJson,
  importError,
  zuruecksetzen,
}: {
  exportJson: () => string
  importJson: (json: string) => void
  importError: string | null
  zuruecksetzen: () => void
}) {
  function herunterladen() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kapazitaetsrechner-daten.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function hochladen(event: React.ChangeEvent<HTMLInputElement>) {
    const datei = event.target.files?.[0]
    if (!datei) return
    const reader = new FileReader()
    reader.onload = () => importJson(reader.result as string)
    reader.readAsText(datei)
  }

  function aufZuruecksetzenKlicken() {
    if (window.confirm('Datenbestand für alle im Team auf die Ausgangsdaten zurücksetzen? Nicht exportierte Änderungen gehen verloren.')) {
      zuruecksetzen()
    }
  }

  return (
    <div>
      <button onClick={herunterladen}>Als JSON exportieren</button>
      <input type="file" accept="application/json" onChange={hochladen} />
      <button onClick={aufZuruecksetzenKlicken}>Zurücksetzen auf Ausgangsdaten</button>
      {importError && <p role="alert" style={{ color: 'crimson' }}>{importError}</p>}
    </div>
  )
}
