'use client'

/* ═══════════════════════════════════════════════════════════════
   IBADU RAHMAN INTERNATIONAL SCHOOL — CBT PORTAL
   v3.1 — Single-purpose exam room
   
   Route: /portal/cbt
   Query:  ?exam=<id>  (deep-link, jumps to instructions)
   
   ROLES
   ─────────────────────────────────────────────────────────────
   • This is the EXAM-TAKING portal
   • Student portal (/portal/student) is the personal hub
   • Both portals share the same session — login to either
   
   WHAT'S NEW IN v3.1
   ─────────────────────────────────────────────────────────────
   ▸ No sidebar — focused, single-purpose UI
   ▸ Header with student name + avatar dropdown
       • Return to Student Portal
       • Help & Support
       • Sign Out
   ▸ Refined flow:
       Dashboard → Instructions → Welcome splash → Exam → Submit
   ▸ Welcome splash (2 sec) before exam starts
   ▸ Single timer across OBJ + theory sections
   ▸ Double-confirm submit (review modal + yes)
   ▸ Success screen with next-step instructions
   ▸ Tiered auto-flagging (see FLAG_TIERS below)
   ▸ Deep-link ?exam=<id> jumps straight to instructions
   
   PRESERVED FROM v3.0
   ─────────────────────────────────────────────────────────────
   ✓ Anon session bootstrap
   ✓ Robust update with SDK + REST fallback
   ✓ Split sections (A: OBJ, B: Theory)
   ✓ Question navigator + flag for review
   ✓ Auto-save with debounce
   ✓ Tab-switch detection
   ✓ Before-unload warning
   ✓ Auto-submit when timer hits zero
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'

/* ═══════════════════════════════════════════════════════════════
   SUPABASE
   ═══════════════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://dtnxidhvttjxkirxafnf.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0bnhpZGh2dHRqeGtpcnhhZm5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDExOTEsImV4cCI6MjEwNjE3NzE5MX0.trsR_V-83k3cC-Wxv8FHby1FVPND0Uxndm0SGkDusjs'

const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const SESSION_KEY = 'iris.cbt.session'
const LEGACY_KEY = 'loggedInStudent'
const DEFAULT_SESSION = '2025/2026'
const GATEWAY_URL = '/'
const STUDENT_PORTAL_URL = '/portal/student'
const SCHOOL_EMAIL = 'admin@ibadurahman.sch.ng'

/* ═══════════════════════════════════════════════════════════════
   FLAG TIERS — auto-flagging configuration
   ═══════════════════════════════════════════════════════════════
   
   Tier 1 — Always flag silently (highest integrity risk)
     • Tab switch / window blur
     • Fullscreen exit
   
   Tier 2 — Warn + flag (student sees a small toast)
     • Right-click / context menu
     • Copy attempt
     • Paste attempt
   
   Tier 3 — Block + flag (silent block, flag logged)
     • Dev tools shortcuts
     • View source
     • Print
     • Screenshot shortcuts (best-effort)
   
   Every flag increments `exam_attempts.flags` and appends a reason
   string. Admin sees the count + reasons in the Live Monitor tab.
   ═══════════════════════════════════════════════════════════════ */

type FlagReason =
  | 'tab_switch'
  | 'fullscreen_exit'
  | 'right_click'
  | 'copy_attempt'
  | 'paste_attempt'
  | 'devtools_attempt'
  | 'print_attempt'
  | 'screenshot_attempt'

const FLAG_TIER: Record<FlagReason, 1 | 2 | 3> = {
  tab_switch: 1,
  fullscreen_exit: 1,
  right_click: 2,
  copy_attempt: 2,
  paste_attempt: 2,
  devtools_attempt: 3,
  print_attempt: 3,
  screenshot_attempt: 3,
}

const FLAG_WARNINGS: Partial<Record<FlagReason, string>> = {
  tab_switch: 'Tab switch detected. This has been recorded.',
  fullscreen_exit: 'You left fullscreen. Please return to fullscreen mode.',
  right_click: 'Right-click is disabled during the exam.',
  copy_attempt: 'Copying is disabled during the exam.',
  paste_attempt: 'Pasting is disabled during the exam.',
}

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */
type Student = {
  id: string
  adm?: string
  admission_number?: string
  fullname?: string
  full_name?: string
  dob?: string | null
  date_of_birth?: string | null
  gender?: string | null
  class?: string
  class_id?: string | null
  stream?: string | null
  cbt_password?: string | null
  passport_url?: string | null
}

type Exam = {
  id: string
  title: string
  subject: string
  class: string
  stream: string | null
  duration: number
  status: string
  instructions?: string | null
  has_theory?: boolean
  total_marks?: number | null
  start_at?: string | null
  end_at?: string | null
  published_at?: string | null
  created_at?: string
  session?: string | null
  shuffle_questions?: boolean
  shuffle_options?: boolean
  max_attempts?: number
}

type ExamAttempt = {
  id: number | string
  student_id: string | null
  exam_id: string | null
  exam_title: string | null
  subject: string | null
  class: string
  stream: string | null
  session: string | null
  term: string | null
  status: string
  current_question: number
  total_questions: number
  score: number
  max_score: number
  final_score: number | null
  theory_total: number | null
  flags: number
  flagged_reason?: string | null
  tab_switch_count: number
  extended_minutes: number
  started_at: string
  last_activity_at: string
  submitted_at: string | null
  answers: Record<string, string | number> | null
}

type Question = {
  id: string
  exam_id?: string | number | null
  subject: string
  class: string
  type: 'objective' | 'theory'
  prompt: string
  options: string[] | null
  correct_index: number
  marks: number
  theory_answer_guide?: string | null
}

type TermSetting = {
  id: number
  session: string
  term: string
  start_date: string | null
  end_date: string | null
  next_term_begins: string | null
  days_school_opened: number
  is_current: boolean
}

type ToastTone = 'success' | 'error' | 'info' | 'warn'
type Toast = { id: number; msg: string; tone: ToastTone }

type ExamCardState =
  | 'not_started'
  | 'upcoming'
  | 'in_progress'
  | 'submitted'
  | 'missed'
  | 'unavailable'

type ExamSession = {
  exam: Exam
  attempt: ExamAttempt
  questions: Question[]
  objectiveQuestions: Question[]
  theoryQuestions: Question[]
  answers: Record<string, string>
  currentQuestionIndex: number
  startedAt: number
  durationMs: number
  flaggedQuestions: Set<string>
  tabSwitchCount: number
}

type SubmitResult = {
  attemptId: number | string
  score: number
  maxScore: number
  hasTheory: boolean
  submittedAt: string
}

type ExamFlowStep =
  | 'login'
  | 'dashboard'
  | 'instructions'
  | 'welcome'
  | 'exam'
  | 'submitted'

/* ═══════════════════════════════════════════════════════════════
   AUTH BOOTSTRAP — guarantees an anon session exists
   ═══════════════════════════════════════════════════════════════ */
let authReadyPromise: Promise<void> | null = null

async function ensureAuthSession(): Promise<void> {
  if (authReadyPromise) return authReadyPromise

  authReadyPromise = (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) {
        const expiresAt = data.session.expires_at ?? 0
        const nowSec = Math.floor(Date.now() / 1000)
        if (expiresAt - nowSec < 60) {
          const { error } = await supabase.auth.refreshSession()
          if (error) console.warn('[IRIS CBT] refreshSession failed:', error)
        }
        return
      }
      const { error } = await supabase.auth.signInAnonymously()
      if (error) {
        console.warn('[IRIS CBT] signInAnonymously failed:', error)
        throw error
      }
    } catch (e) {
      console.error('[IRIS CBT] ensureAuthSession error:', e)
      throw e
    }
  })()

  return authReadyPromise
}

/* ═══════════════════════════════════════════════════════════════
   ROBUST UPDATE — tries SDK, falls back to raw REST
   ═══════════════════════════════════════════════════════════════ */
type RobustResult<T> = {
  ok: boolean
  data: T | null
  error: string | null
  code: string | null
  rows: number
}

async function robustUpdateAttempt(
  attemptId: number | string,
  payload: Record<string, any>
): Promise<RobustResult<ExamAttempt>> {
  try {
    await ensureAuthSession()
  } catch (e: any) {
    return {
      ok: false,
      data: null,
      error: 'Auth bootstrap failed: ' + (e?.message || 'unknown'),
      code: 'AUTH_BOOT',
      rows: 0,
    }
  }

  /* Attempt 1: SDK */
  try {
    const { data, error, status } = await supabase
      .from('exam_attempts')
      .update(payload)
      .eq('id', attemptId)
      .select()

    if (error) {
      console.warn('[IRIS CBT] SDK update error:', error)
    } else if (data && data.length > 0) {
      return {
        ok: true,
        data: data[0] as ExamAttempt,
        error: null,
        code: null,
        rows: data.length,
      }
    } else {
      console.warn(
        '[IRIS CBT] SDK update returned 0 rows (status',
        status,
        ') — trying REST fallback'
      )
    }
  } catch (e: any) {
    console.warn('[IRIS CBT] SDK update threw:', e)
  }

  /* Attempt 2: raw REST */
  try {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token || SUPABASE_ANON_KEY

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/exam_attempts?id=eq.${encodeURIComponent(
        String(attemptId)
      )}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      }
    )

    const text = await res.text()
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }

    if (!res.ok) {
      return {
        ok: false,
        data: null,
        error:
          (parsed && (parsed.message || parsed.error)) ||
          `HTTP ${res.status} ${res.statusText}`,
        code: (parsed && parsed.code) || String(res.status),
        rows: 0,
      }
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      return {
        ok: true,
        data: parsed[0] as ExamAttempt,
        error: null,
        code: null,
        rows: parsed.length,
      }
    }

    return {
      ok: false,
      data: null,
      error: 'Update returned 0 rows (RLS may be blocking)',
      code: 'NO_ROWS',
      rows: 0,
    }
  } catch (e: any) {
    return {
      ok: false,
      data: null,
      error: 'REST fallback failed: ' + (e?.message || 'unknown'),
      code: 'REST_FALLBACK',
      rows: 0,
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function readSession(): string | null {
  let raw =
    typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null
  if (raw) return raw

  const legacy =
    typeof window !== 'undefined' ? localStorage.getItem(LEGACY_KEY) : null
  if (!legacy) return null

  try {
    const parsed = JSON.parse(legacy)
    if (parsed?.id) {
      localStorage.setItem(SESSION_KEY, legacy)
      return legacy
    }
  } catch {}
  return null
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(LEGACY_KEY)
  } catch {}
}

function initialsOf(name?: string | null): string {
  return (
    (name || '')
      .replace(/[^A-Za-z\s]/g, '')
      .trim()
      .split(/\s+/)
      .map(w => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '--'
  )
}

function studentName(s: Student): string {
  return s.fullname || s.full_name || 'Student'
}
function studentAdm(s: Student): string {
  return s.adm || s.admission_number || '—'
}

function formatDuration(
  startedAt: string | null,
  submittedAt: string | null
): string {
  if (!startedAt || !submittedAt) return '—'
  const start = new Date(startedAt).getTime()
  const end = new Date(submittedAt).getTime()
  if (isNaN(start) || isNaN(end)) return '—'
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function timeAgo(ts: string | null): string {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function examCardState(exam: Exam, attempt: ExamAttempt | null): ExamCardState {
  const now = Date.now()
  const startAt = exam.start_at ? new Date(exam.start_at).getTime() : null
  const endAt = exam.end_at ? new Date(exam.end_at).getTime() : null

  if (
    attempt &&
    ['submitted', 'auto_submitted', 'graded', 'pending_manual_marking'].includes(
      attempt.status
    )
  ) {
    return 'submitted'
  }

  if (attempt && attempt.status === 'in_progress') {
    if (endAt !== null && now > endAt) return 'unavailable'
    return 'in_progress'
  }

  if (startAt !== null && now < startAt) return 'upcoming'
  if (endAt !== null && now > endAt) return 'missed'

  return 'not_started'
}

function getExamInstructions(exam: Exam): string {
  if (exam.instructions && exam.instructions.trim()) {
    return exam.instructions.trim()
  }
  return [
    '1. Read each question carefully before answering.',
    '2. Section A is Objective — select the correct option.',
    '3. Section B is Theory — write your answers in the booklet provided.',
    '4. Do not switch tabs or windows — this will be flagged.',
    '5. Submit before the timer reaches zero.',
  ].join('\n')
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ═══════════════════════════════════════════════════════════════
   GLOBAL STYLES
   ═══════════════════════════════════════════════════════════════ */
function GlobalStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          input, select, textarea, option {
            color: #0F172A !important;
            background-color: #ffffff;
          }
          input::placeholder, textarea::placeholder {
            color: #94a3b8 !important;
            opacity: 1;
          }
          select option { color: #0F172A; background-color: #ffffff; }
          input:-webkit-autofill {
            -webkit-text-fill-color: #0F172A !important;
          }
          .cbt-login-bg {
            background-image:
              radial-gradient(ellipse at top left, rgba(245,158,11,.15), transparent 55%),
              radial-gradient(ellipse at bottom right, rgba(43,90,147,.35), transparent 55%),
              linear-gradient(135deg, #05101F 0%, #0A1E3D 45%, #133057 100%);
          }
          .cbt-dash-bg {
            background-image:
              radial-gradient(ellipse at top right, rgba(245,158,11,.06), transparent 55%),
              linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%);
          }
          .iris-watermark { position: relative; overflow: hidden; }
          .iris-watermark::before {
            content: "";
            position: absolute; inset: 0;
            background-image: url('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQfjJJYVXvfa6ht32dukVuAAxlQhVGtlozh8SeyZyOcRaNsap1YrcDEAuuC&s=10');
            background-repeat: no-repeat;
            background-position: center center;
            background-size: 340px 340px;
            opacity: 0.04;
            pointer-events: none;
            z-index: 0;
          }
          .iris-watermark > * { position: relative; z-index: 1; }
          @media (max-width: 640px) { .iris-watermark::before { background-size: 200px 200px; } }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: none; }
          }
          .fade-in { animation: fadeIn .28s cubic-bezier(.2,.7,.3,1) forwards; }
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px) scale(.98); }
            to { opacity: 1; transform: none; }
          }
          .slide-up { animation: slideUp .35s cubic-bezier(.2,.7,.3,1) forwards; }
          @keyframes pulse-dot {
            0%, 100% { opacity: 1; }
            50% { opacity: .45; }
          }
          .pulse-dot { animation: pulse-dot 1.6s ease-in-out infinite; }
          .scroll-thin::-webkit-scrollbar { height: 8px; width: 8px; }
          .scroll-thin::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
          .scroll-thin::-webkit-scrollbar-track { background: transparent; }
          @keyframes warnPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,.35); }
            50% { box-shadow: 0 0 24px 4px rgba(220,38,38,.28); }
          }
          .warn-pulse { animation: warnPulse 2s ease-in-out infinite; }
          @keyframes scaleIn {
            from { opacity: 0; transform: scale(.92); }
            to { opacity: 1; transform: scale(1); }
          }
          .scale-in { animation: scaleIn .4s cubic-bezier(.2,.7,.3,1) forwards; }
          @keyframes checkBurst {
            0% { transform: scale(0); opacity: 0; }
            60% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          .check-burst { animation: checkBurst .55s cubic-bezier(.2,.7,.3,1) forwards; }
          .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
          .serif-display { font-family: 'Playfair Display', Georgia, serif; letter-spacing: -.01em; }
          * { -webkit-user-select: none; user-select: none; }
          * { -webkit-touch-callout: none; }
          input, textarea { -webkit-user-select: text !important; user-select: text !important; }
          @media print {
            body * { display: none !important; }
          }
        `,
      }}
    />
  )
}

/* ═══════════════════════════════════════════════════════════════
   END OF PART 1
   ═══════════════════════════════════════════════════════════════ */
   /* ═══════════════════════════════════════════════════════════════
   SHARED — Avatar
   ═══════════════════════════════════════════════════════════════ */
function Avatar({
  student,
  size = 36,
}: {
  student: Pick<Student, 'passport_url' | 'fullname' | 'full_name'>
  size?: number
}) {
  const name = studentName(student as Student)
  if (student.passport_url) {
    return (
      <img
        src={student.passport_url}
        alt={name}
        className="rounded-full object-cover bg-white shrink-0 ring-2 ring-[#F59E0B]/40"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-[#0A1E3D] text-[#F59E0B] font-bold flex items-center justify-center shrink-0 ring-2 ring-[#F59E0B]/40"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initialsOf(name)}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SHARED — Toasts
   ═══════════════════════════════════════════════════════════════ */
function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-6 right-6 z-[200] space-y-3 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border-l-4 bg-[#0A1E3D] text-white text-xs font-medium max-w-sm fade-in ${
            t.tone === 'success'
              ? 'border-emerald-500'
              : t.tone === 'error'
              ? 'border-red-500'
              : t.tone === 'warn'
              ? 'border-[#F59E0B]'
              : 'border-[#2B5A93]'
          }`}
        >
          <span className="w-4 h-4 shrink-0 mt-0.5 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px]">
            {t.tone === 'success' ? '✓' : '!'}
          </span>
          <div className="flex-1">{t.msg}</div>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   HEADER — avatar dropdown
   ═══════════════════════════════════════════════════════════════ */
function HeaderDropdown({
  student,
  onSignOut,
  disabled,
}: {
  student: Student
  onSignOut: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        aria-label="Account menu"
        className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-full hover:bg-[#F8FAFC] ring-1 ring-transparent hover:ring-slate-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="hidden sm:block text-right leading-tight pr-1">
          <span className="block text-[11px] font-bold text-[#0F172A] truncate max-w-[140px]">
            {studentName(student)}
          </span>
          <span className="block text-[10px] text-[#64748B] truncate max-w-[140px]">
            {student.class || '—'}
            {student.stream ? ' · ' + student.stream : ''}
          </span>
        </span>
        <Avatar student={student} size={34} />
        <svg
          className={`w-3.5 h-3.5 text-[#64748B] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden fade-in z-50">
          {/* Student summary */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <Avatar student={student} size={44} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#0F172A] truncate">
                  {studentName(student)}
                </p>
                <p className="mono text-[11px] text-[#B45309] truncate">
                  {studentAdm(student)}
                </p>
                <p className="text-[11px] text-[#64748B] truncate">
                  {student.class || '—'}
                  {student.stream ? ' ' + student.stream : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1.5">
            <a
              href={STUDENT_PORTAL_URL}
              className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] transition"
              onClick={() => setOpen(false)}
            >
              <div className="w-7 h-7 rounded-lg bg-[#F8FAFC] ring-1 ring-slate-200 flex items-center justify-center shrink-0">
                <svg
                  className="w-3.5 h-3.5 text-[#0A1E3D]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M3 12l9-9 9 9" />
                  <path d="M5 10v10h14V10" />
                </svg>
              </div>
              <span className="flex-1">Return to Student Portal</span>
              <svg
                className="w-3.5 h-3.5 text-slate-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </a>

            <a
              href={`mailto:${SCHOOL_EMAIL}?subject=${encodeURIComponent(
                `CBT help — ${studentName(student)} (${studentAdm(student)})`
              )}`}
              className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] transition"
              onClick={() => setOpen(false)}
            >
              <div className="w-7 h-7 rounded-lg bg-[#FEF3C7] ring-1 ring-[#F59E0B]/40 flex items-center justify-center shrink-0">
                <svg
                  className="w-3.5 h-3.5 text-[#B45309]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <span className="flex-1">Help &amp; Support</span>
              <svg
                className="w-3.5 h-3.5 text-slate-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* Sign out */}
          <div className="border-t border-slate-100 py-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition"
            >
              <div className="w-7 h-7 rounded-lg bg-red-50 ring-1 ring-red-200 flex items-center justify-center shrink-0">
                <svg
                  className="w-3.5 h-3.5 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </div>
              <span className="flex-1 text-left">Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   LoginScreen
   ═══════════════════════════════════════════════════════════════ */
function LoginScreen({
  onLogin,
  showToast,
}: {
  onLogin: (student: Student) => void
  showToast: (m: string, t?: ToastTone) => void
}) {
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const adm = (form.elements.namedItem('student-adm') as HTMLInputElement).value
      .trim()
      .toUpperCase()
    const password = (
      form.elements.namedItem('student-password') as HTMLInputElement
    ).value
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Signing in…'
    }
    setBusy(true)

    try {
      try {
        await ensureAuthSession()
      } catch (e) {
        console.warn('[IRIS CBT] auth bootstrap failed during login:', e)
      }

      const { data: rows, error } = await supabase
        .from('students')
        .select('*')
        .eq('adm', adm)
        .limit(1)

      if (error || !rows?.[0]) {
        showToast('Admission number not found.', 'error')
        if (btn) {
          btn.disabled = false
          btn.textContent = 'Sign In'
        }
        setBusy(false)
        return
      }
      const found = rows[0] as Student

      if (!found.cbt_password || found.cbt_password !== password) {
        showToast('Incorrect CBT password.', 'error')
        if (btn) {
          btn.disabled = false
          btn.textContent = 'Sign In'
        }
        setBusy(false)
        return
      }

      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ id: found.id, adm: studentAdm(found) })
      )
      onLogin(found)
      showToast(`Welcome, ${studentName(found).split(' ')[0]}.`)
    } catch (err: any) {
      showToast(err?.message || 'Login failed.', 'error')
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Sign In'
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cbt-login-bg fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-[440px] fade-in py-4">
        <div className="text-center mb-6">
          <div className="w-24 h-24 mx-auto rounded-2xl bg-white ring-1 ring-white/20 shadow-2xl flex items-center justify-center p-3">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQfjJJYVXvfa6ht32dukVuAAxlQhVGtlozh8SeyZyOcRaNsap1YrcDEAuuC&s=10"
              alt="School Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="mt-5 serif-display text-2xl text-white">
            Ibadu Rahman International School
          </h1>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="h-px w-8 bg-[#F59E0B]/50" />
            <p className="text-[10px] uppercase tracking-[0.32em] text-[#F59E0B] font-bold">
              CBT Exam Portal
            </p>
            <span className="h-px w-8 bg-[#F59E0B]/50" />
          </div>
          <p className="mt-2.5 text-[12px] text-slate-300/80">
            Enter your admission number and CBT password to begin.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-white/10 overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-slate-100">
            <h2 className="font-semibold text-[#0F172A] text-base">
              Student Sign In
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Your credentials were provided by the school.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#0A1E3D] mb-1.5">
                Admission Number
              </label>
              <div className="relative">
                <svg
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M4 7h16M4 12h16M4 17h10" />
                </svg>
                <input
                  name="student-adm"
                  type="text"
                  required
                  placeholder="IRIS/2026/001"
                  autoComplete="username"
                  autoCapitalize="characters"
                  className="mono w-full pl-9 pr-3 py-2.5 bg-[#F8FAFC] border border-slate-200 rounded-lg text-sm uppercase placeholder:text-slate-400 placeholder:normal-case focus:bg-white focus:ring-2 focus:ring-[#F59E0B]/30 focus:border-[#F59E0B] outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#0A1E3D] mb-1.5">
                CBT Password
              </label>
              <div className="relative">
                <svg
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 1 1 8 0v4" />
                </svg>
                <input
                  name="student-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#F8FAFC] border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#F59E0B]/30 focus:border-[#F59E0B] outline-none transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full mt-1 bg-[#0A1E3D] hover:bg-[#133057] text-white font-semibold py-3 rounded-lg text-sm shadow-lg shadow-[#0A1E3D]/20 transition disabled:opacity-60 disabled:cursor-wait"
            >
              Sign In
            </button>
          </form>

          <div className="px-6 pb-5 pt-1">
            <a
              href={STUDENT_PORTAL_URL}
              className="w-full text-xs font-semibold text-[#0A1E3D] hover:text-[#F59E0B] py-2.5 rounded-lg border border-slate-200 hover:border-[#F59E0B]/50 transition flex items-center justify-center gap-2"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M3 12l9-9 9 9" />
                <path d="M5 10v10h14V10" />
              </svg>
              Go to Student Portal
            </a>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-5">
          © {new Date().getFullYear()} Ibadu Rahman International School · CBT
          Suite
        </p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN — CBTPortal
   ═══════════════════════════════════════════════════════════════ */
export default function CBTPortal() {
  /* ── Auth ── */
  const [student, setStudent] = useState<Student | null>(null)
  const [booting, setBooting] = useState(true)

  /* ── Flow ── */
  const [flow, setFlow] = useState<ExamFlowStep>('login')

  /* ── Data ── */
  const [exams, setExams] = useState<Exam[]>([])
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [termSettings, setTermSettings] = useState<TermSetting[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  /* ── Exam session state ── */
  const [showInstruction, setShowInstruction] = useState<Exam | null>(null)
  const [session, setSession] = useState<ExamSession | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)

  /* ── UI ── */
  const [toasts, setToasts] = useState<Toast[]>([])
  const [syncState, setSyncState] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting')

  const realtimeRef = useRef<any>(null)
  const deepLinkRef = useRef<string | null>(null)

  /* ═══ TOASTS ═══ */
  const showToast = useCallback((msg: string, tone: ToastTone = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, tone }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }, [])

  /* ═══ BOOT ═══ */
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        try {
          await ensureAuthSession()
        } catch (e) {
          console.warn('[IRIS CBT] Auth bootstrap during boot failed:', e)
        }

        const raw = readSession()
        if (!raw) {
          if (mounted) {
            setBooting(false)
            setFlow('login')
          }
          return
        }
        let parsed: { id: string }
        try {
          parsed = JSON.parse(raw)
        } catch {
          clearSession()
          if (mounted) {
            setBooting(false)
            setFlow('login')
          }
          return
        }
        if (!parsed?.id) {
          clearSession()
          if (mounted) {
            setBooting(false)
            setFlow('login')
          }
          return
        }

        const { data: rows, error } = await supabase
          .from('students')
          .select('*')
          .eq('id', parsed.id)
          .limit(1)

        if (error || !rows?.[0]) {
          clearSession()
          if (mounted) {
            setBooting(false)
            setFlow('login')
          }
          return
        }

        if (mounted) {
          setStudent(rows[0] as Student)
          setBooting(false)
          setFlow('dashboard')
        }
      } catch (e) {
        console.warn('[IRIS CBT] Boot failed:', e)
        clearSession()
        if (mounted) {
          setBooting(false)
          setFlow('login')
        }
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  /* ═══ LOADERS ═══ */
  const loadTermSettings = useCallback(async () => {
    const { data } = await supabase
      .from('term_settings')
      .select('*')
      .eq('session', DEFAULT_SESSION)
      .order('term')
    setTermSettings((data as TermSetting[]) || [])
  }, [])

  const loadExamsForStudent = useCallback(async (s: Student) => {
    const className = s.class || ''

    let q = supabase
      .from('exams')
      .select('*')
      .eq('class', className)
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    if (s.stream) q = q.eq('stream', s.stream)
    else q = q.is('stream', null)

    const { data, error } = await q
    if (error) {
      console.warn('[IRIS CBT] loadExams error:', error)
      setExams([])
      return
    }

    const list = ((data as Exam[]) || []).filter(
      ex => !ex.session || ex.session === DEFAULT_SESSION
    )
    setExams(list)
  }, [])

  const loadAttemptsForStudent = useCallback(async (s: Student) => {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('student_id', s.id)
      .order('started_at', { ascending: false })

    if (error) {
      console.warn('[IRIS CBT] loadAttempts error:', error)
      setAttempts([])
      return
    }
    setAttempts((data as ExamAttempt[]) || [])
  }, [])

  const loadAll = useCallback(
    async (s: Student) => {
      setLoadingMeta(true)
      try {
        await Promise.all([
          loadTermSettings(),
          loadExamsForStudent(s),
          loadAttemptsForStudent(s),
        ])
      } finally {
        setLoadingMeta(false)
      }
    },
    [loadTermSettings, loadExamsForStudent, loadAttemptsForStudent]
  )

  useEffect(() => {
    if (!student) return
    loadAll(student)
  }, [student, loadAll])

  /* ═══ REALTIME ═══ */
  useEffect(() => {
    if (!student) return
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current)

    const ch = supabase
      .channel('iris-cbt-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exams' },
        () => loadExamsForStudent(student)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_attempts' },
        () => loadAttemptsForStudent(student)
      )
      .subscribe(status => {
        setSyncState(
          status === 'SUBSCRIBED'
            ? 'connected'
            : status === 'CLOSED'
            ? 'disconnected'
            : 'connecting'
        )
      })

    realtimeRef.current = ch
    return () => {
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current)
        realtimeRef.current = null
      }
    }
  }, [student, loadExamsForStudent, loadAttemptsForStudent])

  /* ═══ QUESTION LOADER ═══ */
  const loadQuestions = useCallback(async (exam: Exam): Promise<Question[]> => {
    try {
      const { data: byExam, error: examErr } = await supabase
        .from('questions')
        .select('*')
        .eq('exam_id', exam.id)
        .order('created_at', { ascending: true })

      if (!examErr && byExam && byExam.length > 0) {
        return byExam as Question[]
      }
      if (examErr) {
        console.warn(
          '[IRIS CBT] exam_id query failed, falling back:',
          examErr.message
        )
      }
    } catch (e) {
      console.warn('[IRIS CBT] exam_id query threw, falling back:', e)
    }

    const { data: bySubject, error: subErr } = await supabase
      .from('questions')
      .select('*')
      .eq('subject', exam.subject)
      .eq('class', exam.class)
      .order('created_at', { ascending: true })

    if (subErr) {
      console.error('[IRIS CBT] Fallback query also failed:', subErr)
      throw new Error(subErr.message)
    }

    return (bySubject as Question[]) || []
  }, [])

  /* ═══ LOGIN HANDLER ═══ */
  const handleLogin = useCallback((s: Student) => {
    setStudent(s)
    setFlow('dashboard')
  }, [])

  /* ═══ LOGOUT ═══ */
  const handleLogout = useCallback(async () => {
    if (flow === 'exam') {
      const ok = window.confirm(
        'You are in the middle of an exam. Signing out will save your progress but you can resume later. Continue?'
      )
      if (!ok) return
    }
    clearSession()
    try {
      await supabase.auth.signOut()
    } catch {}
    authReadyPromise = null
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current)
      realtimeRef.current = null
    }
    setStudent(null)
    setExams([])
    setAttempts([])
    setSession(null)
    setShowInstruction(null)
    setSubmitResult(null)
    setFlow('login')
    showToast('Signed out.', 'info')
  }, [flow, showToast])

  /* ═══ RESUME ATTEMPT ═══ */
  const resumeAttempt = useCallback(
    async (exam: Exam, attemptId: number | string) => {
      try {
        const { data: attemptRow, error: aErr } = await supabase
          .from('exam_attempts')
          .select('*')
          .eq('id', attemptId)
          .single()

        if (aErr || !attemptRow) {
          showToast('Could not resume attempt.', 'error')
          return
        }
        const attempt = attemptRow as ExamAttempt

        const questions = await loadQuestions(exam)
        if (questions.length === 0) {
          showToast(
            'This exam has no questions yet. Contact your exam officer.',
            'error'
          )
          return
        }

        const objectiveQuestions = questions.filter(q => q.type === 'objective')
        const theoryQuestions = questions.filter(q => q.type === 'theory')
        const orderedQuestions = [...objectiveQuestions, ...theoryQuestions]

        const mergedAnswers: Record<string, string> = {}
        Object.entries(attempt.answers || {}).forEach(([k, v]) => {
          mergedAnswers[k] = String(v)
        })

        const originalStartMs = new Date(attempt.started_at).getTime()
        const extendedMs = (attempt.extended_minutes || 0) * 60 * 1000
        const totalDurationMs = (exam.duration || 45) * 60 * 1000 + extendedMs

        setSession({
          exam,
          attempt,
          questions: orderedQuestions,
          objectiveQuestions,
          theoryQuestions,
          answers: mergedAnswers,
          currentQuestionIndex: Math.min(
            Math.max(0, (attempt.current_question || 1) - 1),
            orderedQuestions.length - 1
          ),
          startedAt: originalStartMs,
          durationMs: totalDurationMs,
          flaggedQuestions: new Set(),
          tabSwitchCount: attempt.tab_switch_count || 0,
        })
        setFlow('exam')
        showToast('Resuming exam…', 'info')
      } catch (e: any) {
        showToast('Error resuming exam: ' + (e?.message || 'unknown'), 'error')
      }
    },
    [loadQuestions, showToast]
  )

  /* ═══ DEEP-LINK ═══ */
  useEffect(() => {
    if (!student) return
    if (loadingMeta) return
    if (flow === 'exam') return
    if (typeof window === 'undefined') return

    if (deepLinkRef.current === '') return
    const params = new URLSearchParams(window.location.search)
    const examId = params.get('exam')
    if (!examId) {
      deepLinkRef.current = ''
      return
    }
    if (deepLinkRef.current === examId) return
    deepLinkRef.current = examId

    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('exam')
      window.history.replaceState({}, '', url.toString())
    } catch {}

    const target = exams.find(e => e.id === examId)
    if (!target) {
      showToast('Exam not found or not available for your class.', 'warn')
      return
    }

    const attempt = attempts.find(a => a.exam_id === target.id) || null
    const state = examCardState(target, attempt)

    if (state === 'in_progress' && attempt) {
      resumeAttempt(target, attempt.id)
    } else if (state === 'not_started' || state === 'upcoming') {
      setShowInstruction(target)
      setFlow('instructions')
    } else if (state === 'submitted') {
      showToast('This exam has already been submitted.', 'warn')
    } else if (state === 'missed' || state === 'unavailable') {
      showToast('This exam window is closed.', 'warn')
    }
  }, [student, loadingMeta, flow, exams, attempts, showToast, resumeAttempt])

  /* ═══ START EXAM (from dashboard) ═══ */
  const handleStartExam = useCallback(
    async (examId: string, existingAttemptId?: number | string) => {
      if (!student) return
      const exam = exams.find(e => e.id === examId)
      if (!exam) {
        showToast('Exam not found.', 'error')
        return
      }
      if (existingAttemptId) {
        await resumeAttempt(exam, existingAttemptId)
        return
      }
      setShowInstruction(exam)
      setFlow('instructions')
    },
    [student, exams, resumeAttempt, showToast]
  )

  /* ═══ START FROM INSTRUCTIONS — jumps to welcome splash, then exam ═══ */
  const handleStartFromInstruction = useCallback(async () => {
    if (!student || !showInstruction) return
    const exam = showInstruction
    try {
      await ensureAuthSession()

      const durationMs = (exam.duration || 45) * 60 * 1000

      const { data: attemptRow, error } = await supabase
        .from('exam_attempts')
        .insert({
          student_id: student.id,
          exam_id: exam.id,
          exam_title: exam.title,
          subject: exam.subject,
          class: exam.class,
          stream: exam.stream,
          session: DEFAULT_SESSION,
          status: 'in_progress',
          current_question: 0,
          total_questions: 0,
          score: 0,
          max_score: 0,
          flags: 0,
          tab_switch_count: 0,
          extended_minutes: 0,
          answers: {},
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error || !attemptRow) {
        showToast(
          'Could not start exam: ' + (error?.message || 'unknown'),
          'error'
        )
        return
      }

      let questions = await loadQuestions(exam)
      if (questions.length === 0) {
        showToast(
          'This exam has no questions yet. Contact your exam officer.',
          'error'
        )
        await supabase.from('exam_attempts').delete().eq('id', attemptRow.id)
        return
      }

      let objectiveQuestions = questions.filter(q => q.type === 'objective')
      let theoryQuestions = questions.filter(q => q.type === 'theory')

      if (exam.shuffle_questions) {
        objectiveQuestions = shuffleArray(objectiveQuestions)
        theoryQuestions = shuffleArray(theoryQuestions)
      }

      const orderedQuestions = [...objectiveQuestions, ...theoryQuestions]

      const objMaxScore = objectiveQuestions.reduce(
        (sum, q) => sum + (q.marks || 0),
        0
      )
      const theoryMaxScore = theoryQuestions.reduce(
        (sum, q) => sum + (q.marks || 0),
        0
      )

      await robustUpdateAttempt(attemptRow.id, {
        total_questions: orderedQuestions.length,
        max_score: objMaxScore,
        last_activity_at: new Date().toISOString(),
      })

      setSession({
        exam,
        attempt: {
          ...(attemptRow as ExamAttempt),
          total_questions: orderedQuestions.length,
          max_score: objMaxScore + theoryMaxScore,
        },
        questions: orderedQuestions,
        objectiveQuestions,
        theoryQuestions,
        answers: {},
        currentQuestionIndex: 0,
        startedAt: Date.now(),
        durationMs,
        flaggedQuestions: new Set(),
        tabSwitchCount: 0,
      })
      setShowInstruction(null)
      setFlow('welcome')
    } catch (e: any) {
      showToast('Error starting exam: ' + (e?.message || 'unknown'), 'error')
    }
  }, [student, showInstruction, loadQuestions, showToast])

  /* ═══ WELCOME SPLASH → EXAM ═══ */
  const handleWelcomeComplete = useCallback(() => {
    setFlow('exam')
    showToast('Exam started. Good luck!', 'success')
  }, [showToast])

  /* ═══ SUBMIT RESULT ═══ */
  const handleSubmitResult = useCallback(
    (result: SubmitResult) => {
      setSubmitResult(result)
      setSession(null)
      setShowInstruction(null)
      setFlow('submitted')
      if (student) loadAttemptsForStudent(student)
    },
    [student, loadAttemptsForStudent]
  )

  /* ═══ BACK TO DASHBOARD ═══ */
  const handleBackToDashboard = useCallback(async () => {
    if (session) {
      const objAnswers: Record<string, string> = {}
      session.questions.forEach(q => {
        const ans = session.answers[q.id]
        if (ans !== undefined && ans !== '' && q.type === 'objective') {
          objAnswers[q.id] = ans
        }
      })
      await robustUpdateAttempt(session.attempt.id, {
        answers: objAnswers,
        current_question: session.currentQuestionIndex + 1,
        last_activity_at: new Date().toISOString(),
      })
    }

    setSubmitResult(null)
    setSession(null)
    setShowInstruction(null)
    setFlow('dashboard')
    if (student) await loadAttemptsForStudent(student)
  }, [session, student, loadAttemptsForStudent])

  /* ═══ DERIVED ═══ */
  const examCards = useMemo(
    () =>
      exams.map(exam => {
        const attempt = attempts.find(a => a.exam_id === exam.id) || null
        return { exam, attempt, state: examCardState(exam, attempt) }
      }),
    [exams, attempts]
  )

  const stats = useMemo(() => {
    const c = {
      total: exams.length,
      inProgress: 0,
      submitted: 0,
      available: 0,
      missed: 0,
    }
    examCards.forEach(card => {
      if (card.state === 'in_progress') c.inProgress++
      else if (card.state === 'submitted') c.submitted++
      else if (card.state === 'not_started') c.available++
      else if (card.state === 'missed') c.missed++
    })
    return c
  }, [examCards, exams.length])

  /* ═══ RENDER — BOOTING ═══ */
  if (booting) {
    return (
      <>
        <GlobalStyles />
        <div className="cbt-dash-bg min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto rounded-xl bg-[#0A1E3D] flex items-center justify-center mb-3">
              <svg
                className="w-6 h-6 text-[#F59E0B] animate-spin"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <p className="text-xs font-medium tracking-wider uppercase text-[#64748B]">
              Loading CBT Portal…
            </p>
          </div>
        </div>
      </>
    )
  }

  /* ═══ RENDER — LOGIN ═══ */
  if (!student || flow === 'login') {
    return (
      <>
        <GlobalStyles />
        <LoginScreen onLogin={handleLogin} showToast={showToast} />
        <Toasts toasts={toasts} />
      </>
    )
  }

  /* ═══ RENDER — SUBMITTED ═══ */
  if (flow === 'submitted' && submitResult) {
    const submittedAttempt = attempts.find(
      a => a.id === submitResult.attemptId
    )
    const submittedExam =
      exams.find(e => e.id === submittedAttempt?.exam_id) || exams[0] || null

    if (submittedExam) {
      return (
        <>
          <GlobalStyles />
          <SubmittedScreen
            result={submitResult}
            exam={submittedExam}
            student={student}
            onBack={handleBackToDashboard}
          />
          <Toasts toasts={toasts} />
        </>
      )
    }
  }

  /* ═══ RENDER — WELCOME SPLASH ═══ */
  if (flow === 'welcome' && session) {
    return (
      <>
        <GlobalStyles />
        <WelcomeSplash
          exam={session.exam}
          student={student}
          onComplete={handleWelcomeComplete}
        />
      </>
    )
  }

  /* ═══ RENDER — EXAM ═══ */
  if (flow === 'exam' && session) {
    return (
      <>
        <GlobalStyles />
        <ExamShell
          session={session}
          setSession={setSession}
          onSubmit={handleSubmitResult}
          onExitAttempt={handleBackToDashboard}
          showToast={showToast}
        />
        <Toasts toasts={toasts} />
      </>
    )
  }

  /* ═══ RENDER — INSTRUCTIONS ═══ */
  if (flow === 'instructions' && showInstruction) {
    return (
      <>
        <GlobalStyles />
        <InstructionScreen
          exam={showInstruction}
          student={student}
          onStart={handleStartFromInstruction}
          onBack={() => {
            setShowInstruction(null)
            setFlow('dashboard')
          }}
        />
        <Toasts toasts={toasts} />
      </>
    )
  }

  /* ═══ RENDER — DASHBOARD ═══ */
  return (
    <>
      <GlobalStyles />
      <div className="cbt-dash-bg min-h-screen font-sans text-[#334155] antialiased flex flex-col">
        <Header
          student={student}
          syncState={syncState}
          onSignOut={handleLogout}
          disabled={flow === 'exam'}
        />

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
          {loadingMeta ? (
            <div className="text-center py-20 text-sm text-[#64748B] italic">
              Loading exams…
            </div>
          ) : (
            <CBTDashboard
              student={student}
              examCards={examCards}
              termSettings={termSettings}
              onStartExam={handleStartExam}
            />
          )}
        </main>

        <footer className="px-6 py-4 text-center text-[11px] text-[#64748B] border-t border-slate-200/70 bg-white/60">
          Ibadu Rahman International School · CBT Portal ·{' '}
          {new Date().getFullYear()}
        </footer>
      </div>

      <Toasts toasts={toasts} />
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════
   HEADER — top bar for the CBT dashboard
   ═══════════════════════════════════════════════════════════════ */
function Header({
  student,
  syncState,
  onSignOut,
  disabled,
}: {
  student: Student
  syncState: 'connecting' | 'connected' | 'disconnected'
  onSignOut: () => void
  disabled?: boolean
}) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/70">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white ring-1 ring-slate-200 flex items-center justify-center p-1.5 shrink-0">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQfjJJYVXvfa6ht32dukVuAAxlQhVGtlozh8SeyZyOcRaNsap1YrcDEAuuC&s=10"
              className="w-full h-full object-contain"
              alt="IRIS"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#F59E0B]">
              CBT Portal · {DEFAULT_SESSION}
            </p>
            <p className="text-sm font-semibold text-[#0F172A] truncate">
              My Exams
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F8FAFC] ring-1 ring-slate-200">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                syncState === 'connected'
                  ? 'bg-emerald-500'
                  : syncState === 'disconnected'
                  ? 'bg-red-500'
                  : 'bg-[#F59E0B] pulse-dot'
              }`}
            />
            <span className="text-[10px] font-semibold text-[#334155]">
              {syncState === 'connected'
                ? 'Live'
                : syncState === 'disconnected'
                ? 'Offline'
                : 'Connecting'}
            </span>
          </div>

          <HeaderDropdown
            student={student}
            onSignOut={onSignOut}
            disabled={disabled}
          />
        </div>
      </div>
    </header>
  )
}

/* ═══════════════════════════════════════════════════════════════
   END OF PART 2
   ═══════════════════════════════════════════════════════════════ */
   /* ═══════════════════════════════════════════════════════════════
   CBTDashboard — student hero + exam list
   ═══════════════════════════════════════════════════════════════ */
function CBTDashboard({
  student,
  examCards,
  termSettings,
  onStartExam,
}: {
  student: Student
  examCards: { exam: Exam; attempt: ExamAttempt | null; state: ExamCardState }[]
  termSettings: TermSetting[]
  onStartExam: (examId: string, attemptId?: number | string) => void
}) {
  const currentTerm = termSettings.find(t => t.is_current)
  const firstName = studentName(student).split(/[,\s]+/)[0] || 'Student'
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const sortedCards = useMemo(() => {
    const order: Record<ExamCardState, number> = {
      in_progress: 0,
      not_started: 1,
      upcoming: 2,
      unavailable: 3,
      submitted: 4,
      missed: 5,
    }
    return [...examCards].sort((a, b) => order[a.state] - order[b.state])
  }, [examCards])

  /* Counts for the hero hint */
  const readyCount = examCards.filter(c => c.state === 'not_started').length
  const inProgressCount = examCards.filter(c => c.state === 'in_progress').length

  return (
    <div className="iris-watermark space-y-5">
      {/* ═══ Welcome hero ═══ */}
      <div
        className="relative rounded-2xl p-6 sm:p-7 text-white shadow-xl overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at top right, rgba(245,158,11,.18), transparent 60%), linear-gradient(135deg, #0A1E3D 0%, #133057 60%, #1E4270 100%)',
        }}
      >
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-[#F59E0B]/10 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F59E0B]">
            {greeting}
          </p>
          <h1 className="mt-1.5 serif-display text-2xl sm:text-3xl">
            {firstName}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/85">
            <span className="mono font-semibold text-[#FCD34D]">
              {studentAdm(student)}
            </span>
            <span className="w-1 h-1 rounded-full bg-white/30" />
            <span className="font-medium">
              {student.class || '—'}
              {student.stream ? ' ' + student.stream : ''}
            </span>
            {currentTerm && (
              <>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span>
                  {currentTerm.term === '1st'
                    ? '1st Term'
                    : currentTerm.term === '2nd'
                    ? '2nd Term'
                    : '3rd Term'}{' '}
                  · {currentTerm.session}
                </span>
              </>
            )}
          </div>

          {(readyCount > 0 || inProgressCount > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {readyCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30 text-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                  {readyCount} ready
                </span>
              )}
              {inProgressCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-500/15 ring-1 ring-amber-400/30 text-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {inProgressCount} in progress
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Exam list ═══ */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 ring-1 ring-slate-200/70 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[#0F172A]">Scheduled Exams</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              {examCards.length === 0
                ? 'No exams assigned to your class yet.'
                : `${examCards.length} exam${
                    examCards.length === 1 ? '' : 's'
                  } · click Start to begin`}
            </p>
          </div>
          {examCards.length > 0 && (
            <span className="mono text-xs font-bold text-[#B45309] bg-[#FEF3C7] px-2.5 py-1 rounded-md">
              {examCards.length}
            </span>
          )}
        </div>

        {examCards.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="p-5 space-y-3">
            {sortedCards.map(card => (
              <ExamCard
                key={card.exam.id}
                exam={card.exam}
                attempt={card.attempt}
                state={card.state}
                onStart={() => onStartExam(card.exam.id, card.attempt?.id)}
                onViewInstructions={() =>
                  onStartExam(card.exam.id, card.attempt?.id)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* ═══ Footer note ═══ */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 ring-1 ring-slate-200/70 px-5 py-4">
        <p className="text-[11px] text-[#64748B] text-center">
          Need help? Contact your exam officer if you can&apos;t see an exam
          that should be listed, or if you have trouble signing in.
        </p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   EmptyState
   ═══════════════════════════════════════════════════════════════ */
function EmptyState() {
  return (
    <div className="p-12 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FEF3C7] ring-1 ring-[#F59E0B]/30 flex items-center justify-center">
        <svg
          className="w-7 h-7 text-[#B45309]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </div>
      <h3 className="mt-4 font-semibold text-[#0F172A]">No exams scheduled</h3>
      <p className="text-xs text-[#64748B] mt-1 max-w-md mx-auto">
        You don&apos;t have any exams scheduled right now. Check back later —
        your exam officer will publish them when ready.
      </p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ExamCard
   ═══════════════════════════════════════════════════════════════ */
function ExamCard({
  exam,
  attempt,
  state,
  onStart,
  onViewInstructions,
}: {
  exam: Exam
  attempt: ExamAttempt | null
  state: ExamCardState
  onStart: () => void
  onViewInstructions: () => void
}) {
  const badges: Record<
    ExamCardState,
    { label: string; tone: string; dot: string }
  > = {
    not_started: {
      label: 'Ready',
      tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      dot: 'bg-emerald-500',
    },
    upcoming: {
      label: 'Scheduled',
      tone: 'bg-slate-100 text-[#334155] ring-slate-200',
      dot: 'bg-slate-400',
    },
    in_progress: {
      label: 'In Progress',
      tone: 'bg-amber-50 text-amber-700 ring-amber-200',
      dot: 'bg-amber-500 pulse-dot',
    },
    submitted: {
      label: 'Submitted',
      tone: 'bg-[#FEF3C7] text-[#B45309] ring-[#F59E0B]/40',
      dot: 'bg-[#F59E0B]',
    },
    missed: {
      label: 'Missed',
      tone: 'bg-red-50 text-red-700 ring-red-200',
      dot: 'bg-red-500',
    },
    unavailable: {
      label: 'Window Closed',
      tone: 'bg-slate-100 text-[#334155] ring-slate-200',
      dot: 'bg-slate-400',
    },
  }
  const badge = badges[state]

  const windowText = (() => {
    const start = exam.start_at ? formatDateTime(exam.start_at) : null
    const end = exam.end_at ? formatDateTime(exam.end_at) : null
    if (start && end) return `Window: ${start} → ${end}`
    if (end) return `Closes: ${end}`
    if (start) return `Opens: ${start}`
    return 'Always available'
  })()

  const actionButton = (() => {
    if (state === 'not_started') {
      return (
        <button
          onClick={onViewInstructions}
          className="inline-flex items-center gap-2 bg-[#0A1E3D] hover:bg-[#133057] text-white font-semibold px-4 py-2.5 rounded-lg text-xs shadow-md shadow-[#0A1E3D]/20 transition active:scale-[0.98]"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
          Start Exam
        </button>
      )
    }
    if (state === 'in_progress') {
      return (
        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2.5 rounded-lg text-xs shadow-md shadow-amber-500/20 transition active:scale-[0.98]"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
          Resume Exam
        </button>
      )
    }
    if (state === 'upcoming') {
      return (
        <span className="inline-flex items-center gap-2 text-[#334155] bg-[#F8FAFC] ring-1 ring-slate-200 font-semibold px-4 py-2.5 rounded-lg text-xs">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Not open yet
        </span>
      )
    }
    if (state === 'submitted') {
      return (
        <span className="inline-flex items-center gap-2 text-[#B45309] bg-[#FEF3C7] ring-1 ring-[#F59E0B]/40 font-semibold px-4 py-2.5 rounded-lg text-xs">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
          Completed
        </span>
      )
    }
    if (state === 'missed') {
      return (
        <span className="inline-flex items-center gap-2 text-red-700 bg-red-50 ring-1 ring-red-200 font-semibold px-4 py-2.5 rounded-lg text-xs">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
          Missed
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-2 text-[#334155] bg-slate-100 ring-1 ring-slate-200 font-semibold px-4 py-2.5 rounded-lg text-xs">
        Closed
      </span>
    )
  })()

  const submittedMeta = state === 'submitted' && attempt?.submitted_at && (
    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#334155]">
      <span className="flex items-center gap-1.5">
        <svg
          className="w-3 h-3 text-emerald-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
        Submitted {timeAgo(attempt.submitted_at)}
      </span>
      <span className="w-1 h-1 rounded-full bg-slate-300" />
      <span>
        Time spent: {formatDuration(attempt.started_at, attempt.submitted_at)}
      </span>
    </div>
  )

  const progressMeta = state === 'in_progress' && attempt && (
    <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-amber-700">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold">Resume your exam to continue</span>
        <span className="mono">
          {attempt.current_question || 0} / {attempt.total_questions || '?'}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-500"
          style={{
            width: `${
              attempt.total_questions
                ? Math.min(
                    100,
                    Math.round(
                      (attempt.current_question / attempt.total_questions) * 100
                    )
                  )
                : 0
            }%`,
          }}
        />
      </div>
    </div>
  )

  const upcomingMeta = state === 'upcoming' && exam.start_at && (
    <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-[#64748B] flex items-center gap-2">
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span>Opens {formatDateTime(exam.start_at)}</span>
    </div>
  )

  const missedMeta = state === 'missed' && (
    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px] text-red-700">
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
      </svg>
      <span>
        You did not complete this exam within the window. Contact your exam
        officer if this is a mistake.
      </span>
    </div>
  )

  return (
    <div
      className={`rounded-xl ring-1 p-4 sm:p-5 transition ${
        state === 'in_progress'
          ? 'ring-2 ring-amber-500/50 bg-amber-50/40'
          : 'ring-slate-200 bg-white hover:ring-[#F59E0B]/40 hover:shadow-md'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h3 className="text-base font-bold text-[#0F172A] truncate">
              {exam.title}
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 uppercase tracking-wider ${badge.tone}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
            {exam.has_theory && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 ring-1 ring-purple-200 uppercase tracking-wider">
                Theory
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#334155]">
            <span className="flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M12 14l9-5-9-5-9 5 9 5z" />
                <path d="M12 14v7" />
              </svg>
              {exam.subject}
            </span>
            <span className="flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {exam.duration} min
            </span>
            {exam.total_marks && (
              <span className="mono flex items-center gap-1.5 font-semibold text-[#B45309]">
                {exam.total_marks} marks
              </span>
            )}
          </div>

          <p className="text-[11px] text-[#64748B] mt-1.5">{windowText}</p>
          {submittedMeta}
          {progressMeta}
          {upcomingMeta}
          {missedMeta}
        </div>

        <div className="shrink-0">{actionButton}</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   InstructionScreen — exam details + admin instructions
   ═══════════════════════════════════════════════════════════════ */
function InstructionScreen({
  exam,
  student,
  onStart,
  onBack,
}: {
  exam: Exam
  student: Student
  onStart: () => void
  onBack: () => void
}) {
  const [agreed, setAgreed] = useState(false)
  const [starting, setStarting] = useState(false)

  const instructions = getExamInstructions(exam)
  const instructionLines = instructions.split('\n').filter(l => l.trim())

  const now = Date.now()
  const startAt = exam.start_at ? new Date(exam.start_at).getTime() : null
  const endAt = exam.end_at ? new Date(exam.end_at).getTime() : null
  const windowOpen =
    (startAt === null || now >= startAt) && (endAt === null || now <= endAt)

  const handleStart = async () => {
    if (!agreed || !windowOpen) return
    setStarting(true)
    await onStart()
    setStarting(false)
  }

  return (
    <div className="cbt-dash-bg min-h-screen flex flex-col">
      <header className="bg-white/95 backdrop-blur border-b border-slate-200/70 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#0A1E3D] hover:text-[#F59E0B] transition"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F59E0B]">
            Exam Instructions
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="space-y-5">
          {/* ═══ Exam hero ═══ */}
          <div
            className="relative rounded-2xl p-6 sm:p-7 text-white shadow-xl overflow-hidden"
            style={{
              backgroundImage:
                'radial-gradient(ellipse at top right, rgba(245,158,11,.2), transparent 60%), linear-gradient(135deg, #0A1E3D 0%, #133057 60%, #1E4270 100%)',
            }}
          >
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-[#F59E0B]/10 blur-3xl" />
            <div className="relative">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F59E0B]">
                Ready to Begin
              </p>
              <h1 className="mt-1.5 serif-display text-2xl sm:text-3xl">
                {exam.title}
              </h1>
              <p className="mt-2 text-sm text-white/80">
                {exam.subject} · {exam.class}
                {exam.stream ? ' ' + exam.stream : ''}
              </p>

              <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <MetaItem
                  label="Duration"
                  value={`${exam.duration} min`}
                  icon={
                    <>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </>
                  }
                />
                <MetaItem
                  label="Total Marks"
                  value={exam.total_marks ? `${exam.total_marks}` : 'Auto'}
                  icon={
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  }
                />
                <MetaItem
                  label="Format"
                  value={exam.has_theory ? 'OBJ + Theory' : 'Objective Only'}
                  icon={
                    <>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </>
                  }
                />
              </div>
            </div>
          </div>

          {/* ═══ Student identity ═══ */}
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 ring-1 ring-slate-200/70 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-3">
              You are about to take this exam as
            </p>
            <div className="flex items-center gap-4">
              <Avatar student={student} size={56} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0F172A]">
                  {studentName(student)}
                </p>
                <p className="mono text-[11px] text-[#64748B]">
                  {studentAdm(student)}
                </p>
                <p className="text-[11px] text-[#64748B]">
                  {student.class || '—'}
                  {student.stream ? ' ' + student.stream : ''}
                </p>
              </div>
            </div>
          </div>

          {/* ═══ Instructions ═══ */}
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 ring-1 ring-slate-200/70 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#FEF3C7] ring-1 ring-[#F59E0B]/40 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-[#B45309]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
              </div>
              <h2 className="font-semibold text-[#0F172A] text-sm">
                Instructions — Read Carefully
              </h2>
            </div>
            <div className="p-6 space-y-3">
              {instructionLines.map((line, idx) => (
                <p
                  key={idx}
                  className="text-sm text-[#334155] leading-relaxed whitespace-pre-wrap"
                >
                  {line}
                </p>
              ))}
            </div>
          </div>

          {/* ═══ Agreement ═══ */}
          <div className="rounded-2xl bg-red-50 ring-1 ring-red-200 p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-100 ring-1 ring-red-200 flex items-center justify-center shrink-0">
                <svg
                  className="w-4 h-4 text-red-700"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
              </div>
              <div className="flex-1 text-xs text-red-900 space-y-1.5">
                <p className="font-bold">
                  By clicking &quot;Start Exam&quot;, you agree that:
                </p>
                <ul className="ml-4 list-disc space-y-1 text-red-800">
                  <li>Your timer begins immediately and cannot be paused.</li>
                  <li>
                    You must submit before the timer reaches zero, or your
                    answers will be auto-submitted.
                  </li>
                  <li>
                    Switching tabs, exiting fullscreen, or using copy/paste
                    will be recorded as flags on your attempt.
                  </li>
                  <li>You can only take this exam once.</li>
                </ul>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 p-4 bg-white rounded-2xl shadow-lg shadow-slate-200/50 ring-1 ring-slate-200/70 cursor-pointer select-none hover:ring-[#F59E0B]/50 transition">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-slate-300 text-[#F59E0B] focus:ring-[#F59E0B]"
            />
            <span className="text-sm text-[#0F172A] font-medium">
              I have read and understood the instructions above. I am ready to
              begin.
            </span>
          </label>

          {!windowOpen && (
            <div className="rounded-2xl bg-slate-100 ring-1 ring-slate-300 p-5 text-center">
              <p className="text-sm font-semibold text-[#0F172A]">
                ⏰ This exam window is not currently open.
              </p>
              <p className="text-xs text-[#64748B] mt-1">
                {startAt && now < startAt
                  ? `The exam opens at ${formatDateTime(exam.start_at)}.`
                  : `The exam closed at ${formatDateTime(exam.end_at)}.`}
              </p>
            </div>
          )}

          {/* ═══ Actions ═══ */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={onBack}
              disabled={starting}
              className="flex-1 px-5 py-3.5 rounded-xl text-sm font-semibold text-[#334155] bg-white ring-1 ring-slate-200 hover:bg-[#F8FAFC] transition disabled:opacity-50"
            >
              Go Back
            </button>
            <button
              onClick={handleStart}
              disabled={!agreed || !windowOpen || starting}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold shadow-md transition ${
                agreed && windowOpen && !starting
                  ? 'bg-[#0A1E3D] hover:bg-[#133057] text-white shadow-[#0A1E3D]/20 active:scale-[0.98]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {starting ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="9" opacity="0.25" />
                    <path d="M12 3a9 9 0 0 1 9 9" />
                  </svg>
                  Preparing…
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M5 3l14 9-14 9V3z" />
                  </svg>
                  Start Exam
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

function MetaItem({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/15 ring-1 ring-[#F59E0B]/30 flex items-center justify-center shrink-0">
        <svg
          className="w-4 h-4 text-[#F59E0B]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          {icon}
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider text-white/60">
          {label}
        </p>
        <p className="text-sm font-semibold text-white truncate">{value}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   WelcomeSplash — 2-second "Best of luck" transition
   ═══════════════════════════════════════════════════════════════ */
function WelcomeSplash({
  exam,
  student,
  onComplete,
}: {
  exam: Exam
  student: Student
  onComplete: () => void
}) {
  const firstName = studentName(student).split(/[,\s]+/)[0] || 'Student'

  useEffect(() => {
    const t = setTimeout(() => {
      onComplete()
    }, 2400)
    return () => clearTimeout(t)
  }, [onComplete])

  return (
    <div className="cbt-dash-bg fixed inset-0 z-50 flex items-center justify-center p-6 overflow-hidden">
      <div className="text-center scale-in max-w-lg">
        {/* Animated check burst */}
        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-2xl shadow-emerald-500/30 check-burst">
          <svg
            className="w-12 h-12 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="mt-6 serif-display text-3xl sm:text-4xl text-[#0F172A]">
          Best of luck, {firstName}!
        </h1>
        <p className="mt-3 text-sm text-[#64748B]">
          Your exam <strong className="text-[#0F172A]">{exam.title}</strong>{' '}
          is starting now.
        </p>

        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white ring-1 ring-slate-200 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
          <span className="text-[11px] font-semibold text-[#334155]">
            Loading questions…
          </span>
        </div>

        {/* Subtle progress bar */}
        <div className="mt-8 h-1 w-48 mx-auto rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#0A1E3D] to-[#F59E0B] progress-bar" />
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes progress {
              from { width: 0%; }
              to { width: 100%; }
            }
            .progress-bar {
              animation: progress 2.4s ease-in-out forwards;
            }
          `,
        }}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   END OF PART 3
   ═══════════════════════════════════════════════════════════════ */
   /* ═══════════════════════════════════════════════════════════════
   ExamShell — the exam-taking environment
   ═══════════════════════════════════════════════════════════════
   Features:
   • Single timer across OBJ + theory sections
   • Tiered auto-flagging (tab switch, fullscreen, right-click,
     copy/paste, dev tools, print)
   • Auto-save with 800ms debounce
   • Question navigator with flag-for-review
   • Double-confirm submit
   • Auto-submit on timer expiry
   ═══════════════════════════════════════════════════════════════ */

function ExamShell({
  session,
  setSession,
  onSubmit,
  onExitAttempt,
  showToast,
}: {
  session: ExamSession
  setSession: React.Dispatch<React.SetStateAction<ExamSession | null>>
  onSubmit: (result: SubmitResult) => void
  onExitAttempt: () => void
  showToast: (m: string, t?: ToastTone) => void
}) {
  const {
    exam,
    attempt,
    questions,
    objectiveQuestions,
    theoryQuestions,
    answers,
    currentQuestionIndex,
    flaggedQuestions,
  } = session

  const [showReview, setShowReview] = useState(false)
  const [showNavigator, setShowNavigator] = useState(false)
  const [timeLeft, setTimeLeft] = useState(() =>
    Math.max(0, session.durationMs - (Date.now() - session.startedAt))
  )
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /* ── Flag refs ── */
  const flagCountRef = useRef(attempt.flags || 0)
  const flagReasonsRef = useRef<string[]>([])
  const lastFlagAtRef = useRef<Record<string, number>>({})
  const copyAllowedRef = useRef(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoSubmittedRef = useRef(false)
  const submittingRef = useRef(false)

  const currentQuestion = questions[currentQuestionIndex] || null
  const totalQuestions = questions.length
  const objectiveCount = objectiveQuestions.length
  const theoryCount = theoryQuestions.length

  const isObjectiveSection = currentQuestionIndex < objectiveCount
  const sectionLabel = isObjectiveSection
    ? 'Section A — Objective'
    : 'Section B — Theory'
  const questionNumberInSection = isObjectiveSection
    ? currentQuestionIndex + 1
    : currentQuestionIndex - objectiveCount + 1
  const sectionTotal = isObjectiveSection ? objectiveCount : theoryCount

  const answeredCount = useMemo(
    () =>
      objectiveQuestions.filter(
        q => answers[q.id] !== undefined && answers[q.id] !== ''
      ).length,
    [objectiveQuestions, answers]
  )
  const flaggedCount = flaggedQuestions.size

  const objMarks = objectiveQuestions.reduce((sum, q) => sum + (q.marks || 0), 0)
  const theoryMarks = theoryQuestions.reduce(
    (sum, q) => sum + (q.marks || 0),
    0
  )

  /* ═══════════════════════════════════════════════════════════════
     TIERED FLAGGING ENGINE
     ═══════════════════════════════════════════════════════════════ */
  const recordFlag = useCallback(
    async (reason: FlagReason) => {
      /* Throttle: don't record the same reason more than once every 1.5s
         (prevents right-click spam from filling the log) */
      const now = Date.now()
      const last = lastFlagAtRef.current[reason] || 0
      if (now - last < 1500) return
      lastFlagAtRef.current[reason] = now

      flagCountRef.current += 1
      flagReasonsRef.current.push(reason)

      /* Show toast only for tier 2 (warn) */
      const tier = FLAG_TIER[reason]
      if (tier === 2) {
        const msg = FLAG_WARNINGS[reason]
        if (msg) showToast(msg, 'warn')
      }
      /* Tier 1 also shows a toast (it's the highest-priority) */
      if (tier === 1) {
        const msg = FLAG_WARNINGS[reason]
        if (msg) showToast(msg, 'warn')
      }
      /* Tier 3 is silent — the action itself is blocked */

      /* Persist to DB (fire and forget) */
      const reasonSummary = Array.from(new Set(flagReasonsRef.current)).join(',')
      robustUpdateAttempt(attempt.id, {
        flags: flagCountRef.current,
        flagged_reason: reasonSummary.slice(0, 500),
        last_activity_at: new Date().toISOString(),
      })
    },
    [attempt.id, showToast]
  )

  /* ── Effect: tiered event listeners ── */
  useEffect(() => {
    /* ═══════════════════════════════════════════════════════════════
       TIER 1 — Tab switch / window blur / fullscreen exit
       ═══════════════════════════════════════════════════════════════ */

    const handleVisibilityChange = () => {
      if (document.hidden) {
        /* Update local session state for tab switch count too */
        setSession(prev =>
          prev
            ? { ...prev, tabSwitchCount: prev.tabSwitchCount + 1 }
            : prev
        )
        recordFlag('tab_switch')
      }
    }

    const handleBlur = () => {
      /* Ignore blur if we're in a dialog (confirm, prompt) */
      if (document.hidden) return
      recordFlag('tab_switch')
    }

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        recordFlag('fullscreen_exit')
      }
    }

    /* ═══════════════════════════════════════════════════════════════
       TIER 2 — Right click, copy, paste
       ═══════════════════════════════════════════════════════════════ */

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      recordFlag('right_click')
    }

    const handleCopy = (e: ClipboardEvent) => {
      /* Allow copy if we explicitly set the flag (internal use) */
      if (copyAllowedRef.current) {
        copyAllowedRef.current = false
        return
      }
      e.preventDefault()
      recordFlag('copy_attempt')
    }

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault()
      recordFlag('copy_attempt')
    }

    const handlePaste = (e: ClipboardEvent) => {
      /* Check if target is an input/textarea — allow pasting from clipboard
         inside form fields (which we don't have here) but not elsewhere */
      const target = e.target as HTMLElement
      if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT') {
        return
      }
      e.preventDefault()
      recordFlag('paste_attempt')
    }

    /* ═══════════════════════════════════════════════════════════════
       TIER 3 — Dev tools, view source, print, screenshot
       ═══════════════════════════════════════════════════════════════ */

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()

      /* F12 */
      if (key === 'f12') {
        e.preventDefault()
        recordFlag('devtools_attempt')
        return
      }

      /* Ctrl/Cmd combos */
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.shiftKey) {
        /* Ctrl+Shift+I (devtools) */
        if (key === 'i') {
          e.preventDefault()
          recordFlag('devtools_attempt')
          return
        }
        /* Ctrl+Shift+J (console) */
        if (key === 'j') {
          e.preventDefault()
          recordFlag('devtools_attempt')
          return
        }
        /* Ctrl+Shift+C (element inspector) */
        if (key === 'c') {
          e.preventDefault()
          recordFlag('devtools_attempt')
          return
        }
        /* Ctrl+Shift+S (screenshot in some browsers) */
        if (key === 's') {
          e.preventDefault()
          recordFlag('screenshot_attempt')
          return
        }
      }

      if (mod) {
        /* Ctrl+U (view source) */
        if (key === 'u') {
          e.preventDefault()
          recordFlag('devtools_attempt')
          return
        }
        /* Ctrl+P (print) */
        if (key === 'p') {
          e.preventDefault()
          recordFlag('print_attempt')
          return
        }
        /* Ctrl+S (save page) */
        if (key === 's') {
          e.preventDefault()
          recordFlag('screenshot_attempt')
          return
        }
      }

      /* PrintScreen key */
      if (key === 'printscreen') {
        e.preventDefault()
        recordFlag('screenshot_attempt')
        return
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('copy', handleCopy)
    document.addEventListener('cut', handleCut)
    document.addEventListener('paste', handlePaste)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('cut', handleCut)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [recordFlag, setSession])

  /* ── Beforeunload warning ── */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  /* ═══════════════════════════════════════════════════════════════
     SUBMIT
     ═══════════════════════════════════════════════════════════════ */
  const performSubmit = useCallback(
    async (auto: boolean) => {
      if (submittingRef.current) return
      submittingRef.current = true
      setSubmitting(true)

      let score = 0
      objectiveQuestions.forEach(q => {
        const ans = answers[q.id]
        if (ans !== undefined) {
          const ansIndex = ['A', 'B', 'C', 'D'].indexOf(ans)
          if (ansIndex === q.correct_index) score += q.marks
        }
      })

      const hasTheory = theoryQuestions.length > 0
      const objAnswers: Record<string, string> = {}
      objectiveQuestions.forEach(q => {
        const ans = answers[q.id]
        if (ans !== undefined && ans !== '') objAnswers[q.id] = ans
      })

      /* Final flag summary */
      const finalFlagCount = flagCountRef.current
      const finalFlagSummary = Array.from(
        new Set(flagReasonsRef.current)
      ).join(',')

      const payload = {
        status: auto
          ? 'auto_submitted'
          : hasTheory
          ? 'pending_manual_marking'
          : 'submitted',
        submitted_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        answers: objAnswers,
        score,
        max_score: objMarks,
        current_question: totalQuestions,
        tab_switch_count: session.tabSwitchCount,
        flags: finalFlagCount,
        flagged_reason: finalFlagSummary.slice(0, 500) || null,
      }

      const res = await robustUpdateAttempt(attempt.id, payload)

      setSubmitting(false)

      if (!res.ok) {
        submittingRef.current = false
        showToast(
          `Submit failed: ${res.error || 'unknown'} (${res.code || 'no code'})`,
          'error'
        )
        return
      }

      onSubmit({
        attemptId: attempt.id,
        score,
        maxScore: objMarks,
        hasTheory,
        submittedAt: payload.submitted_at,
      })
    },
    [
      answers,
      objectiveQuestions,
      theoryQuestions,
      objMarks,
      totalQuestions,
      session.tabSwitchCount,
      attempt.id,
      onSubmit,
      showToast,
    ]
  )

  const handleAutoSubmit = useCallback(async () => {
    await performSubmit(true)
  }, [performSubmit])

  /* ═══════════════════════════════════════════════════════════════
     TIMER — single timer for entire exam
     ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const remaining = Math.max(
        0,
        session.durationMs - (Date.now() - session.startedAt)
      )
      setTimeLeft(remaining)
      if (remaining <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true
        handleAutoSubmit()
      }
    }, 1000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [session.durationMs, session.startedAt, handleAutoSubmit])

  /* ═══════════════════════════════════════════════════════════════
     AUTO-SAVE
     ═══════════════════════════════════════════════════════════════ */
  const scheduleAutoSave = useCallback(
    (updates: Record<string, any>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        setSaving(true)
        const res = await robustUpdateAttempt(attempt.id, {
          ...updates,
          last_activity_at: new Date().toISOString(),
        })
        if (res.ok) setLastSavedAt(new Date())
        setSaving(false)
      }, 800)
    },
    [attempt.id]
  )

  /* ═══════════════════════════════════════════════════════════════
     ANSWER HANDLERS
     ═══════════════════════════════════════════════════════════════ */
  const handleAnswerChange = (questionId: string, value: string) => {
    const updatedAnswers = { ...answers, [questionId]: value }
    setSession(prev => (prev ? { ...prev, answers: updatedAnswers } : prev))

    const objAnswers: Record<string, string> = {}
    objectiveQuestions.forEach(q => {
      const ans = updatedAnswers[q.id]
      if (ans !== undefined && ans !== '') objAnswers[q.id] = ans
    })

    scheduleAutoSave({ answers: objAnswers })
  }

  const handleToggleFlag = (questionId: string) => {
    setSession(prev => {
      if (!prev) return prev
      const next = new Set(prev.flaggedQuestions)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return { ...prev, flaggedQuestions: next }
    })
  }

  const handleGotoQuestion = (index: number) => {
    if (index < 0 || index >= totalQuestions) return
    setSession(prev =>
      prev ? { ...prev, currentQuestionIndex: index } : prev
    )
    setShowNavigator(false)
    scheduleAutoSave({ current_question: index + 1 })
  }

  const handleNext = () => handleGotoQuestion(currentQuestionIndex + 1)
  const handlePrev = () => handleGotoQuestion(currentQuestionIndex - 1)

  const handleSubmit = async () => {
    setShowReview(false)
    await performSubmit(false)
  }

  /* ═══════════════════════════════════════════════════════════════
     TIMER DISPLAY
     ═══════════════════════════════════════════════════════════════ */
  const minutes = Math.floor(timeLeft / 60000)
  const seconds = Math.floor((timeLeft % 60000) / 1000)
  const isUrgent = timeLeft <= 5 * 60 * 1000
  const isCritical = timeLeft <= 60 * 1000
  const timerTone = isCritical
    ? 'text-red-700 bg-red-50 ring-red-300'
    : isUrgent
    ? 'text-amber-700 bg-amber-50 ring-amber-300'
    : 'text-[#0A1E3D] bg-white ring-slate-200'

  if (!currentQuestion) {
    return (
      <div className="cbt-dash-bg min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200/70 p-8 max-w-md text-center">
          <h2 className="text-lg font-bold text-[#0F172A]">No Questions</h2>
          <p className="text-sm text-[#64748B] mt-2">
            This exam has no questions yet. Please contact the exam officer.
          </p>
          <button
            onClick={onExitAttempt}
            className="mt-5 bg-[#0A1E3D] hover:bg-[#133057] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="cbt-dash-bg min-h-screen flex flex-col">
      {/* ═══ Header ═══ */}
      <header className="bg-white border-b border-slate-200/70 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#0A1E3D] text-[#F59E0B] flex items-center justify-center mono text-xs font-bold shrink-0">
              {currentQuestionIndex + 1}
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#F59E0B] truncate">
                {sectionLabel}
              </p>
              <p className="text-xs font-medium text-[#334155] mono">
                {answeredCount} / {objectiveCount} answered
                {flaggedCount > 0 && (
                  <span className="ml-3 text-amber-600 font-semibold">
                    ⚑ {flaggedCount}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl ring-1 transition-all ${timerTone} ${
              isUrgent ? 'animate-pulse' : ''
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span className="mono text-base font-bold tabular-nums">
              {String(minutes).padStart(2, '0')}:
              {String(seconds).padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNavigator(v => !v)}
              className="lg:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A1E3D] hover:bg-[#F8FAFC] px-3 py-2 rounded-lg transition"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              onClick={() => setShowReview(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#0A1E3D] hover:bg-[#133057] text-white px-4 py-2.5 rounded-lg shadow-md shadow-[#0A1E3D]/20 transition"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              Review &amp; Submit
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-[#0A1E3D] to-[#F59E0B] transition-all duration-500"
            style={{
              width: `${
                objectiveCount ? (answeredCount / objectiveCount) * 100 : 0
              }%`,
            }}
          />
        </div>
      </header>

      {/* ═══ Content ═══ */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <main className="space-y-4">
          {/* Section banner on first question of each section */}
          {(currentQuestionIndex === 0 ||
            currentQuestionIndex === objectiveCount) && (
            <div
              className={`rounded-xl px-4 py-3 flex items-center gap-3 ${
                isObjectiveSection
                  ? 'bg-[#0A1E3D] text-white'
                  : 'bg-gradient-to-r from-[#F59E0B] to-[#B45309] text-white'
              }`}
            >
              <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <span className="mono text-xs font-bold">
                  {isObjectiveSection ? 'A' : 'B'}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider">
                  {isObjectiveSection
                    ? 'Section A — Objective'
                    : 'Section B — Theory'}
                </p>
                <p className="text-[11px] opacity-85">
                  {isObjectiveSection
                    ? `${objectiveCount} question${
                        objectiveCount === 1 ? '' : 's'
                      } · ${objMarks} marks total`
                    : `${theoryCount} question${
                        theoryCount === 1 ? '' : 's'
                      } · ${theoryMarks} marks total · Write answers in your booklet`}
                </p>
              </div>
            </div>
          )}

          {/* Question card */}
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 ring-1 ring-slate-200/70 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-[#F8FAFC]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="mono text-[11px] font-bold text-[#0A1E3D]">
                  Q{questionNumberInSection} / {sectionTotal}
                </span>
                <span className="text-[10px] text-slate-400">·</span>
                <span className="mono text-[11px] text-[#64748B]">
                  Overall {currentQuestionIndex + 1} / {totalQuestions}
                </span>
                <span
                  className={`ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 uppercase tracking-wider ${
                    currentQuestion.type === 'theory'
                      ? 'bg-purple-50 text-purple-700 ring-purple-200'
                      : 'bg-blue-50 text-blue-700 ring-blue-200'
                  }`}
                >
                  {currentQuestion.type === 'objective' ? 'Objective' : 'Theory'}
                </span>
                <span className="mono ml-1 text-[10px] font-bold text-[#B45309] bg-[#FEF3C7] px-2 py-0.5 rounded-md ring-1 ring-[#F59E0B]/30">
                  {currentQuestion.marks} mark
                  {currentQuestion.marks === 1 ? '' : 's'}
                </span>
              </div>
              <button
                onClick={() => handleToggleFlag(currentQuestion.id)}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition ${
                  flaggedQuestions.has(currentQuestion.id)
                    ? 'text-amber-700 bg-amber-50 ring-1 ring-amber-200'
                    : 'text-[#64748B] hover:bg-slate-100'
                }`}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill={
                    flaggedQuestions.has(currentQuestion.id)
                      ? 'currentColor'
                      : 'none'
                  }
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M4 21V4a1 1 0 0 1 1-1h14l-4 6 4 6H5" />
                </svg>
                {flaggedQuestions.has(currentQuestion.id) ? 'Flagged' : 'Flag'}
              </button>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              <div>
                <p className="text-base text-[#0F172A] leading-relaxed whitespace-pre-wrap">
                  {currentQuestion.prompt}
                </p>
              </div>

              {currentQuestion.type === 'objective' &&
              currentQuestion.options ? (
                <div className="space-y-2.5">
                  {(currentQuestion.options as string[]).map((opt, idx) => {
                    const letter = String.fromCharCode(65 + idx)
                    const selected = answers[currentQuestion.id] === letter
                    return (
                      <label
                        key={idx}
                        className={`flex items-start gap-3 p-4 rounded-xl ring-1 cursor-pointer transition-all ${
                          selected
                            ? 'bg-[#FEF3C7] ring-[#F59E0B]/60 shadow-sm'
                            : 'bg-white ring-slate-200 hover:ring-[#F59E0B]/40 hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${currentQuestion.id}`}
                          value={letter}
                          checked={selected}
                          onChange={() =>
                            handleAnswerChange(currentQuestion.id, letter)
                          }
                          className="sr-only"
                        />
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center mono font-bold text-sm shrink-0 transition ${
                            selected
                              ? 'bg-[#0A1E3D] text-[#F59E0B]'
                              : 'bg-slate-100 text-[#334155] ring-1 ring-slate-200'
                          }`}
                        >
                          {letter}
                        </div>
                        <span
                          className={`text-sm flex-1 pt-1.5 ${
                            selected
                              ? 'text-[#0F172A] font-semibold'
                              : 'text-[#334155]'
                          }`}
                        >
                          {opt}
                        </span>
                        {selected && (
                          <svg
                            className="w-5 h-5 text-[#F59E0B] shrink-0 mt-2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                          >
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl bg-purple-50 ring-1 ring-purple-200 p-5 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 ring-1 ring-purple-200 flex items-center justify-center shrink-0">
                      <svg
                        className="w-5 h-5 text-purple-700"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-purple-900">
                        Write your answer in the answer booklet.
                      </p>
                      <p className="text-xs text-purple-800 mt-1 leading-relaxed">
                        This question carries{' '}
                        <strong>
                          {currentQuestion.marks} mark
                          {currentQuestion.marks === 1 ? '' : 's'}
                        </strong>
                        . Read it carefully, plan your answer, and write it
                        clearly in your booklet.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#F8FAFC] ring-1 ring-slate-200 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-[#64748B]">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      Use your time wisely. You can return to this question
                      before submitting.
                    </div>
                    <span className="mono text-xs font-bold text-[#B45309]">
                      {currentQuestion.marks} mark
                      {currentQuestion.marks === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handlePrev}
              disabled={currentQuestionIndex === 0}
              className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition ${
                currentQuestionIndex === 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-white text-[#334155] ring-1 ring-slate-200 hover:bg-[#F8FAFC]'
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>

            <div className="text-center hidden sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-wider">
                {saving ? (
                  <span className="text-amber-600">Saving…</span>
                ) : lastSavedAt ? (
                  <span className="text-emerald-600">
                    ✓ Saved {lastSavedAt.toLocaleTimeString()}
                  </span>
                ) : (
                  <span className="text-[#64748B]">
                    Auto-saves as you answer
                  </span>
                )}
              </p>
            </div>

            {currentQuestionIndex === totalQuestions - 1 ? (
              <button
                onClick={() => setShowReview(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-md active:scale-[0.98]"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
                Review &amp; Submit
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white bg-[#0A1E3D] hover:bg-[#133057] transition shadow-md shadow-[#0A1E3D]/20 active:scale-[0.98]"
              >
                Next
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </main>

        {/* Desktop navigator */}
        <aside className="hidden lg:block">
          <QuestionNavigator
            objectiveQuestions={objectiveQuestions}
            theoryQuestions={theoryQuestions}
            allQuestions={questions}
            answers={answers}
            flaggedQuestions={flaggedQuestions}
            currentIndex={currentQuestionIndex}
            onGoto={handleGotoQuestion}
          />
        </aside>
      </div>

      {/* Mobile navigator drawer */}
      {showNavigator && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowNavigator(false)}
        >
          <div
            className="absolute right-0 top-0 bottom-0 w-[320px] bg-white shadow-2xl overflow-y-auto scroll-thin"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
              <p className="font-semibold text-[#0F172A] text-sm">
                Question Navigator
              </p>
              <button
                onClick={() => setShowNavigator(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <QuestionNavigator
                objectiveQuestions={objectiveQuestions}
                theoryQuestions={theoryQuestions}
                allQuestions={questions}
                answers={answers}
                flaggedQuestions={flaggedQuestions}
                currentIndex={currentQuestionIndex}
                onGoto={handleGotoQuestion}
              />
            </div>
          </div>
        </div>
      )}

      {/* Review modal */}
      {showReview && (
        <ReviewModal
          exam={exam}
          objectiveQuestions={objectiveQuestions}
          theoryQuestions={theoryQuestions}
          allQuestions={questions}
          answers={answers}
          flaggedQuestions={flaggedQuestions}
          submitting={submitting}
          onGoto={idx => {
            handleGotoQuestion(idx)
            setShowReview(false)
          }}
          onCancel={() => setShowReview(false)}
          onConfirm={handleSubmit}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   QuestionNavigator
   ═══════════════════════════════════════════════════════════════ */
function QuestionNavigator({
  objectiveQuestions,
  theoryQuestions,
  allQuestions,
  answers,
  flaggedQuestions,
  currentIndex,
  onGoto,
}: {
  objectiveQuestions: Question[]
  theoryQuestions: Question[]
  allQuestions: Question[]
  answers: Record<string, string>
  flaggedQuestions: Set<string>
  currentIndex: number
  onGoto: (index: number) => void
}) {
  return (
    <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 ring-1 ring-slate-200/70 overflow-hidden sticky top-20">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <p className="font-semibold text-[#0F172A] text-sm">Questions</p>
        <span className="mono text-[10px] font-bold text-[#64748B]">
          {allQuestions.length} total
        </span>
      </div>
      <div className="p-5 space-y-5 max-h-[calc(100vh-200px)] overflow-y-auto scroll-thin">
        {objectiveQuestions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="mono text-[10px] font-bold text-[#0A1E3D] bg-[#F8FAFC] px-2 py-0.5 rounded ring-1 ring-slate-200">
                A
              </span>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#0A1E3D]">
                Objective
              </p>
              <span className="mono text-[10px] text-[#64748B] ml-auto">
                {objectiveQuestions.length}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {objectiveQuestions.map((q, idx) => {
                const isAnswered =
                  answers[q.id] !== undefined && answers[q.id] !== ''
                const isFlagged = flaggedQuestions.has(q.id)
                const isCurrent = idx === currentIndex
                return (
                  <button
                    key={q.id}
                    onClick={() => onGoto(idx)}
                    className={`relative aspect-square rounded-lg mono text-xs font-bold transition-all ${
                      isCurrent
                        ? 'ring-2 ring-[#0A1E3D] ring-offset-2 bg-[#0A1E3D] text-[#F59E0B] shadow-md'
                        : isAnswered
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'bg-slate-100 text-[#334155] hover:bg-slate-200'
                    }`}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {theoryQuestions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="mono text-[10px] font-bold text-[#B45309] bg-[#FEF3C7] px-2 py-0.5 rounded ring-1 ring-[#F59E0B]/40">
                B
              </span>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#B45309]">
                Theory
              </p>
              <span className="mono text-[10px] text-[#64748B] ml-auto">
                {theoryQuestions.length}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {theoryQuestions.map((q, idx) => {
                const globalIdx = objectiveQuestions.length + idx
                const isFlagged = flaggedQuestions.has(q.id)
                const isCurrent = globalIdx === currentIndex
                return (
                  <button
                    key={q.id}
                    onClick={() => onGoto(globalIdx)}
                    className={`relative aspect-square rounded-lg mono text-xs font-bold transition-all ${
                      isCurrent
                        ? 'ring-2 ring-[#F59E0B] ring-offset-2 bg-[#F59E0B] text-white shadow-md'
                        : isFlagged
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-[#FEF3C7] text-[#B45309] hover:bg-[#FCD34D] ring-1 ring-[#F59E0B]/30'
                    }`}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white" />
                    )}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-[#64748B] mt-2 italic">
              Write answers in your booklet.
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 space-y-2">
          <LegendItem color="bg-[#0A1E3D]" label="Current (objective)" />
          <LegendItem color="bg-[#F59E0B]" label="Current (theory)" />
          <LegendItem color="bg-emerald-500" label="Answered" />
          <LegendItem
            color="bg-slate-100 border border-slate-200"
            label="Not answered"
          />
          <div className="flex items-center gap-2 text-[10px] text-[#64748B]">
            <span className="relative inline-flex w-3 h-3">
              <span className="absolute inset-0 rounded-full bg-amber-500" />
            </span>
            <span>Flagged for review</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-[#64748B]">
      <span className={`w-3 h-3 rounded ${color}`} />
      <span>{label}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ReviewModal — pre-submit confirmation
   ═══════════════════════════════════════════════════════════════ */
function ReviewModal({
  exam,
  objectiveQuestions,
  theoryQuestions,
  allQuestions,
  answers,
  flaggedQuestions,
  submitting,
  onGoto,
  onCancel,
  onConfirm,
}: {
  exam: Exam
  objectiveQuestions: Question[]
  theoryQuestions: Question[]
  allQuestions: Question[]
  answers: Record<string, string>
  flaggedQuestions: Set<string>
  submitting: boolean
  onGoto: (index: number) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  const answeredObj = objectiveQuestions.filter(
    q => answers[q.id] !== undefined && answers[q.id] !== ''
  ).length
  const unansweredObj = objectiveQuestions.length - answeredObj
  const flaggedCount = flaggedQuestions.size
  const objMarks = objectiveQuestions.reduce((s, q) => s + (q.marks || 0), 0)
  const theoryMarks = theoryQuestions.reduce((s, q) => s + (q.marks || 0), 0)

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full slide-up my-8 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start gap-3 bg-gradient-to-r from-[#0A1E3D] to-[#133057] text-white">
          <div className="w-11 h-11 rounded-xl bg-[#F59E0B]/20 ring-1 ring-[#F59E0B]/40 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-[#F59E0B]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-base">Review Before Submit</h3>
            <p className="text-xs text-white/80 mt-1">
              Click any question to jump back. Once you submit, you cannot
              change your answers.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto scroll-thin">
          {objectiveQuestions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#0A1E3D]">
                    Section A — Objective
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    {objectiveQuestions.length} questions · {objMarks} marks
                  </p>
                </div>
                <div className="text-right">
                  <p className="mono text-sm font-bold text-[#0A1E3D]">
                    {answeredObj}/{objectiveQuestions.length}
                  </p>
                  <p className="text-[10px] text-[#64748B]">answered</p>
                </div>
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                {objectiveQuestions.map((q, idx) => {
                  const isAnswered =
                    answers[q.id] !== undefined && answers[q.id] !== ''
                  const isFlagged = flaggedQuestions.has(q.id)
                  return (
                    <button
                      key={q.id}
                      onClick={() => onGoto(idx)}
                      className={`relative aspect-square rounded-lg mono text-xs font-bold transition ${
                        isAnswered
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                          : 'bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100'
                      }`}
                    >
                      {idx + 1}
                      {isFlagged && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {theoryQuestions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#B45309]">
                    Section B — Theory
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    {theoryQuestions.length} questions · {theoryMarks} marks ·
                    Write in booklet
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                {theoryQuestions.map((q, idx) => {
                  const globalIdx = objectiveQuestions.length + idx
                  const isFlagged = flaggedQuestions.has(q.id)
                  return (
                    <button
                      key={q.id}
                      onClick={() => onGoto(globalIdx)}
                      className={`relative aspect-square rounded-lg mono text-xs font-bold transition ${
                        isFlagged
                          ? 'bg-amber-500 text-white hover:bg-amber-600'
                          : 'bg-[#FEF3C7] text-[#B45309] ring-1 ring-[#F59E0B]/40 hover:bg-[#FCD34D]'
                      }`}
                    >
                      {idx + 1}
                      {isFlagged && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-[#F8FAFC] ring-1 ring-slate-200 p-4 space-y-2">
            <SummaryRow
              label="Total questions"
              value={String(allQuestions.length)}
            />
            <SummaryRow
              label="Objective answered"
              value={`${answeredObj} of ${objectiveQuestions.length}`}
              tone={unansweredObj === 0 ? 'text-emerald-600' : 'text-amber-600'}
            />
            {unansweredObj > 0 && (
              <SummaryRow
                label="Objective unanswered"
                value={String(unansweredObj)}
                tone="text-red-600"
              />
            )}
            {theoryQuestions.length > 0 && (
              <SummaryRow
                label="Theory questions"
                value={`${theoryQuestions.length} — write in booklet`}
                tone="text-purple-700"
              />
            )}
            {flaggedCount > 0 && (
              <SummaryRow
                label="Flagged"
                value={String(flaggedCount)}
                tone="text-amber-600"
              />
            )}
          </div>

          {unansweredObj > 0 && !confirming && (
            <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3.5 flex items-start gap-2.5">
              <svg
                className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
              <p className="text-xs text-amber-800">
                You have <strong>{unansweredObj}</strong> unanswered objective
                question{unansweredObj === 1 ? '' : 's'}. They&apos;ll be marked
                as blank.
              </p>
            </div>
          )}

          {theoryQuestions.length > 0 && !confirming && (
            <div className="rounded-xl bg-purple-50 ring-1 ring-purple-200 p-3.5 flex items-start gap-2.5">
              <svg
                className="w-4 h-4 text-purple-700 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <p className="text-xs text-purple-900">
                <strong>Before submitting:</strong> make sure you have written
                your answers to all {theoryQuestions.length} theory question
                {theoryQuestions.length === 1 ? '' : 's'} in your answer
                booklet.
              </p>
            </div>
          )}

          {confirming && (
            <div className="rounded-xl bg-red-50 ring-2 ring-red-300 p-4 warn-pulse">
              <p className="text-sm font-bold text-red-900">
                Are you absolutely sure?
              </p>
              <p className="text-xs text-red-800 mt-1">
                This will submit your entire exam. You will not be able to
                change anything or retake it.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-2 bg-[#F8FAFC]">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-[#334155] hover:bg-white transition disabled:opacity-50"
          >
            Keep Working
          </button>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg text-xs shadow-md transition disabled:opacity-60"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
              Proceed to Submit
            </button>
          ) : (
            <button
              onClick={onConfirm}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-lg text-xs shadow-md transition disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <svg
                    className="w-3.5 h-3.5 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="9" opacity="0.25" />
                    <path d="M12 3a9 9 0 0 1 9 9" />
                  </svg>
                  Submitting…
                </>
              ) : (
                <>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  Yes, Submit Now
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[#64748B]">{label}</span>
      <span
        className={`font-semibold truncate ml-3 ${tone || 'text-[#0F172A]'}`}
      >
        {value}
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SubmittedScreen — final success screen
   ═══════════════════════════════════════════════════════════════ */
function SubmittedScreen({
  result,
  exam,
  student,
  onBack,
}: {
  result: SubmitResult
  exam: Exam
  student: Student
  onBack: () => void
}) {
  const firstName = studentName(student).split(/[,\s]+/)[0] || 'Student'

  return (
    <div className="cbt-dash-bg min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full slide-up">
        <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden">
          {/* ═══ Success header ═══ */}
          <div
            className="p-8 text-center text-white relative overflow-hidden"
            style={{
              backgroundImage:
                'radial-gradient(ellipse at top right, rgba(245,158,11,.2), transparent 60%), linear-gradient(135deg, #059669 0%, #047857 100%)',
            }}
          >
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/5 blur-3xl" />
            <div className="relative">
              <div className="w-20 h-20 mx-auto rounded-full bg-white/20 ring-4 ring-white/30 flex items-center justify-center check-burst">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="mt-5 serif-display text-2xl">
                Best of luck, {firstName}!
              </h1>
              <p className="text-sm text-white/90 mt-2">
                Your responses have been recorded successfully.
              </p>
            </div>
          </div>

          {/* ═══ Body ═══ */}
          <div className="p-6 space-y-4">
            <div className="space-y-2.5">
              <SummaryRow label="Exam" value={exam.title} />
              <SummaryRow label="Subject" value={exam.subject} />
              <SummaryRow
                label="Submitted"
                value={formatDateTime(result.submittedAt)}
              />
            </div>

            <div className="rounded-xl bg-[#F8FAFC] ring-1 ring-slate-200 p-4 text-xs text-[#334155] leading-relaxed">
              <p className="font-semibold text-[#0F172A] mb-1.5">
                What happens next?
              </p>
              {result.hasTheory ? (
                <ul className="ml-4 list-disc space-y-1">
                  <li>Your objective answers have been auto-scored.</li>
                  <li>
                    Your theory answers will be marked from your booklet by your
                    subject teacher.
                  </li>
                  <li>
                    The class teacher will review and forward to the admin.
                  </li>
                  <li>
                    Final results will be published on the Student Portal when
                    ready.
                  </li>
                </ul>
              ) : (
                <ul className="ml-4 list-disc space-y-1">
                  <li>Your answers have been auto-scored.</li>
                  <li>The class teacher will review and forward to the admin.</li>
                  <li>
                    Final results will be published on the Student Portal when
                    ready.
                  </li>
                </ul>
              )}
            </div>

            <div className="rounded-xl bg-[#FEF3C7] ring-1 ring-[#F59E0B]/40 p-3.5 flex items-start gap-2.5">
              <svg
                className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
              <p className="text-[11px] text-[#B45309]">
                You cannot retake this exam. If you believe this was a mistake,
                contact your exam officer.
              </p>
            </div>

            <button
              onClick={onBack}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#0A1E3D] hover:bg-[#133057] text-white font-bold px-5 py-3.5 rounded-lg text-sm shadow-md shadow-[#0A1E3D]/20 transition active:scale-[0.98]"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </button>

            <a
              href={STUDENT_PORTAL_URL}
              className="w-full inline-flex items-center justify-center gap-2 bg-white hover:bg-[#F8FAFC] text-[#0A1E3D] font-semibold px-5 py-3 rounded-lg text-xs ring-1 ring-slate-200 hover:ring-slate-300 transition"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M3 12l9-9 9 9" />
                <path d="M5 10v10h14V10" />
              </svg>
              Go to Student Portal
            </a>
          </div>
        </div>

        <p className="text-center text-[10px] text-[#64748B] mt-5">
          IRIS CBT Portal · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   END OF FILE — CBT Portal v3.1
   ═══════════════════════════════════════════════════════════════
   
   File: src/app/portal/cbt/page.tsx
   
   Parts delivered:
   • Part 1 — Foundation: imports, constants, types, helpers, styles
   • Part 2 — Shell + Login + Header + Toasts + Avatar + Dropdown
   • Part 3 — Dashboard + Instructions + Welcome splash
   • Part 4 — ExamShell + ReviewModal + SubmittedScreen
   
   ───────────────────────────────────────────────────────────────
   v3.1 — WHAT'S NEW vs v3.0
   ───────────────────────────────────────────────────────────────
   
   ✅ No sidebar — focused, single-purpose UI
   ✅ Header with student name + avatar dropdown
      • Return to Student Portal
      • Help & Support
      • Sign Out
   ✅ Refined 6-step flow:
      Login → Dashboard → Instructions → Welcome Splash →
      Exam → Submitted
   ✅ Welcome splash (2.4s) with "Best of luck, [FirstName]"
   ✅ Single timer across OBJ + theory sections
   ✅ Double-confirm submit (Review → Proceed → Yes)
   ✅ Success screen with "Best of luck" + next-step info
   ✅ Tiered auto-flagging:
      • Tier 1 (silent + toast): tab switch, fullscreen exit
      • Tier 2 (toast + flag): right-click, copy, paste
      • Tier 3 (silent block + flag): dev tools, view source,
        print, screenshot
   ✅ Deep-link ?exam=<id> jumps straight to instructions
   ✅ User-select disabled globally; text inputs still selectable
   ✅ Print blocked via @media print
   
   PRESERVED FROM v3.0
   ─────────────────────────────────────────────────────────────
   ✓ Anon session bootstrap
   ✓ Robust update with SDK + REST fallback
   ✓ Split sections (A: OBJ, B: Theory)
   ✓ Question navigator + flag for review
   ✓ Auto-save with 800ms debounce
   ✓ Before-unload warning
   ✓ Auto-submit when timer hits zero
   
   ───────────────────────────────────────────────────────────────
   PREREQUISITES
   ───────────────────────────────────────────────────────────────
   
   [x] All three portals deployed (admin, teacher, student)
   [x] RLS policies for exam_attempts allow anon update
       (from the "student_read_*" policies block)
   
   ───────────────────────────────────────────────────────────────
   FIRST-RUN CHECKLIST
   ───────────────────────────────────────────────────────────────
   
   Build & Auth:
   [ ] All 4 parts pasted into src/app/portal/cbt/page.tsx
   [ ] npm run build — no TypeScript errors
   [ ] Portal loads at /portal/cbt
   [ ] Student logs in with admission number + CBT password
   [ ] Invalid credentials show error toast
   
   Flow:
   [ ] Dashboard shows welcome hero + scheduled exams
   [ ] Click "Start Exam" → Instructions screen
   [ ] Instructions show admin-written text
   [ ] Checkbox required to enable Start Exam button
   [ ] Click "Start Exam" → welcome splash (2.4s)
   [ ] Auto-transition to exam shell
   [ ] Exam shows OBJ questions first
   [ ] Selecting an option highlights it in amber
   [ ] "Next" button advances to next question
   [ ] After last OBJ question, theory section begins
   [ ] Theory questions show "write in booklet" info
   [ ] Timer counts down from exam duration
   [ ] Timer turns amber at 5 minutes remaining
   [ ] Timer turns red at 1 minute remaining
   
   Auto-flagging:
   [ ] Tab switch → toast "Tab switch detected"
   [ ] Fullscreen exit → toast (if fullscreen was used)
   [ ] Right-click → toast + context menu blocked
   [ ] Ctrl+C on question text → toast + copy blocked
   [ ] Ctrl+V → toast + paste blocked
   [ ] F12 → blocked silently
   [ ] Ctrl+Shift+I → blocked silently
   [ ] Ctrl+U → blocked silently
   [ ] Ctrl+P → blocked silently
   [ ] PrintScreen → blocked silently
   [ ] Flags appear on exam_attempts after reload
   
   Question navigator:
   [ ] Sidebar visible on desktop (lg+)
   [ ] Mobile: ☰ opens drawer
   [ ] Objective questions show A section
   [ ] Theory questions show B section
   [ ] Answered OBJ = green
   [ ] Unanswered OBJ = gray
   [ ] Flagged = amber dot
   [ ] Current question = highlighted border
   [ ] Click any cell → jumps to that question
   
   Flag for review:
   [ ] "Flag" button on question header
   [ ] Click → button turns amber "Flagged"
   [ ] Shows in navigator with amber dot
   [ ] Flagged count in header
   
   Submit flow:
   [ ] Click "Review & Submit" (last question or header)
   [ ] Modal shows answered/unanswered counts
   [ ] Unanswered OBJ shows red cells
   [ ] Click any cell → jumps back
   [ ] Click "Proceed to Submit" → turns into "Yes, Submit Now"
   [ ] Click "Yes" → submit → success screen
   
   Success screen:
   [ ] Shows "Best of luck, [FirstName]"
   [ ] Shows exam + subject + time
   [ ] Shows "What happens next" for OBJ or OBJ+theory
   [ ] "Back to Dashboard" button works
   [ ] "Go to Student Portal" link works
   [ ] Exam now shows as "Submitted" on dashboard
   [ ] Cannot retake
   
   Auto-submit:
   [ ] Let timer hit zero → auto-submits
   [ ] Status = "auto_submitted"
   
   Deep link:
   [ ] From student portal, click "Take Exam"
   [ ] URL becomes /portal/cbt?exam=<id>
   [ ] Student lands directly on Instructions screen
   
   Header dropdown:
   [ ] Avatar + name visible
   [ ] Click → dropdown opens
   [ ] Shows student summary
   [ ] "Return to Student Portal" link works
   [ ] "Help & Support" opens mailto
   [ ] "Sign Out" clears session
   [ ] Click outside closes dropdown
   [ ] Escape closes dropdown
   
   ───────────────────────────────────────────────────────────────
   COMPLETE WORKFLOW NOW LIVE
   ───────────────────────────────────────────────────────────────
   
   Admin v15.2 → Teacher v8.0 → Student v4.1 → CBT v3.1
   
   1. Admin: uploads questions, creates exam with instructions
   2. Admin: schedules exam, assigns subject + class teacher
   3. Student: sees exam on Student Portal dashboard
   4. Student: clicks "Take Exam" → CBT portal instructions
   5. Student: reads admin instructions, ticks agreement, starts
   6. Student: sees welcome splash, then takes OBJ + theory exam
   7. Student: submits with double-confirm
   8. Student: sees success screen with next-step info
   9. Subject teacher: marks theory + CA in Theory Marking tab
   10. Class teacher: approves in Class Hub
   11. Admin: approves in Submissions tab
   12. Class teacher: submits broadsheet to admin
   13. Admin: approves broadsheet
   14. Class teacher: publishes report cards
   15. Student: sees published report cards on Student Portal
   
   ═══════════════════════════════════════════════════════════════ */

export {}