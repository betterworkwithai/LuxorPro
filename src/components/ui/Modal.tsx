import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, onClose, title, description, children, size = 'md' }: ModalProps) {
  const sizeMap = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 animate-fade-in" />
        <Dialog.Content
          className={clsx(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
            'w-[calc(100vw-2rem)] bg-[#111118] border border-[#1e1e2e] rounded-2xl',
            'shadow-[0_25px_60px_rgba(0,0,0,0.6)] animate-slide-up',
            sizeMap[size],
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
            <div>
              <Dialog.Title className="text-base font-semibold text-[#e8e8f0]">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-xs text-[#55556a] mt-0.5">{description}</Dialog.Description>
              ) : (
                // Radix requires a Description for accessibility; render a
                // visually-hidden one mirroring the title when no caller-
                // provided description is available. Silences the runtime
                // "Missing Description or aria-describedby" warning.
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:text-[#e8e8f0] hover:bg-[#16161f] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-[80vh] overflow-y-auto">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ModalFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1e1e2e]', className)}>
      {children}
    </div>
  )
}
