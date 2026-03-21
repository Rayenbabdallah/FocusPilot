import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react'
import { useToastStore } from '../hooks/useToast'

const ICONS = {
  success: <CheckCircle size={15} />,
  error:   <AlertCircle size={15} />,
  info:    <Info size={15} />,
}

// Reference palette: mint success, rose error, periwinkle info
const STYLES = {
  success: {
    backgroundColor: 'rgba(152,232,158,0.12)',
    borderColor:     'rgba(152,232,158,0.25)',
    color:           '#98E89E',
  },
  error: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor:     'rgba(239,68,68,0.25)',
    color:           '#fca5a5',
  },
  info: {
    backgroundColor: 'rgba(112,128,232,0.12)',
    borderColor:     'rgba(112,128,232,0.25)',
    color:           '#a5b4fc',
  },
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div
      className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-label="Notifications"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 56, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 56, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl backdrop-blur-xl border min-w-[260px] max-w-sm"
            style={{
              ...STYLES[toast.type],
              backgroundColor: STYLES[toast.type].backgroundColor,
            }}
          >
            <span className="shrink-0" style={{ color: STYLES[toast.type].color }}>
              {ICONS[toast.type]}
            </span>
            <span className="flex-1 text-sm font-medium leading-snug" style={{ color: STYLES[toast.type].color }}>
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
              style={{ color: STYLES[toast.type].color }}
            >
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
