import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DatumOderKwFeld } from './DatumOderKwFeld'

describe('DatumOderKwFeld', () => {
  it('displays an ISO date as dd.MM.yyyy with its KW in parentheses', () => {
    render(<DatumOderKwFeld value="2026-11-09" onChange={vi.fn()} label="Datum/KW für Termin 1" />)
    expect(screen.getByText('09.11.2026 (KW46)')).toBeInTheDocument()
  })

  it('displays a KW-only value using the Monday of that week', () => {
    render(<DatumOderKwFeld value="2026-KW46" onChange={vi.fn()} label="Datum/KW für Termin 1" />)
    expect(screen.getByText('09.11.2026 (KW46)')).toBeInTheDocument()
  })

  it('seeds the calendar input with the corresponding ISO date', () => {
    render(<DatumOderKwFeld value="2026-KW46" onChange={vi.fn()} label="Datum/KW für Termin 1" />)
    expect(screen.getByLabelText('Datum/KW für Termin 1 – Kalender')).toHaveValue('2026-11-09')
  })

  it('calls onChange with the new ISO date when the calendar input changes', () => {
    const onChange = vi.fn()
    render(<DatumOderKwFeld value="2026-11-09" onChange={onChange} label="Datum/KW für Termin 1" />)
    fireEvent.change(screen.getByLabelText('Datum/KW für Termin 1 – Kalender'), { target: { value: '2026-11-16' } })
    expect(onChange).toHaveBeenCalledWith('2026-11-16')
  })

  it('calls onChange with the raw string when the text fallback changes', () => {
    const onChange = vi.fn()
    render(<DatumOderKwFeld value="2026-11-09" onChange={onChange} label="Datum/KW für Termin 1" />)
    fireEvent.change(screen.getByLabelText('Datum/KW für Termin 1'), { target: { value: '2026-KW50' } })
    expect(onChange).toHaveBeenCalledWith('2026-KW50')
  })
})
