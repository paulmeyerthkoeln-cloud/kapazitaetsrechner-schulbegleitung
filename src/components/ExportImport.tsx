export function ExportImport({
  exportJson,
  importJson,
  importError,
}: {
  exportJson: () => string
  importJson: (json: string) => void
  importError: string | null
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

  return (
    <div>
      <button onClick={herunterladen}>Als JSON exportieren</button>
      <input type="file" accept="application/json" onChange={hochladen} />
      {importError && <p role="alert" style={{ color: 'crimson' }}>{importError}</p>}
    </div>
  )
}
