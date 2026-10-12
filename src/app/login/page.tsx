'use client'

/* ============================================================================
   IBADU RAHMAN INTERNATIONAL SCHOOL — LOGIN PAGE
   Student · Teacher · Admin
   ============================================================================ */

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/* ============================================================================
   CONFIG
   ============================================================================ */

const ADMIN_PASSWORD = 'IRIS@Admin2025'   // ⚠️ must match admin console
const ADMIN_SESSION_KEY = 'iris.admin.session'
const ADMIN_SESSION_MINUTES = 30

const SCHOOL = {
  name: 'Ibadu Rahman International School',
  motto: 'Quest for Excellence',
  tagline: 'Nurturing Excellence in Western Education & Islamic Values',
  logo: 'https://github.com/Moraks-Tech/Ibadurahmaninternationalschool/blob/main/logo.jpg?raw=true',
}

type Role = 'student' | 'teacher' | 'admin'

const ROLE_OPTIONS: { value: Role; label: string; icon: string; hint: string }[] = [
  { value: 'student', label: 'Student', icon: '🎓', hint: 'Sign in with your admission number' },
  { value: 'teacher', label: 'Teacher', icon: '📚', hint: 'Sign in with your school email' },
  { value: 'admin', label: 'Admin', icon: '🔐', hint: 'Administrator access only' },
]

/* ============================================================================
   GLOBAL STYLE
   ============================================================================ */

function GlobalStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          input, select, textarea, option {
            color: #1A2332 !important;
            background-color: #ffffff;
          }
          input::placeholder, textarea::placeholder {
            color: #94a3b8 !important;
            opacity: 1;
          }
          select option { color: #1A2332; background-color: #ffffff; }
          input:-webkit-autofill {
            -webkit-text-fill-color: #1A2332 !important;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .animate-fade { animation: fadeIn 0.35s ease-out both; }
        `,
      }}
    />
  )
}

/* ============================================================================
   MAIN COMPONENT
   ============================================================================ */

export default function LoginPage() {
  const router = useRouter()

  const [loginRole, setLoginRole] = useState<Role>('student')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [loginRole])

  function changeRole(role: Role) {
    if (role === loginRole) return
    setLoginRole(role)
    setIdentifier('')
    setPassword('')
    setError(null)
    setSuccess(null)
    setShowPassword(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return

    setError(null)
    setSuccess(null)
    setLoading(true)

    const idVal = identifier.trim().toLowerCase()
    const passVal = password.trim().toLowerCase()

    try {
      if (loginRole === 'admin') {
        if (password === ADMIN_PASSWORD) {
          sessionStorage.setItem(
            ADMIN_SESSION_KEY,
            JSON.stringify({ expiresAt: Date.now() + ADMIN_SESSION_MINUTES * 60 * 1000 })
          )
          setSuccess('Welcome, Administrator. Redirecting...')
          setTimeout(() => router.push('/portal/admin'), 600)
        } else {
          setError('Incorrect admin password. Please try again.')
          setLoading(false)
        }
        return
      }

      if (loginRole === 'teacher') {
        const { data, error: dbError } = await supabase
          .from('teachers')
          .select('*')
          .ilike('email', idVal)
          .maybeSingle()

        if (dbError || !data) {
          setError('No teacher account found with that email.')
          setLoading(false)
          return
        }

        const stored = (data.password || '').trim().toLowerCase()
        if (stored && stored === passVal) {
          localStorage.setItem('loggedInTeacher', JSON.stringify(data))
          setSuccess('Login successful. Redirecting to your portal...')
          setTimeout(() => router.push('/portal/teacher'), 600)
        } else {
          setError('Incorrect password. Please check and try again.')
          setLoading(false)
        }
        return
      }

      if (loginRole === 'student') {
        const { data, error: dbError } = await supabase
          .from('students')
          .select('*')
          .ilike('admission_number', idVal)
          .maybeSingle()

        if (dbError || !data) {
          setError('Admission number not found. Please confirm with the school office.')
          setLoading(false)
          return
        }

        const stored = (data.password || '').trim().toLowerCase()
        if (stored && stored === passVal) {
          localStorage.setItem('loggedInStudent', JSON.stringify(data))
          setSuccess('Login successful. Redirecting to your portal...')
          setTimeout(() => router.push('/portal/student'), 600)
        } else {
          setError('Incorrect password. Please check and try again.')
          setLoading(false)
        }
        return
      }
    } catch {
      setError('Something went wrong. Please check your internet connection and try again.')
      setLoading(false)
    }
  }

  const currentRoleMeta = ROLE_OPTIONS.find((r) => r.value === loginRole)!

  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-gradient-to-br from-[#061A33] via-[#0A1E3D] to-[#061A33] flex items-center justify-center p-3 sm:p-6">

        <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-5">

          {/* ═══════════════════════════════════════════════════════════
              LEFT PANEL — Branding (hidden on mobile, shown on lg+)
              ═══════════════════════════════════════════════════════════ */}
          <div className="hidden lg:flex lg:col-span-2 relative bg-gradient-to-br from-[#0A1E3D] via-[#08162B] to-[#061A33] text-white p-10 flex-col justify-between overflow-hidden">

            {/* Decorative pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden="true">
              <div className="absolute top-10 -right-20 w-64 h-64 rounded-full bg-amber-400 blur-3xl" />
              <div className="absolute bottom-10 -left-20 w-64 h-64 rounded-full bg-amber-300 blur-3xl" />
            </div>

            {/* Top: logo + name */}
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="relative shrink-0">
                  <img
                    src={SCHOOL.logo}
                    alt={SCHOOL.name}
                    className="w-16 h-16 rounded-2xl bg-white p-1.5 object-contain shadow-lg ring-2 ring-amber-400/40"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black tracking-[0.25em] text-amber-300 uppercase">
                    Welcome to
                  </p>
                  <p className="font-black text-sm tracking-wide">
                    IRIS PORTAL
                  </p>
                </div>
              </div>

              <h1 className="text-3xl font-black leading-tight mb-3">
                {SCHOOL.name}
              </h1>
              <p className="text-base italic text-amber-300 font-semibold mb-6">
                "{SCHOOL.motto}"
              </p>

              <div className="h-px bg-amber-400/30 mb-6" />

              <p className="text-sm text-amber-100/80 leading-relaxed font-medium">
                {SCHOOL.tagline}
              </p>
            </div>

            {/* Bottom: greeting + copyright */}
            <div className="relative z-10">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-widest text-amber-300 font-bold mb-1">
                  Return to Portal
                </p>
                <p className="text-xs text-white/90 leading-relaxed">
                  Access your report cards, CBT exams, attendance, and school announcements in one place.
                </p>
              </div>
              <p className="text-[10px] text-white/40 mt-6 font-semibold">
                © {new Date().getFullYear()} {SCHOOL.name}
              </p>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              RIGHT PANEL — Login form
              ═══════════════════════════════════════════════════════════ */}
          <div className="col-span-1 lg:col-span-3 p-6 sm:p-10 bg-white">

            {/* Mobile header — logo + name stacked */}
            <div className="lg:hidden flex items-center gap-3 mb-6 pb-6 border-b border-slate-100">
              <img
                src={SCHOOL.logo}
                alt={SCHOOL.name}
                className="w-12 h-12 rounded-xl bg-white p-1 object-contain ring-1 ring-amber-200 shrink-0"
              />
              <div className="min-w-0">
                <p className="font-black text-sm text-[#0A1E3D] leading-tight truncate">
                  {SCHOOL.name}
                </p>
                <p className="text-[11px] text-[#0A1E3D]/60 italic font-semibold truncate">
                  "{SCHOOL.motto}"
                </p>
              </div>
            </div>

            {/* Back to home */}
            <div className="mb-6 flex justify-end">
              <button
                onClick={() => router.push('/')}
                className="text-[11px] font-bold text-[#0A1E3D] hover:text-amber-600 transition"
              >
                ← Back to Home
              </button>
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h2 className="text-2xl font-black text-[#0A1E3D] tracking-tight">
                Portal Access
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {currentRoleMeta.hint}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">

              {/* ROLE TABS */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                  Select Portal
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map((r) => {
                    const active = loginRole === r.value
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => changeRole(r.value)}
                        className={`flex flex-col items-center justify-center py-3 rounded-xl text-[11px] font-bold transition-all ${
                          active
                            ? 'bg-[#0A1E3D] text-white shadow-lg ring-2 ring-amber-400/50 scale-[1.02]'
                            : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                        }`}
                      >
                        <span className="text-lg mb-1">{r.icon}</span>
                        <span>{r.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* IDENTIFIER */}
              {loginRole !== 'admin' && (
                <div className="animate-fade" key={loginRole}>
                  <label htmlFor="identifier" className="block text-xs font-bold text-[#0A1E3D] mb-1.5">
                    {loginRole === 'student' ? 'Admission Number' : 'Teacher Email'}
                  </label>
                  <input
                    id="identifier"
                    ref={firstFieldRef}
                    type={loginRole === 'teacher' ? 'email' : 'text'}
                    placeholder={
                      loginRole === 'student'
                        ? 'IRIS/2025/001'
                        : 'teacher@iris.edu.ng'
                    }
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    autoComplete={loginRole === 'teacher' ? 'email' : 'username'}
                    className="w-full border px-4 py-3.5 rounded-xl text-sm bg-white text-gray-900 font-semibold border-slate-200 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 transition"
                  />
                </div>
              )}

              {/* ADMIN NOTICE */}
              {loginRole === 'admin' && (
                <div className="animate-fade bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <span className="text-2xl leading-none">🔒</span>
                  <div>
                    <p className="text-xs font-black text-amber-900 uppercase tracking-wide">
                      Admin Access
                    </p>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                      Administrator login requires only the admin password. Enter it below to continue.
                    </p>
                  </div>
                </div>
              )}

              {/* PASSWORD */}
              <div>
                <label htmlFor="password" className="block text-xs font-bold text-[#0A1E3D] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    ref={loginRole === 'admin' ? firstFieldRef : undefined}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full border px-4 py-3.5 pr-16 rounded-xl text-sm bg-white text-gray-900 font-semibold border-slate-200 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#0A1E3D] hover:text-amber-600 transition px-2 py-1"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* ERROR */}
              {error && (
                <div
                  role="alert"
                  className="animate-fade bg-red-50 border-l-4 border-red-500 text-red-700 text-xs font-semibold rounded-r-lg px-4 py-3"
                >
                  {error}
                </div>
              )}

              {/* SUCCESS */}
              {success && (
                <div
                  role="status"
                  className="animate-fade bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-xs font-semibold rounded-r-lg px-4 py-3"
                >
                  {success}
                </div>
              )}

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={loading || !!success}
                className="w-full bg-[#0A1E3D] hover:bg-[#051228] active:scale-[0.99] text-white py-4 rounded-xl font-black text-sm shadow-lg shadow-[#0A1E3D]/30 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && !success ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    Sign In
                    <span className="text-base">→</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-center text-gray-500 font-medium pt-1">
                Having trouble logging in? Contact the school office.
              </p>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}