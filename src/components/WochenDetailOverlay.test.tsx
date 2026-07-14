import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WochenDetailOverlay } from './WochenDetailOverlay'
import type { SchulWochenDetail } from '../lib/wochenDetails'

const details: SchulWochenDetail[] = [
  { schulId: 's1', schulName: 'WDG', stunden: 4, begleitpersonen: ['Anna', 'Ben'] },
  { schulId: 's2', schulName: 'Sedanstraße', stunden: 1.5, begleitpersonen: [] },
]

describe('WochenDetailOverlay', () => {
  it('shows the KW and its date span in the heading', () => {
    render(<WochenDetailOverlay wochenKey="2026-KW46" details={details} onClose={vi.fn()} />)
    expect(screen.getByText('KW46 (09.11.–15.11.2026)')).toBeInTheDocument()
  })

  it('renders one row per Schule with its Stunden and Begleitpersonen', () => {
    render(<WochenDetailOverlay wochenKey="2026-KW46" details={details} onClose={vi.fn()} />)
    expect(screen.getByText('WDG')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Anna, Ben')).toBeInTheDocument()
    expect(screen.getByText('Sedanstraße')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows a fallback message when no Schule has Stunden that week', () => {
    render(<WochenDetailOverlay wochenKey="2026-KW46" details={[]} onClose={vi.fn()} />)
    expect(screen.getByText('Keine Schule mit Stunden in dieser Woche.')).toBeInTheDocument()
  })

  it('calls onClose when the Schließen button is clicked', () => {
    const onClose = vi.fn()
    render(<WochenDetailOverlay wochenKey="2026-KW46" details={details} onClose={onClose} />)
    fireEvent.click(screen.getByText('Schließen'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when clicking the dialog itself (the ::backdrop area, outside the content)', () => {
    const onClose = vi.fn()
    render(<WochenDetailOverlay wochenKey="2026-KW46" details={details} onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onClose when clicking inside the content', () => {
    const onClose = vi.fn()
    render(<WochenDetailOverlay wochenKey="2026-KW46" details={details} onClose={onClose} />)
    fireEvent.click(screen.getByText('WDG'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
