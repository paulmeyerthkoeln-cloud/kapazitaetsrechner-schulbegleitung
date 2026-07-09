import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the Ampel-Antwort and Wochen-Heatmap', () => {
    render(<App />)
    expect(screen.getByText(/Kapazitätsrechner Schulbegleitung/i)).toBeInTheDocument()
    expect(screen.getByText(/MACHBAR|KRITISCH|NICHT MACHBAR/)).toBeInTheDocument()
  })

  it('adding and removing a Termin via the WDG ReihenEditor updates the rendered rows end-to-end', () => {
    render(<App />)

    // Scope all queries to the WDG Reihe's own subtree, since every Reihe on the
    // page renders an identical "+ Termin hinzufügen" button and its own set of
    // "... löschen" delete buttons. ReihenEditor renders the Titel as
    // <input aria-label="Titel"> as the first child of the Reihe's single wrapping
    // <div>, so the input's nearest ancestor <div> is exactly that Reihe's container.
    const wdgUeberschrift = screen.getByDisplayValue('Theorieblöcke Begabtenförderung')
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
