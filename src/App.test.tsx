import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import seedData from './data/data.json'

const { selectSingleMock, updateMock } = vi.hoisted(() => {
  const selectSingleImpl = (): Promise<{ data: { data: unknown } | null; error: { message: string } | null }> =>
    Promise.resolve({ data: { data: seedData }, error: null })
  const updateImpl = (): { eq: () => Promise<{ error: { message: string } | null }> } => ({
    eq: () => Promise.resolve({ error: null }),
  })
  return {
    selectSingleMock: vi.fn(selectSingleImpl),
    updateMock: vi.fn(updateImpl),
  }
})

vi.mock('./lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: selectSingleMock }) }),
      update: updateMock,
    }),
  },
}))

import App from './App'

describe('App', () => {
  beforeEach(() => {
    selectSingleMock.mockClear()
    updateMock.mockClear()
  })

  it('renders the Ampel-Antwort and Wochen-Heatmap once the Datenbestand has loaded', async () => {
    render(<App />)
    expect(await screen.findByText(/MACHBAR|KRITISCH|NICHT MACHBAR/)).toBeInTheDocument()
  })

  it('shows a loading message before the Datenbestand has loaded', () => {
    render(<App />)
    expect(screen.getByText(/Lädt Datenbestand/i)).toBeInTheDocument()
  })

  it('shows an error message when loading the Datenbestand fails', async () => {
    selectSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'Netzwerkfehler' } })
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Netzwerkfehler')
  })

  it('shows a save-failure indicator when a Supabase save fails, without leaving the loading/error screens', async () => {
    render(<App />)
    const wdgUeberschrift = await screen.findByDisplayValue('Theorieblöcke Begabtenförderung')
    // Registered only after the initial load-triggered save has already gone out (see
    // useAppData's "writes the updated data to Supabase after a change" test, which needs
    // an analogous updateMock.mockClear() for the same reason) — otherwise this
    // mockReturnValueOnce would be consumed by that first save instead of the one below.
    updateMock.mockReturnValueOnce({ eq: () => Promise.resolve({ error: { message: 'Netzwerkfehler beim Speichern' } }) })
    fireEvent.change(wdgUeberschrift, { target: { value: 'Geänderter Titel' } })
    expect(await screen.findByText(/Nicht gespeichert/i)).toBeInTheDocument()
  })

  it('adding and removing a Termin via the WDG ReihenEditor updates the rendered rows end-to-end', async () => {
    render(<App />)

    // Scope all queries to the WDG Reihe's own subtree, since every Reihe on the
    // page renders an identical "+ Termin hinzufügen" button and its own set of
    // "... löschen" delete buttons. ReihenEditor renders the Titel as
    // <input aria-label="Titel"> as the first child of the Reihe's single wrapping
    // <div>, so the input's nearest ancestor <div> is exactly that Reihe's container.
    const wdgUeberschrift = await screen.findByDisplayValue('Theorieblöcke Begabtenförderung')
    const wdgContainer = wdgUeberschrift.closest('div') as HTMLElement
    expect(wdgContainer).not.toBeNull()
    const wdg = within(wdgContainer)

    const zeilenVorher = wdg.getAllByRole('row').length
    const loeschButtonsVorher = wdg.getAllByRole('button', { name: /löschen/i })

    fireEvent.click(wdg.getByText('+ Termin hinzufügen'))

    expect(wdg.getAllByRole('row').length).toBe(zeilenVorher + 1)
    const loeschButtonsNachHinzufuegen = wdg.getAllByRole('button', { name: /löschen/i })
    expect(loeschButtonsNachHinzufuegen).toHaveLength(loeschButtonsVorher.length + 1)

    fireEvent.click(loeschButtonsNachHinzufuegen[0])

    expect(wdg.getAllByRole('row').length).toBe(zeilenVorher)
    expect(wdg.getAllByRole('button', { name: /löschen/i })).toHaveLength(loeschButtonsVorher.length)
  })
})
