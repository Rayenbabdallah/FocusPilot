import React, { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { HomeIcon, ZapIcon, ClockIcon, UserIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { useStore } from '../store'

const navItems = [
  { to: '/', label: 'Home', icon: HomeIcon, exact: true },
  { to: '/session', label: 'Session', icon: ZapIcon, exact: false },
  { to: '/history', label: 'History', icon: ClockIcon, exact: false },
  { to: '/profile', label: 'Profile', icon: UserIcon, exact: false },
]

export default function Layout() {
  const [expanded, setExpanded] = useState(false)
  const isSessionActive = useStore((s) => s.isSessionActive)
  const location = useLocation()

  return (
    <div className="flex h-screen overflow-hidden atmosphere-bg">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <motion.aside
        initial={false}
        animate={{ width: expanded ? 200 : 64 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className="flex flex-col flex-shrink-0 overflow-hidden border-r border-white/[0.06] glass-dark"
        style={{ borderRadius: 0 }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.06]"
          style={{ minHeight: 64 }}
        >
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0 animate-float"
            style={{ width: 32, height: 32, backgroundColor: 'rgba(152,232,158,0.15)', border: '1px solid rgba(152,232,158,0.3)' }}
          >
            <span style={{ color: '#98E89E', fontWeight: 700, fontSize: 14 }}>F</span>
          </div>
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="text-white font-bold whitespace-nowrap overflow-hidden"
                style={{ fontSize: 15 }}
              >
                FocusPilot
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1 px-2 py-4">
          {navItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                clsx(
                  'relative flex items-center gap-3 rounded-xl transition-colors duration-200 cursor-pointer',
                  'px-3 py-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40 focus-visible:ring-offset-1 focus-visible:ring-offset-base',
                  isActive
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active left-bar indicator (reference pattern) */}
                  {isActive && (
                    <motion.div
                      layoutId="active-nav"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r-full"
                      style={{ backgroundColor: '#98E89E' }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}

                  <Icon
                    size={18}
                    className="flex-shrink-0 transition-all duration-200"
                    style={{
                      color: isActive ? '#98E89E' : undefined,
                      filter: isActive ? 'drop-shadow(0 0 6px rgba(152,232,158,0.5))' : undefined,
                    }}
                  />
                  <AnimatePresence>
                    {expanded && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="text-sm font-medium whitespace-nowrap overflow-hidden"
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </>
              )}
            </NavLink>
          ))}

          {/* Session Active Indicator */}
          <AnimatePresence>
            {isSessionActive && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 px-3 py-2 mt-2 rounded-xl"
                style={{ backgroundColor: 'rgba(232,232,112,0.08)', border: '1px solid rgba(232,232,112,0.15)' }}
              >
                <span
                  className="flex-shrink-0 rounded-full"
                  style={{
                    width: 7,
                    height: 7,
                    backgroundColor: '#E8E870',
                    boxShadow: '0 0 6px rgba(232,232,112,0.6)',
                    animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
                  }}
                />
                <AnimatePresence>
                  {expanded && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs font-medium whitespace-nowrap"
                      style={{ color: '#E8E870' }}
                    >
                      Session Active
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {/* Bottom: AWS Bedrock */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="px-4 py-3 border-t border-white/[0.06]"
            >
              <p className="text-xs whitespace-nowrap font-mono" style={{ color: '#FF9900' }}>
                Powered by AWS Bedrock
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
