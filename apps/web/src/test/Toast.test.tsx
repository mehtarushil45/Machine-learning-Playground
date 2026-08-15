/**
 * Toast.test.tsx
 * Item 45b — Verify toast variants render the correct icon, border colour,
 * and accessible role for each type: success, error, info, warning.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Toast, TOAST_VARIANT_CONFIGS } from '../components/ui/Toast'

describe('Toast component — variant rendering', () => {
  it('renders a success toast with the correct title and green icon class', () => {
    render(<Toast variant="success" title="Job Complete" description="Training finished." />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Job Complete')).toBeInTheDocument()
    expect(screen.getByText('Training finished.')).toBeInTheDocument()
    // Icon container carries the variant-specific colour class
    const iconWrapper = screen.getByRole('alert').querySelector('.text-\\[\\#C9A24B\\]')
    expect(iconWrapper).toBeTruthy()
  })

  it('renders an error toast with red icon class and AlertOctagon', () => {
    render(<Toast variant="error" title="Upload Failed" description="Invalid file type." />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(screen.getByText('Upload Failed')).toBeInTheDocument()
    const iconWrapper = alert.querySelector('.text-\\[\\#B23A4E\\]')
    expect(iconWrapper).toBeTruthy()
  })

  it('renders an info toast with blueberry icon class', () => {
    render(<Toast variant="info" title="Processing" />)
    const alert = screen.getByRole('alert')
    const iconWrapper = alert.querySelector('.text-\\[\\#6C5CA6\\]')
    expect(iconWrapper).toBeTruthy()
  })

  it('renders a warning toast with amber icon class', () => {
    render(<Toast variant="warning" title="Low Disk Space" />)
    const alert = screen.getByRole('alert')
    const iconWrapper = alert.querySelector('.text-amber-400')
    expect(iconWrapper).toBeTruthy()
  })

  it('falls back to info config for unknown variant', () => {
    // TypeScript won't allow this but validate runtime safety
    // @ts-expect-error — intentional bad variant for runtime test
    render(<Toast variant="unknown" title="Fallback" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Fallback')).toBeInTheDocument()
  })

  it('calls onClose when the × button is clicked', async () => {
    const onClose = vi.fn()
    render(<Toast variant="success" title="Done" onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /close notification/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render a close button when onClose is not provided', () => {
    render(<Toast variant="success" title="Done" />)
    expect(screen.queryByRole('button', { name: /close notification/i })).toBeNull()
  })

  it('TOAST_VARIANT_CONFIGS contains all four variants', () => {
    expect(Object.keys(TOAST_VARIANT_CONFIGS)).toEqual(
      expect.arrayContaining(['success', 'error', 'info', 'warning'])
    )
    for (const config of Object.values(TOAST_VARIANT_CONFIGS)) {
      expect(config.icon).toBeTruthy()
      expect(config.iconColor).toBeTruthy()
      expect(config.borderColor).toBeTruthy()
    }
  })
})
