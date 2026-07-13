import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExportImport } from './ExportImport'

describe('ExportImport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls zuruecksetzen when the reset is confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const zuruecksetzen = vi.fn()
    render(<ExportImport exportJson={() => '{}'} importJson={() => {}} importError={null} zuruecksetzen={zuruecksetzen} />)
    fireEvent.click(screen.getByText('Zurücksetzen auf Ausgangsdaten'))
    expect(zuruecksetzen).toHaveBeenCalledTimes(1)
  })

  it('does not call zuruecksetzen when the reset is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const zuruecksetzen = vi.fn()
    render(<ExportImport exportJson={() => '{}'} importJson={() => {}} importError={null} zuruecksetzen={zuruecksetzen} />)
    fireEvent.click(screen.getByText('Zurücksetzen auf Ausgangsdaten'))
    expect(zuruecksetzen).not.toHaveBeenCalled()
  })
})
