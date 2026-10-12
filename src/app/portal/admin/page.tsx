'use client'

/* ============================================================================
   IBADU RAHMAN INTERNATIONAL SCHOOL — ADMIN CONTROL CENTER
   v2.0 — Term Calendar, Subscription, Classes, Assign Subjects, Portal Lock
   ============================================================================ */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

/* ============================================================================
   CONFIG
   ============================================================================ */

const ADMIN_PASSWORD = 'IRIS@Admin2025'   // ⚠️ CHANGE THIS before deploying
const SESSION_KEY = 'iris.admin.session'
const SESSION_MINUTES = 30
const LIVE_REFRESH_MS = 10000

// School slug — identifies which row in `schools` table this dashboard belongs to.
// Your row has slug = 'iris'.
const SCHOOL_SLUG = 'iris'

const SCHOOL = {
  name: 'Ibadu Rahman International School',
  motto: 'Quest for Excellence',
  address: '57, Unity Street, Papa Ibafo, Ogun State',
  phones: ['09152625084'],
  email: 'morakstech02@gmail.com',
  website: '',
  logo: 'https://dtnxidhvttjxkirxafnf.supabase.co/storage/v1/object/public/school-assets/logo.png',
  session: '2025/2026',        // fallback if no session marked current
  term: 'First Term' as const, // fallback if no term marked current
  version: '2.0',
}

const TERMS = ['First Term', 'Second Term', 'Third Term'] as const
type Term = typeof TERMS[number]

const GRADE_SCALE = [
  { g: 'A1', min: 70 }, { g: 'B2', min: 65 }, { g: 'B3', min: 60 },
  { g: 'C4', min: 55 }, { g: 'C5', min: 50 }, { g: 'C6', min: 45 },
  { g: 'D7', min: 40 }, { g: 'E8', min: 35 }, { g: 'F9', min: 0 },
]

const PASSPORT_BUCKET = 'student-passports'
const PASSPORT_MAX_MB = 2
const SCHOOL_ASSETS_BUCKET = 'school-assets'
const PAYMENT_PROOFS_BUCKET = 'payment-proofs'
const PAYMENT_PROOF_MAX_MB = 5

// Subject combo presets (used in Assign Subjects modal)
const SUBJECT_COMBOS: { name: string; description: string; match: (n: string) => boolean }[] = [
  {
    name: 'Science',
    description: 'Physics, Chemistry, Biology, Further Maths',
    match: (n) => /physics|chemistry|biology|further\s*math/i.test(n),
  },
  {
    name: 'Arts',
    description: 'Literature, Government, History, CRS/IRS',
    match: (n) => /literature|government|history|crs|irs|christian|islamic/i.test(n),
  },
  {
    name: 'Commercial',
    description: 'Accounting, Commerce, Economics, Business Studies',
    match: (n) => /account|commerce|economics|business/i.test(n),
  },
  {
    name: 'Core',
    description: 'English, Mathematics, Civic Education',
    match: (n) => /english|mathematic|civic/i.test(n),
  },
]

/* ============================================================================
   TYPES
   ============================================================================ */

type ClassRow = { id: string; name: string }
type SubjectRow = { id: string; name: string }

type ClassLevel = {
  id: string
  name: string
  is_ss: boolean
  display_order: number
}

type Stream = {
  id: string
  class_level_id: string
  name: string
  display_order: number
}

type ClassSubject = {
  id: string
  class_level_id: string | null
  stream_id: string | null
  subject_id: string
  is_core: boolean
  is_active: boolean
  created_at?: string
}

type Teacher = {
  id: string
  staff_id: string
  full_name: string
  email: string
  password: string | null
  phone: string | null
  role_type: 'subject' | 'class' | 'both'
  assigned_class_id: string | null
  assigned_subjects: string | null
  created_at?: string
  class_ids?: string[]
  subject_ids?: string[]
}

type Student = {
  id: string
  admission_number: string
  full_name: string
  password: string | null
  class_id: string | null
  gender: 'Male' | 'Female' | null
  date_of_birth: string | null
  parent_phone: string | null
  passport_url: string | null
  created_at?: string
}

type Question = {
  id: string
  exam_id: string
  question_text: string
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  correct_answer: 'A' | 'B' | 'C' | 'D' | null
  marks: number
  type: 'objective' | 'theory'
  theory_answer_guide: string | null
}

type CbtExam = {
  id: string
  title: string
  class_id: string
  subject_id: string
  duration_minutes: number
  session: string
  term: string
  status: 'draft' | 'published'
  start_at: string | null
  end_at: string | null
  shuffle_questions: boolean
  shuffle_options: boolean
  max_attempts: number
  instructions: string | null
  has_theory: boolean
  total_marks: number | null
  published_by: string | null
  published_at: string | null
  created_at: string
}

type Attempt = {
  id: string
  exam_id: string
  student_id: string
  started_at: string | null
  submitted_at: string | null
  answers: Record<string, 'A' | 'B' | 'C' | 'D'>
  theory_answers: Record<string, string>
  status: 'in_progress' | 'submitted' | 'auto_submitted' | 'pending_manual_marking' | 'graded'
  tab_switch_count: number
  duration_spent_seconds: number | null
  score: number | null
  total_marks: number | null
  final_score: number | null
  extended_minutes: number
  graded_by: string | null
  graded_at: string | null
}

type ScoreRow = {
  id: string
  student_id: string
  subject_id: string
  class_id: string | null
  test_score: number | null
  exam_score: number | null
  total_score: number
  term: string
  session: string
}

type ReportCardPub = {
  id: string
  class_id: string
  term: string
  session: string
  published_at: string
}

type BroadsheetLock = {
  id: string
  class_id: string
  term: string
  session: string
  locked: boolean
  locked_at: string | null
  locked_by: string | null
}

type Announcement = {
  id: string
  title: string
  body: string
  audience: 'all' | 'students' | 'teachers' | 'class'
  class_id: string | null
  attachment_url: string | null
  attachment_name: string | null
  pinned: boolean
  published_at: string
  expires_at: string | null
  created_by: string | null
  created_at: string
}

type SessionRow = {
  id: string
  name: string
  is_current: boolean
  created_at: string
}

type TermCalendar = {
  id: string
  session_id: string | null
  term: string
  start_date: string | null
  end_date: string | null
  next_term_begins: string | null
  days_opened: number | null
  is_current: boolean
  created_at: string
}

type SubscriptionPlan = {
  id: string
  name: string
  duration_days: number
  amount: number
  is_active: boolean
  sort_order: number
}

type SubscriptionPayment = {
  id: string
  school_id: string | null
  plan_id: string | null
  amount: number | null
  bank_reference: string | null
  proof_url: string | null
  proof_name: string | null
  submitted_at: string | null
  submitted_by: string | null
  status: 'pending' | 'approved' | 'rejected'
  approved_at: string | null
  approved_by: string | null
  notes: string | null
}

type PaymentAccount = {
  id: string
  bank_name: string | null
  account_name: string | null
  account_number: string | null
  vendor_email: string | null
  vendor_whatsapp: string | null
  updated_at: string | null
}

type SchoolRow = {
  id: string
  slug: string
  name: string
  subscription_plan: string | null
  subscription_start_date: string | null
  subscription_end_date: string | null
  portal_locked: boolean
  portal_locked_reason: string | null
  grace_days: number
  created_at: string | null
  updated_at: string | null
}

type PortalLockStatus =
  | { status: 'active'; daysLeft: number }
  | { status: 'expiring_soon'; daysLeft: number }
  | { status: 'in_grace'; graceLeft: number }
  | { status: 'expired' }
  | { status: 'locked'; reason: string }
  | { status: 'no_subscription' }

type AuditEntry = { ts: number; action: string; detail: string }
type Toast = { id: number; msg: string; tone: 'success' | 'error' | 'info' | 'warn' }

/* ============================================================================
   HELPERS — General
   ============================================================================ */

function gradeFromTotal(total: number): { grade: string; tone: string } {
  if (total >= 70) return { grade: 'A1', tone: 'text-emerald-700' }
  if (total >= 65) return { grade: 'B2', tone: 'text-emerald-700' }
  if (total >= 60) return { grade: 'B3', tone: 'text-emerald-700' }
  if (total >= 55) return { grade: 'C4', tone: 'text-blue-700' }
  if (total >= 50) return { grade: 'C5', tone: 'text-blue-700' }
  if (total >= 45) return { grade: 'C6', tone: 'text-blue-700' }
  if (total >= 40) return { grade: 'D7', tone: 'text-amber-700' }
  if (total >= 35) return { grade: 'E8', tone: 'text-amber-700' }
  return { grade: 'F9', tone: 'text-red-700' }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function normalizeHeader(h: string): string {
  return String(h).trim().toLowerCase().replace(/\s+/g, '_')
}

function normalizeName(s: string): string {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ')
}

function toTitleCase(s: string): string {
  return String(s)
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ')
    .replace(/\bAl-([a-z])/gi, (_, c: string) => `Al-${c.toUpperCase()}`)
}

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

function isValidDate(s: string): boolean {
  if (!s) return false
  const d = new Date(s)
  return !isNaN(d.getTime()) && d <= new Date()
}

function randomPassword(len = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let p = ''
  for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p
}

function todayIso(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toLocalDatetimeInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mn = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mn}`
}

function fromLocalDatetimeInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '₦0'
  return '₦' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })
}

function formatDateHuman(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return '—'
    return dt.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function parseDobAny(raw: any): string | null {
  if (raw === '' || raw == null) return null
  if (typeof raw === 'number' && raw > 0 && raw < 100000) {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return null
}

function examDerivedStatus(exam: CbtExam): 'draft' | 'scheduled' | 'live' | 'closed' {
  if (exam.status === 'draft') return 'draft'
  const now = Date.now()
  if (exam.start_at && new Date(exam.start_at).getTime() > now) return 'scheduled'
  if (exam.end_at && new Date(exam.end_at).getTime() < now) return 'closed'
  return 'live'
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function computeObjectiveScore(
  answers: Record<string, 'A' | 'B' | 'C' | 'D'>,
  objectiveQuestions: Question[]
): number {
  let score = 0
  objectiveQuestions.forEach((q) => {
    if (answers[q.id] && answers[q.id] === q.correct_answer) score += q.marks
  })
  return score
}

/* ============================================================================
   PORTAL LOCK LOGIC
   Computes subscription status from `schools` row.
   ============================================================================ */

function computePortalStatus(school: SchoolRow | null): PortalLockStatus {
  if (!school) return { status: 'no_subscription' }

  // Vendor manually locked → hard lock
  if (school.portal_locked) {
    return { status: 'locked', reason: school.portal_locked_reason || 'Manually locked by vendor' }
  }

  if (!school.subscription_end_date) return { status: 'no_subscription' }

  const now = Date.now()
  const endMs = new Date(school.subscription_end_date).getTime()
  const graceMs = (school.grace_days || 0) * 24 * 60 * 60 * 1000
  const hardLockMs = endMs + graceMs
  const MS_DAY = 24 * 60 * 60 * 1000

  if (now <= endMs) {
    const daysLeft = Math.ceil((endMs - now) / MS_DAY)
    if (daysLeft <= 7) return { status: 'expiring_soon', daysLeft }
    return { status: 'active', daysLeft }
  }

  if (now <= hardLockMs) {
    const graceLeft = Math.ceil((hardLockMs - now) / MS_DAY)
    return { status: 'in_grace', graceLeft }
  }

  return { status: 'expired' }
}

function isHardLocked(status: PortalLockStatus): boolean {
  return status.status === 'locked' || status.status === 'expired'
}

/* ============================================================================
   PASSPORT HELPERS
   Public bucket (as per user decision).
   ============================================================================ */

async function uploadPassport(
  file: File,
  admissionNumber: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    if (!file.type.startsWith('image/')) {
      return { url: null, error: 'File must be an image (JPG, PNG, or WEBP).' }
    }
    if (file.size > PASSPORT_MAX_MB * 1024 * 1024) {
      return { url: null, error: `Image too large. Max ${PASSPORT_MAX_MB} MB.` }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const safeAdm = admissionNumber.replace(/[^A-Za-z0-9]/g, '_')
    const path = `${safeAdm}_${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from(PASSPORT_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })

    if (upErr) return { url: null, error: upErr.message }

    const { data } = supabase.storage.from(PASSPORT_BUCKET).getPublicUrl(path)
    return { url: data.publicUrl, error: null }
  } catch (err: any) {
    return { url: null, error: err.message || 'Upload failed.' }
  }
}

async function deletePassportByUrl(url: string | null): Promise<void> {
  if (!url) return
  try {
    const parts = url.split(`/${PASSPORT_BUCKET}/`)
    if (parts.length < 2) return
    const path = parts[1].split('?')[0]
    await supabase.storage.from(PASSPORT_BUCKET).remove([path])
  } catch {
    // silent — best-effort cleanup
  }
}

/* ============================================================================
   LOGO / SETTINGS HELPERS
   ============================================================================ */

async function uploadSchoolLogo(file: File): Promise<{ url: string | null; error: string | null }> {
  try {
    if (!file.type.startsWith('image/')) {
      return { url: null, error: 'Logo must be an image.' }
    }
    if (file.size > 2 * 1024 * 1024) {
      return { url: null, error: 'Logo too large. Max 2 MB.' }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `logo.${ext}`

    const { error: upErr } = await supabase.storage
      .from(SCHOOL_ASSETS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: true })

    if (upErr) return { url: null, error: upErr.message }

    const { data } = supabase.storage.from(SCHOOL_ASSETS_BUCKET).getPublicUrl(path)
    return { url: data.publicUrl, error: null }
  } catch (err: any) {
    return { url: null, error: err.message || 'Upload failed.' }
  }
}

async function uploadPaymentProof(
  file: File,
  schoolSlug: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      return { url: null, error: 'File must be JPG, PNG, WEBP, or PDF.' }
    }
    if (file.size > PAYMENT_PROOF_MAX_MB * 1024 * 1024) {
      return { url: null, error: `File too large. Max ${PAYMENT_PROOF_MAX_MB} MB.` }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${schoolSlug}_${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from(PAYMENT_PROOFS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })

    if (upErr) return { url: null, error: upErr.message }

    const { data } = supabase.storage.from(PAYMENT_PROOFS_BUCKET).getPublicUrl(path)
    return { url: data.publicUrl, error: null }
  } catch (err: any) {
    return { url: null, error: err.message || 'Upload failed.' }
  }
}

/* ============================================================================
   GLOBAL STYLES
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
          table th, table td { color: #1A2332; text-shadow: none; }
          table thead th { color: #ffffff; }
          tr:hover td { text-shadow: none; }
          .tabular-nums { font-variant-numeric: tabular-nums; }
        `,
      }}
    />
  )
}
/* ============================================================================
   ROOT
   ============================================================================ */

export default function AdminDashboard() {
  const [authed, setAuthed] = useState(false)
  const [bootChecked, setBootChecked] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      try {
        const s = JSON.parse(raw)
        if (s.expiresAt > Date.now()) setAuthed(true)
        else sessionStorage.removeItem(SESSION_KEY)
      } catch {}
    }
    setBootChecked(true)
  }, [])

  if (!bootChecked) return null
  if (!authed) return <PasswordGate onUnlock={() => setAuthed(true)} />
  return <Console onLogout={() => setAuthed(false)} />
}

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pass, setPass] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pass === ADMIN_PASSWORD) {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ expiresAt: Date.now() + SESSION_MINUTES * 60 * 1000 })
      )
      onUnlock()
    } else {
      setError('Incorrect admin password.')
      setPass('')
    }
  }

  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white shadow-2xl rounded-2xl border border-amber-200 overflow-hidden">
          <div className="bg-[#0A1E3D] text-white p-6 text-center border-b-4 border-amber-500 relative">
            <button
              onClick={() => (window.location.href = '/login')}
              className="absolute left-4 top-4 bg-[#061A33] text-amber-300 px-3 py-1.5 rounded text-xs font-bold"
            >
              ← Login
            </button>
            <img
              src={SCHOOL.logo}
              alt="Logo"
              className="w-14 h-14 mx-auto rounded-full bg-white p-1 mb-2 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden'
              }}
            />
            <h1 className="text-lg font-extrabold">Admin Control Center</h1>
            <p className="text-xs text-amber-300 mt-1 tracking-widest font-semibold">
              {SCHOOL.name.toUpperCase()}
            </p>
          </div>
          <form onSubmit={submit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-bold text-[#0A1E3D] mb-1">
                Admin Password
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={pass}
                  onChange={(e) => {
                    setPass(e.target.value)
                    setError('')
                  }}
                  autoFocus
                  required
                  placeholder="Enter admin password"
                  className="w-full border p-3 pr-14 rounded-lg text-sm bg-white border-amber-300 focus:ring-2 focus:ring-amber-400 outline-none text-[#1A2332]"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#0A1E3D]"
                >
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-lg px-4 py-3">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-[#0A1E3D] text-white py-3 rounded-lg font-extrabold text-sm"
            >
              Unlock Dashboard
            </button>
          </form>
        </div>
      </div>
    </>
  )
}

/* ============================================================================
   PORTAL LOCK SCREEN
   Shown when subscription is expired or vendor-locked.
   ============================================================================ */

function PortalLockScreen({
  school,
  status,
  onLogout,
}: {
  school: SchoolRow | null
  status: PortalLockStatus
  onLogout: () => void
}) {
  const reason =
    status.status === 'locked'
      ? status.reason
      : status.status === 'expired'
      ? 'Your subscription has expired and the grace period has ended.'
      : status.status === 'no_subscription'
      ? 'No active subscription found for this school.'
      : 'Subscription issue.'

  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-[#0A1E3D] flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-[#061A33] text-white p-8 text-center border-b-4 border-red-500">
            <img
              src={SCHOOL.logo}
              alt="Logo"
              className="w-16 h-16 mx-auto rounded-full bg-white p-1 mb-3 object-contain"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.visibility = 'hidden'
              }}
            />
            <h1 className="text-xl font-black text-red-400">🔒 Portal Locked</h1>
            <p className="text-sm text-white/80 mt-1">
              {school?.name || SCHOOL.name}
            </p>
          </div>

          <div className="p-6 space-y-5">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs font-bold uppercase text-red-800 tracking-wider mb-1">
                Reason
              </p>
              <p className="text-sm text-red-900">{reason}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-gray-700 space-y-2">
              <p className="font-bold text-[#0A1E3D] uppercase tracking-wider text-[11px]">
                What to do
              </p>
              <p>
                Your school's subscription is not active. The portal is locked
                until payment is received and approved.
              </p>
              <p>
                Contact the vendor (Moraks Tech) or submit payment proof from the
                Subscription page.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1">
              <p className="font-bold">Vendor Contact</p>
              <p>📧 {SCHOOL.email}</p>
              <p>📞 {SCHOOL.phones.join(', ')}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  window.location.href = '/login'
                }}
                className="flex-1 text-xs font-bold text-gray-700 bg-slate-100 hover:bg-slate-200 px-4 py-3 rounded-xl"
              >
                Back to Login
              </button>
              <button
                onClick={onLogout}
                className="flex-1 text-xs font-bold text-white bg-[#0A1E3D] hover:bg-black px-4 py-3 rounded-xl"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ============================================================================
   CONSOLE
   ============================================================================ */

type Tab =
  | 'dashboard' | 'students' | 'teachers' | 'classes'
  | 'questions' | 'exams' | 'live' | 'submissions'
  | 'broadsheet' | 'news' | 'subscription' | 'audit' | 'settings'

const TAB_TITLES: Record<Tab, string> = {
  dashboard: 'Dashboard',
  students: 'Students Management',
  teachers: 'Teachers Management',
  classes: 'Classes & Subjects',
  questions: 'Question Bank',
  exams: 'CBT Exams',
  live: 'Live Monitor',
  submissions: 'Submissions',
  broadsheet: 'Broadsheets & Report Cards',
  news: 'News & Announcements',
  subscription: 'Subscription',
  audit: 'Audit Log',
  settings: 'Settings',
}

function Console({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Core data
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [exams, setExams] = useState<CbtExam[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [reportCardPub, setReportCardPub] = useState<ReportCardPub[]>([])
  const [broadsheetLocks, setBroadsheetLocks] = useState<BroadsheetLock[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  // v2.0 data
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([])
  const [streams, setStreams] = useState<Stream[]>([])
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [termCalendars, setTermCalendars] = useState<TermCalendar[]>([])
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [payments, setPayments] = useState<SubscriptionPayment[]>([])
  const [paymentAccount, setPaymentAccount] = useState<PaymentAccount | null>(null)
  const [school, setSchool] = useState<SchoolRow | null>(null)
  const [schoolLogo, setSchoolLogo] = useState<string>(SCHOOL.logo)

  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)

  const showToast = useCallback((msg: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  const logAction = useCallback((action: string, detail = '') => {
    setAudit((prev) => [{ ts: Date.now(), action, detail }, ...prev].slice(0, 300))
  }, [])

  const askConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    setConfirmState({ title, message, onConfirm })
  }, [])

  /* ---------------------------------------------------------------------------
     LOAD ALL DATA
     --------------------------------------------------------------------------- */

  const loadAll = useCallback(async () => {
    setLoading(true)

    const [
      c, s, st, t, ex, q, rp, an, locks, tc,
      cl, strm, cs, sess, tcal, pl, pay, pa, sch, set,
    ] = await Promise.all([
      supabase.from('classes').select('*').order('name'),
      supabase.from('subjects').select('*').order('name'),
      supabase.from('students').select('*').order('full_name'),
      supabase.from('teachers').select('*').order('full_name'),
      supabase.from('cbt_exams').select('*').order('created_at', { ascending: false }),
      supabase.from('cbt_questions').select('*').order('created_at'),
      supabase.from('report_card_publications').select('*'),
      supabase.from('announcements').select('*').order('pinned', { ascending: false }).order('published_at', { ascending: false }),
      supabase.from('broadsheet_locks').select('*'),
      supabase.from('teacher_classes').select('*'),
      supabase.from('class_levels').select('*').order('display_order'),
      supabase.from('streams').select('*').order('display_order'),
      supabase.from('class_subjects').select('*'),
      supabase.from('sessions').select('*').order('name', { ascending: false }),
      supabase.from('term_calendars').select('*'),
      supabase.from('subscription_plans').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('subscription_payments').select('*').order('submitted_at', { ascending: false }),
      supabase.from('payment_accounts').select('*').limit(1).maybeSingle(),
      supabase.from('schools').select('*').eq('slug', SCHOOL_SLUG).maybeSingle(),
      supabase.from('settings').select('*'),
    ])

    setClasses(c.data || [])
    setSubjects(s.data || [])
    setStudents((st.data || []) as Student[])

    // Attach teacher_classes and teacher_subjects
    const tcMap = new Map<string, string[]>()
    ;(tc.data || []).forEach((row: any) => {
      const arr = tcMap.get(row.teacher_id) || []
      arr.push(row.class_id)
      tcMap.set(row.teacher_id, arr)
    })

    const tsResp = await supabase.from('teacher_subjects').select('*')
    const tsMap = new Map<string, string[]>()
    ;(tsResp.data || []).forEach((row: any) => {
      const arr = tsMap.get(row.teacher_id) || []
      arr.push(row.subject_id)
      tsMap.set(row.teacher_id, arr)
    })

    const teachersWith = (t.data || []).map((tt: any) => ({
      ...tt,
      class_ids: tcMap.get(tt.id) || (tt.assigned_class_id ? [tt.assigned_class_id] : []),
      subject_ids: tsMap.get(tt.id) || [],
    }))
    setTeachers(teachersWith as Teacher[])

    setExams(ex.data || [])
    setQuestions(q.data || [])
    setReportCardPub((rp.data || []) as ReportCardPub[])
    setAnnouncements((an.data || []) as Announcement[])
    setBroadsheetLocks((locks.data || []) as BroadsheetLock[])

    setClassLevels((cl.data || []) as ClassLevel[])
    setStreams((strm.data || []) as Stream[])
    setClassSubjects((cs.data || []) as ClassSubject[])
    setSessions((sess.data || []) as SessionRow[])
    setTermCalendars((tcal.data || []) as TermCalendar[])
    setPlans((pl.data || []) as SubscriptionPlan[])
    setPayments((pay.data || []) as SubscriptionPayment[])
    setPaymentAccount((pa.data || null) as PaymentAccount | null)
    setSchool((sch.data || null) as SchoolRow | null)

    // Resolve logo from settings override
    const logoSetting = (set.data || []).find((x: any) => x.key === 'school_logo')
    if (logoSetting?.value) setSchoolLogo(logoSetting.value)

    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Load scores when broadsheet tab opens
  useEffect(() => {
    if (tab !== 'broadsheet') return
    ;(async () => {
      const { data } = await supabase.from('scores').select('*')
      setScores(data || [])
    })()
  }, [tab])

  /* ---------------------------------------------------------------------------
     DERIVED: current session & term (for header + defaults)
     --------------------------------------------------------------------------- */

  const currentSession = useMemo(
    () => sessions.find((s) => s.is_current) || sessions[0] || null,
    [sessions]
  )
  const currentTerm = useMemo(
    () => termCalendars.find((t) => t.is_current) || null,
    [termCalendars]
  )
  const currentSessionName = currentSession?.name || SCHOOL.session
  const currentTermName = (currentTerm?.term || SCHOOL.term) as Term

  /* ---------------------------------------------------------------------------
     PORTAL LOCK
     --------------------------------------------------------------------------- */

  const portalStatus = useMemo(() => computePortalStatus(school), [school])
  const hardLocked = isHardLocked(portalStatus)

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY)
    logAction('Admin signed out')
    onLogout()
  }

  // If hard-locked, only show subscription + a lock banner
  if (hardLocked) {
    return (
      <PortalLockScreen
        school={school}
        status={portalStatus}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
        {/* ============================ SIDEBAR ============================ */}
        <aside
          className={`${
            mobileNavOpen ? 'block' : 'hidden'
          } lg:block lg:w-64 shrink-0 bg-[#061A33] text-white border-r border-black/20 lg:sticky lg:top-0 lg:h-screen overflow-y-auto`}
        >
          <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
            <img
              src={schoolLogo}
              alt="Logo"
              className="w-10 h-10 rounded-xl bg-white p-1 shrink-0 object-contain"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src = SCHOOL.logo
              }}
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400">
                IRIS
              </p>
              <p className="text-xs font-semibold truncate">Admin Console</p>
            </div>
          </div>

          <nav className="p-3 space-y-0.5 text-sm">
            <NavGroup label="Overview" />
            <NavBtn tab="dashboard" current={tab} onClick={setTab} icon="grid" label="Dashboard" />

            <NavGroup label="People" />
            <NavBtn tab="students" current={tab} onClick={setTab} icon="users" label="Students" />
            <NavBtn tab="teachers" current={tab} onClick={setTab} icon="teach" label="Teachers" />
            <NavBtn tab="classes" current={tab} onClick={setTab} icon="layers" label="Classes & Subjects" />

            <NavGroup label="CBT" />
            <NavBtn tab="questions" current={tab} onClick={setTab} icon="question" label="Question Bank" />
            <NavBtn tab="exams" current={tab} onClick={setTab} icon="clock" label="Exams" />
            <NavBtn tab="live" current={tab} onClick={setTab} icon="activity" label="Live Monitor" />
            <NavBtn tab="submissions" current={tab} onClick={setTab} icon="check" label="Submissions" />

            <NavGroup label="Results" />
            <NavBtn tab="broadsheet" current={tab} onClick={setTab} icon="table" label="Broadsheets" />

            <NavGroup label="Communication" />
            <NavBtn tab="news" current={tab} onClick={setTab} icon="megaphone" label="News & Announcements" />

            <NavGroup label="System" />
            <NavBtn tab="subscription" current={tab} onClick={setTab} icon="credit-card" label="Subscription" />
            <NavBtn tab="audit" current={tab} onClick={setTab} icon="list" label="Audit Log" />
            <NavBtn tab="settings" current={tab} onClick={setTab} icon="settings" label="Settings" />
          </nav>

          <div className="p-3 border-t border-white/10 space-y-1 mt-4">
            <div className="px-3 py-1 text-[10px] text-white/40">
              Signed in as Master Admin
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-300/80 hover:bg-red-500/10 text-sm"
            >
              <Icon name="logout" /> Sign Out
            </button>
          </div>
        </aside>

        {/* ============================ MAIN ============================ */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-slate-200">
            <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileNavOpen((v) => !v)}
                  className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100"
                >
                  <Icon name="menu" />
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Session · {currentSessionName} · {currentTermName}
                  </p>
                  <h1 className="text-sm sm:text-base font-semibold text-[#0A1E3D] truncate">
                    {TAB_TITLES[tab]}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={loadAll}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-[11px] font-medium text-gray-700 hover:bg-slate-200"
                >
                  <Icon name="refresh" /> Refresh
                </button>
                <div className="hidden md:flex items-center gap-3 pl-3 border-l border-slate-200">
                  <div className="text-right leading-tight">
                    <p className="text-xs font-semibold text-[#0A1E3D]">
                      Master Administrator
                    </p>
                    <p className="text-[10px] text-gray-500">Full System Access</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-[#0A1E3D] text-white flex items-center justify-center text-xs font-bold">
                    MA
                  </div>
                </div>
              </div>
            </div>

            {/* Subscription banner */}
            {(portalStatus.status === 'expiring_soon' || portalStatus.status === 'in_grace') && (
              <div
                className={`px-4 sm:px-6 lg:px-8 py-2 text-xs font-semibold border-t ${
                  portalStatus.status === 'expiring_soon'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {portalStatus.status === 'expiring_soon' && (
                  <>
                    ⚠️ Your subscription expires in {portalStatus.daysLeft} day
                    {portalStatus.daysLeft === 1 ? '' : 's'}.{' '}
                    <button
                      onClick={() => setTab('subscription')}
                      className="underline font-bold"
                    >
                      Renew now
                    </button>
                  </>
                )}
                {portalStatus.status === 'in_grace' && (
                  <>
                    🚨 Subscription expired. {portalStatus.graceLeft} grace day
                    {portalStatus.graceLeft === 1 ? '' : 's'} left before the portal locks.{' '}
                    <button
                      onClick={() => setTab('subscription')}
                      className="underline font-bold"
                    >
                      Renew now
                    </button>
                  </>
                )}
              </div>
            )}
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">
            {loading ? (
              <div className="text-center py-20 text-sm text-gray-500 italic">
                Loading data from Supabase…
              </div>
            ) : (
              <>
                {tab === 'dashboard' && (
                  <DashboardTab
                    students={students}
                    teachers={teachers}
                    exams={exams}
                    classLevels={classLevels}
                    switchTab={setTab}
                  />
                )}
                {tab === 'students' && (
                  <StudentsTab
                    students={students}
                    classes={classes}
                    refresh={loadAll}
                    showToast={showToast}
                    logAction={logAction}
                    askConfirm={askConfirm}
                  />
                )}
                {tab === 'teachers' && (
                  <TeachersTab
                    teachers={teachers}
                    classes={classes}
                    subjects={subjects}
                    classLevels={classLevels}
                    classSubjects={classSubjects}
                    streams={streams}
                    refresh={loadAll}
                    showToast={showToast}
                    logAction={logAction}
                    askConfirm={askConfirm}
                  />
                )}
                {tab === 'classes' && (
                  <ClassesTab
                    classLevels={classLevels}
                    streams={streams}
                    subjects={subjects}
                    classSubjects={classSubjects}
                    classes={classes}
                    students={students}
                    refresh={loadAll}
                    showToast={showToast}
                    logAction={logAction}
                    askConfirm={askConfirm}
                  />
                )}
                {tab === 'questions' && (
                  <QuestionsTab
                    exams={exams}
                    questions={questions}
                    subjects={subjects}
                    refresh={loadAll}
                    showToast={showToast}
                    askConfirm={askConfirm}
                  />
                )}
                {tab === 'exams' && (
                  <ExamsTab
                    exams={exams}
                    classes={classes}
                    subjects={subjects}
                    questions={questions}
                    defaultSession={currentSessionName}
                    defaultTerm={currentTermName}
                    refresh={loadAll}
                    showToast={showToast}
                    logAction={logAction}
                    askConfirm={askConfirm}
                  />
                )}
                {tab === 'live' && (
                  <LiveMonitorTab
                    exams={exams}
                    students={students}
                    classes={classes}
                    subjects={subjects}
                    questions={questions}
                    showToast={showToast}
                    logAction={logAction}
                    askConfirm={askConfirm}
                  />
                )}
                {tab === 'submissions' && (
                  <SubmissionsTab
                    exams={exams}
                    students={students}
                    showToast={showToast}
                  />
                )}
                {tab === 'broadsheet' && (
                  <BroadsheetTab
                    classes={classes}
                    subjects={subjects}
                    students={students}
                    scores={scores}
                    setScores={setScores}
                    reportCardPub={reportCardPub}
                    broadsheetLocks={broadsheetLocks}
                    defaultSession={currentSessionName}
                    defaultTerm={currentTermName}
                    refresh={loadAll}
                    showToast={showToast}
                    logAction={logAction}
                    askConfirm={askConfirm}
                  />
                )}
                {tab === 'news' && (
                  <NewsTab
                    announcements={announcements}
                    classes={classes}
                    refresh={loadAll}
                    showToast={showToast}
                    logAction={logAction}
                    askConfirm={askConfirm}
                  />
                )}
                {tab === 'subscription' && (
                  <SubscriptionTab
                    school={school}
                    plans={plans}
                    payments={payments}
                    paymentAccount={paymentAccount}
                    status={portalStatus}
                    refresh={loadAll}
                    showToast={showToast}
                    logAction={logAction}
                  />
                )}
                {tab === 'audit' && (
                  <AuditTab
                    audit={audit}
                    setAudit={setAudit}
                    showToast={showToast}
                    askConfirm={askConfirm}
                  />
                )}
                {tab === 'settings' && (
                  <SettingsTab
                    school={school}
                    sessions={sessions}
                    termCalendars={termCalendars}
                    currentSession={currentSession}
                    schoolLogo={schoolLogo}
                    refresh={loadAll}
                    showToast={showToast}
                    logAction={logAction}
                    askConfirm={askConfirm}
                  />
                )}
              </>
            )}
          </main>

          <footer className="px-6 lg:px-8 py-4 text-center text-[11px] text-gray-500 border-t border-slate-200 bg-white/50">
            {SCHOOL.name} · Admin Console v{SCHOOL.version} · {new Date().getFullYear()}
          </footer>
        </div>

        {/* ============================ TOASTS ============================ */}
        <div className="fixed bottom-6 right-6 z-[100] space-y-3 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto px-4 py-3 rounded-xl shadow-2xl text-white text-xs font-semibold max-w-sm border-l-4 ${
                t.tone === 'success'
                  ? 'bg-emerald-600 border-emerald-300'
                  : t.tone === 'error'
                  ? 'bg-red-600 border-red-300'
                  : t.tone === 'warn'
                  ? 'bg-amber-600 border-amber-300'
                  : 'bg-[#0A1E3D] border-amber-400'
              }`}
            >
              {t.msg}
            </div>
          ))}
        </div>

        {/* ============================ CONFIRM ============================ */}
        {confirmState && (
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <h3 className="font-bold text-[#0A1E3D] text-base">
                {confirmState.title}
              </h3>
              <p className="text-sm text-gray-600 mt-1">{confirmState.message}</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmState(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    confirmState.onConfirm()
                    setConfirmState(null)
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/* ============================================================================
   NAV
   ============================================================================ */

function NavGroup({ label }: { label: string }) {
  return (
    <p className="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
      {label}
    </p>
  )
}

function NavBtn({
  tab,
  current,
  onClick,
  icon,
  label,
}: {
  tab: Tab
  current: Tab
  onClick: (t: Tab) => void
  icon: string
  label: string
}) {
  const active = current === tab
  return (
    <button
      onClick={() => onClick(tab)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
        active
          ? 'bg-white/10 text-white font-semibold'
          : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon name={icon} /> {label}
    </button>
  )
}

/* ============================================================================
   ICONS
   ============================================================================ */

function Icon({ name }: { name: string }) {
  const c = {
    className: 'w-4 h-4',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    viewBox: '0 0 24 24',
  }
  switch (name) {
    case 'grid':
      return <svg {...c}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
    case 'users':
      return <svg {...c}><path d="M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87M16 3.13a4 4 0 0 1 0 7.75M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/></svg>
    case 'teach':
      return <svg {...c}><path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14v7"/></svg>
    case 'layers':
      return <svg {...c}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    case 'question':
      return <svg {...c}><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 5.83 1c0 2-3 2-3 4"/><path d="M12 17h.01"/></svg>
    case 'clock':
      return <svg {...c}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
    case 'activity':
      return <svg {...c}><path d="M3 12h4l3 9 4-18 3 9h4"/></svg>
    case 'check':
      return <svg {...c}><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
    case 'table':
      return <svg {...c}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
    case 'megaphone':
      return <svg {...c}><path d="M3 11v3a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8"/></svg>
    case 'credit-card':
      return <svg {...c}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
    case 'list':
      return <svg {...c}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
    case 'settings':
      return <svg {...c}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    case 'logout':
      return <svg {...c}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
    case 'menu':
      return <svg {...c}><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    case 'search':
      return <svg {...c}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
    case 'download':
      return <svg {...c}><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/></svg>
    case 'upload':
      return <svg {...c}><path d="M12 21V9m0 0l-4 4m4-4l4 4M5 3h14"/></svg>
    case 'refresh':
      return <svg {...c}><path d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 0 0-14.9-4M4 16a8 8 0 0 0 14.9 4"/></svg>
    case 'lock':
      return <svg {...c}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>
    case 'unlock':
      return <svg {...c}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>
    case 'calendar':
      return <svg {...c}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
    case 'edit':
      return <svg {...c}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    case 'plus':
      return <svg {...c}><path d="M12 5v14M5 12h14"/></svg>
    case 'trash':
      return <svg {...c}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
    case 'info':
      return <svg {...c}><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
    case 'external':
      return <svg {...c}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
    default:
      return null
  }
}
/* ============================================================================
   TAB: DASHBOARD
   ============================================================================ */

function DashboardTab({
  students,
  teachers,
  exams,
  classLevels,
  switchTab,
}: {
  students: Student[]
  teachers: Teacher[]
  exams: CbtExam[]
  classLevels: ClassLevel[]
  switchTab: (t: Tab) => void
}) {
  const live = exams.filter((e) => examDerivedStatus(e) === 'live').length
  const withPhoto = students.filter((s) => s.passport_url).length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Students"
          value={students.length}
          sub={`${withPhoto} with passport`}
        />
        <StatCard
          label="Teachers"
          value={teachers.length}
          sub="Active staff"
        />
        <StatCard
          label="Exams"
          value={exams.length}
          sub={`${live} live now`}
        />
        <StatCard
          label="Class Levels"
          value={classLevels.length}
          sub="JSS + SS combined"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="font-semibold text-[#0A1E3D]">Quick Actions</h2>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction label="Register Students" onClick={() => switchTab('students')} />
          <QuickAction label="Register Teachers" onClick={() => switchTab('teachers')} />
          <QuickAction label="Manage Classes" onClick={() => switchTab('classes')} />
          <QuickAction label="Create Exam" onClick={() => switchTab('exams')} />
          <QuickAction label="Live Monitor" onClick={() => switchTab('live')} />
          <QuickAction label="View Broadsheet" onClick={() => switchTab('broadsheet')} />
          <QuickAction label="Subscription" onClick={() => switchTab('subscription')} />
          <QuickAction label="Settings" onClick={() => switchTab('settings')} />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: number
  sub: string
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="text-2xl font-bold mt-1 text-[#0A1E3D]">{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
    </div>
  )
}

function QuickAction({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl ring-1 ring-slate-200 hover:ring-amber-300 hover:bg-amber-50/40 transition"
    >
      <p className="text-xs font-bold text-[#0A1E3D]">{label}</p>
      <p className="text-[10px] text-gray-500 mt-1">→</p>
    </button>
  )
}

/* ============================================================================
   TAB: STUDENTS
   ============================================================================ */

function StudentsTab({
  students,
  classes,
  refresh,
  showToast,
  logAction,
  askConfirm,
}: {
  students: Student[]
  classes: ClassRow[]
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const [form, setForm] = useState({
    admission_number: '',
    full_name: '',
    password: '',
    class_id: '',
    gender: 'Male' as 'Male' | 'Female',
    date_of_birth: '',
    parent_phone: '',
  })
  const [formPhoto, setFormPhoto] = useState<File | null>(null)
  const [formPhotoPreview, setFormPhotoPreview] = useState<string>('')

  const [q, setQ] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [saving, setSaving] = useState(false)
  const [editTarget, setEditTarget] = useState<Student | null>(null)
  const [bulkPreview, setBulkPreview] = useState<{
    valid: any[]
    duplicates: string[]
    errors: string[]
    unmatchedClasses: string[]
  } | null>(null)

  const classById = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.id, c.name])),
    [classes]
  )

  function handleFormPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      showToast('Only images are allowed.', 'error')
      e.target.value = ''
      return
    }
    if (f.size > PASSPORT_MAX_MB * 1024 * 1024) {
      showToast(`Max ${PASSPORT_MAX_MB} MB.`, 'error')
      e.target.value = ''
      return
    }
    setFormPhoto(f)
    setFormPhotoPreview(URL.createObjectURL(f))
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!form.class_id) {
      showToast('Pick a class.', 'error')
      return
    }
    if (form.date_of_birth && !isValidDate(form.date_of_birth)) {
      showToast('Invalid date of birth.', 'error')
      return
    }

    setSaving(true)

    let passport_url: string | null = null
    if (formPhoto) {
      const { url, error } = await uploadPassport(
        formPhoto,
        form.admission_number.trim()
      )
      if (error || !url) {
        showToast(`Passport upload failed: ${error}`, 'error')
        setSaving(false)
        return
      }
      passport_url = url
    }

    const { error } = await supabase.from('students').insert([
      {
        admission_number: form.admission_number.trim(),
        full_name: toTitleCase(form.full_name.trim()),
        password:
          form.password.trim() ||
          form.admission_number.replace(/[^A-Za-z0-9]/g, ''),
        class_id: form.class_id,
        gender: form.gender,
        date_of_birth: form.date_of_birth || null,
        parent_phone: form.parent_phone.trim() || null,
        passport_url,
      },
    ])

    setSaving(false)

    if (error) {
      showToast(`Save failed: ${error.message}`, 'error')
      return
    }

    showToast(`Student ${form.full_name} registered.`)
    logAction(
      'Student registered',
      `${form.full_name} · ${form.admission_number}${passport_url ? ' · photo' : ''}`
    )

    setForm({
      admission_number: '',
      full_name: '',
      password: '',
      class_id: '',
      gender: 'Male',
      date_of_birth: '',
      parent_phone: '',
    })
    setFormPhoto(null)
    setFormPhotoPreview('')
    refresh()
  }

  async function saveEdit(updated: Student, newPhoto: File | null) {
    let passport_url = updated.passport_url

    if (newPhoto) {
      if (updated.passport_url) await deletePassportByUrl(updated.passport_url)
      const { url, error } = await uploadPassport(
        newPhoto,
        updated.admission_number
      )
      if (error || !url) {
        showToast(`Photo upload failed: ${error}`, 'error')
        return false
      }
      passport_url = url
    }

    const { error } = await supabase
      .from('students')
      .update({
        full_name: updated.full_name,
        class_id: updated.class_id,
        gender: updated.gender,
        date_of_birth: updated.date_of_birth,
        parent_phone: updated.parent_phone,
        password: updated.password,
        passport_url,
      })
      .eq('id', updated.id)

    if (error) {
      showToast(`Update failed: ${error.message}`, 'error')
      return false
    }

    showToast(`Student ${updated.full_name} updated.`)
    logAction('Student updated', `${updated.full_name} (${updated.admission_number})`)
    refresh()
    return true
  }

  function resetPassword(s: Student) {
    const np = randomPassword(10)
    askConfirm(
      'Reset Password?',
      `Set new password for ${s.full_name}? New password: ${np}`,
      async () => {
        const { error } = await supabase
          .from('students')
          .update({ password: np })
          .eq('id', s.id)
        if (error) {
          showToast(`Reset failed: ${error.message}`, 'error')
          return
        }
        showToast(`New password for ${s.full_name}: ${np}`, 'warn')
        logAction('Student password reset', `${s.full_name}`)
        refresh()
      }
    )
  }

  function removeStudent(s: Student) {
    askConfirm(
      'Remove Student?',
      `Permanently remove ${s.full_name} (${s.admission_number})? Photo will also be deleted.`,
      async () => {
        if (s.passport_url) await deletePassportByUrl(s.passport_url)
        const { error } = await supabase.from('students').delete().eq('id', s.id)
        if (error) {
          showToast(`Delete failed: ${error.message}`, 'error')
          return
        }
        showToast('Student removed.', 'warn')
        logAction('Student removed', `${s.full_name}`)
        refresh()
      }
    )
  }

  function downloadSample() {
    const rows: any[][] = [
      [
        'Admission No',
        'Full Name',
        'Class',
        'Gender',
        'Date of Birth',
        'Parent Phone',
        'Password',
      ],
      ['IRIS/2026/050', 'Yusuf Amina Bello', 'JSS 1', 'Female', '2014-08-22', '08031234567', 'YUSUF2026'],
      ['IRIS/2026/051', 'Okafor Chinedu', 'SS 1', 'Male', '2010-03-15', '08059876543', 'OKAFOR2026'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [
      { wch: 18 },
      { wch: 26 },
      { wch: 18 },
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Students')
    XLSX.writeFile(wb, 'IRIS_Students_Sample.xlsx')
    showToast('Sample downloaded.', 'info')
  }

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, defval: '' })
        if (rows.length < 2) {
          showToast('File is empty.', 'error')
          return
        }

        const header = (rows[0] as string[]).map(normalizeHeader)
        const idx = (name: string) => header.indexOf(name)
        const iAdm = idx('admission_no')
        const iName = idx('full_name')
        const iClass = idx('class')
        const iGender = idx('gender')
        const iDob = idx('date_of_birth')
        const iPhone = idx('parent_phone')
        const iPass = idx('password')

        if (iAdm === -1 || iName === -1 || iClass === -1) {
          showToast('Missing required columns: Admission No, Full Name, Class.', 'error')
          return
        }

        const classNameToId = new Map<string, string>()
        classes.forEach((c) => classNameToId.set(normalizeName(c.name), c.id))

        const { data: existingRows } = await supabase
          .from('students')
          .select('admission_number')
        const existingSet = new Set<string>(
          (existingRows || []).map((r: any) =>
            String(r.admission_number).toLowerCase()
          )
        )

        const valid: any[] = []
        const duplicates: string[] = []
        const errors: string[] = []
        const unmatchedClasses: string[] = []
        const seen = new Set<string>()

        rows.slice(1).forEach((r, i) => {
          const rowNum = i + 2
          const adm = String(r[iAdm] ?? '').trim()
          const name = String(r[iName] ?? '').trim()
          const cls = String(r[iClass] ?? '').trim()
          const gender = iGender !== -1 ? String(r[iGender] ?? '').trim() : ''
          const dobRaw = iDob !== -1 ? r[iDob] : ''
          const phone = iPhone !== -1 ? String(r[iPhone] ?? '').trim() : ''
          const pass = iPass !== -1 ? String(r[iPass] ?? '').trim() : ''

          if (!adm && !name && !cls) return
          if (!adm) {
            errors.push(`Row ${rowNum}: missing Admission No`)
            return
          }
          if (!name) {
            errors.push(`Row ${rowNum}: missing Full Name`)
            return
          }
          if (!cls) {
            errors.push(`Row ${rowNum}: missing Class`)
            return
          }

          const classId = classNameToId.get(normalizeName(cls))
          if (!classId) {
            unmatchedClasses.push(`Row ${rowNum}: ${cls}`)
            return
          }

          let dob: string | null = null
          if (dobRaw !== '' && dobRaw != null) {
            const parsed = parseDobAny(dobRaw)
            if (!parsed) {
              errors.push(`Row ${rowNum}: invalid Date of Birth`)
              return
            }
            dob = parsed
          }

          const lower = adm.toLowerCase()
          if (existingSet.has(lower)) {
            duplicates.push(adm)
            return
          }
          if (seen.has(lower)) {
            duplicates.push(adm)
            return
          }
          seen.add(lower)

          valid.push({
            admission_number: adm,
            full_name: toTitleCase(name),
            password: pass || adm.replace(/[^A-Za-z0-9]/g, ''),
            class_id: classId,
            gender: gender === 'Female' ? 'Female' : 'Male',
            date_of_birth: dob,
            parent_phone: phone || null,
            passport_url: null,
          })
        })

        setBulkPreview({ valid, duplicates, errors, unmatchedClasses })
      } catch {
        showToast('Could not read the Excel file.', 'error')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function confirmBulk() {
    if (!bulkPreview || bulkPreview.valid.length === 0) return
    const { error } = await supabase.from('students').insert(bulkPreview.valid)
    if (error) {
      showToast(`Insert failed: ${error.message}`, 'error')
      return
    }
    showToast(
      `${bulkPreview.valid.length} student(s) added. ${bulkPreview.duplicates.length} skipped.`
    )
    logAction('Bulk student upload', `${bulkPreview.valid.length} added`)
    setBulkPreview(null)
    refresh()
  }

  const filtered = useMemo(() => {
    return students.filter(
      (s) =>
        (!q ||
          s.full_name.toLowerCase().includes(q.toLowerCase()) ||
          s.admission_number.toLowerCase().includes(q.toLowerCase())) &&
        (!filterClass || s.class_id === filterClass)
    )
  }, [students, q, filterClass])

  return (
    <div className="space-y-5">
      {/* Bulk upload */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[#0A1E3D]">Bulk Student Upload</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Add photos individually via Edit after upload.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadSample}
              className="inline-flex items-center gap-2 text-xs font-semibold bg-[#0A1E3D] text-white px-3.5 py-2 rounded-lg hover:bg-black"
            >
              <Icon name="download" /> Sample Excel
            </button>
            <label className="inline-flex items-center gap-2 text-xs font-semibold bg-amber-500 text-white px-3.5 py-2 rounded-lg hover:bg-amber-600 cursor-pointer">
              <Icon name="upload" /> Upload Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleBulkUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {bulkPreview && (
          <div className="p-5 bg-slate-50 border-b border-slate-100 space-y-3">
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 font-semibold">
                {bulkPreview.valid.length} ready
              </span>
              {bulkPreview.duplicates.length > 0 && (
                <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 font-semibold">
                  {bulkPreview.duplicates.length} duplicate(s)
                </span>
              )}
              {bulkPreview.errors.length > 0 && (
                <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 font-semibold">
                  {bulkPreview.errors.length} error(s)
                </span>
              )}
              {bulkPreview.unmatchedClasses.length > 0 && (
                <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 font-semibold">
                  {bulkPreview.unmatchedClasses.length} unknown class(es)
                </span>
              )}
            </div>

            {bulkPreview.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1">
                {bulkPreview.errors.slice(0, 5).map((e, i) => (
                  <div key={i}>• {e}</div>
                ))}
              </div>
            )}
            {bulkPreview.unmatchedClasses.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                Unknown classes: {bulkPreview.unmatchedClasses.slice(0, 5).join(' · ')}
              </div>
            )}
            {bulkPreview.duplicates.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                Skipping: {bulkPreview.duplicates.slice(0, 10).join(', ')}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkPreview(null)}
                className="text-xs font-semibold px-4 py-2 rounded-lg text-gray-700 hover:bg-red-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulk}
                disabled={bulkPreview.valid.length === 0}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
              >
                Confirm Import ({bulkPreview.valid.length})
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Register single */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="font-semibold text-[#0A1E3D]">Register Single Student</h2>
          </div>
          <form onSubmit={addStudent} className="p-5 space-y-3.5">
            <div className="flex items-center gap-4">
              <div className="w-20 h-24 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                {formPhotoPreview ? (
                  <img
                    src={formPhotoPreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] text-gray-400 text-center px-1">
                    No photo
                  </span>
                )}
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
                  Passport Photo (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFormPhotoChange}
                  className="w-full text-[11px] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-[#0A1E3D] file:text-white hover:file:bg-black bg-white border border-amber-200 rounded-xl p-1"
                />
                {formPhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormPhoto(null)
                      setFormPhotoPreview('')
                    }}
                    className="text-[10px] font-bold text-red-600 mt-1 underline"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            <FormField label="Admission Number" required>
              <input
                required
                value={form.admission_number}
                onChange={(e) =>
                  setForm({ ...form, admission_number: e.target.value })
                }
                placeholder="IRIS/2026/050"
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl font-mono outline-none text-[#1A2332]"
              />
            </FormField>

            <FormField label="Full Name" required>
              <input
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Yusuf Amina Bello"
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
            </FormField>

            <FormField label="Class" required>
              <select
                required
                value={form.class_id}
                onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              >
                <option value="">-- Choose Class --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Gender" required>
                <select
                  value={form.gender}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      gender: e.target.value as 'Male' | 'Female',
                    })
                  }
                  className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                >
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </FormField>
              <FormField label="Date of Birth" required>
                <input
                  type="date"
                  max={todayIso()}
                  required
                  value={form.date_of_birth}
                  onChange={(e) =>
                    setForm({ ...form, date_of_birth: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                />
              </FormField>
            </div>

            <FormField label="Portal Password" required>
              <input
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="e.g. YUSUF2026"
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
            </FormField>

            <FormField label="Parent Phone">
              <input
                value={form.parent_phone}
                onChange={(e) =>
                  setForm({ ...form, parent_phone: e.target.value })
                }
                placeholder="08030000000"
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
            </FormField>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Register Student'}
            </button>
          </form>
        </div>

        {/* Directory */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="font-semibold text-[#0A1E3D]">Student Directory</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Total: {filtered.length} of {students.length}
            </p>
          </div>

          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-grow">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Icon name="search" />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="w-full text-sm pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-[#1A2332]"
              />
            </div>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-[#1A2332]"
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0A1E3D] text-white text-[11px] uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-3 py-3 w-14 text-white">Photo</th>
                  <th className="px-4 py-3 text-white">Adm No</th>
                  <th className="px-4 py-3 text-white">Full Name</th>
                  <th className="px-4 py-3 text-white">Class</th>
                  <th className="px-4 py-3 text-center text-white">Age</th>
                  <th className="px-4 py-3 text-white">Gender</th>
                  <th className="px-4 py-3 text-right text-white">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-amber-50/40">
                    <td className="px-3 py-2 bg-white">
                      {s.passport_url ? (
                        <img
                          src={s.passport_url}
                          alt={s.full_name}
                          className="w-10 h-12 object-cover rounded-lg ring-1 ring-slate-200"
                        />
                      ) : (
                        <div className="w-10 h-12 rounded-lg bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center text-[9px] text-gray-400">
                          None
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-amber-700 font-semibold bg-white">
                      {s.admission_number}
                    </td>
                    <td className="px-4 py-3 font-bold text-[#0A1E3D] bg-white">
                      {s.full_name}
                    </td>
                    <td className="px-4 py-3 text-[#1A2332] bg-white">
                      {classById[s.class_id || ''] || '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-[#1A2332] bg-white">
                      {ageFromDob(s.date_of_birth) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[#1A2332] bg-white">
                      {s.gender || '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap bg-white">
                      <button
                        onClick={() => setEditTarget(s)}
                        className="text-blue-700 hover:text-blue-800 font-bold text-[11px] mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => resetPassword(s)}
                        className="text-amber-700 hover:text-amber-800 font-bold text-[11px] mr-3"
                      >
                        Reset PW
                      </button>
                      <button
                        onClick={() => removeStudent(s)}
                        className="text-red-700 hover:text-red-800 font-bold text-[11px]"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-xs text-gray-500 italic bg-white"
                    >
                      No students found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editTarget && (
        <EditStudentModal
          student={editTarget}
          classes={classes}
          onClose={() => setEditTarget(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  )
}

/* ============================================================================
   EDIT STUDENT MODAL
   ============================================================================ */

function EditStudentModal({
  student,
  classes,
  onClose,
  onSave,
}: {
  student: Student
  classes: ClassRow[]
  onClose: () => void
  onSave: (s: Student, newPhoto: File | null) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<Student>({ ...student })
  const [newPhoto, setNewPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>(
    student.passport_url || ''
  )
  const [saving, setSaving] = useState(false)

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) return
    if (f.size > PASSPORT_MAX_MB * 1024 * 1024) return
    setNewPhoto(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.full_name.trim() || !draft.class_id) return
    if (draft.date_of_birth && !isValidDate(draft.date_of_birth)) return
    setSaving(true)
    const ok = await onSave(
      { ...draft, full_name: toTitleCase(draft.full_name.trim()) },
      newPhoto
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full my-8">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[#0A1E3D] text-base">Edit Student</h3>
            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
              {student.admission_number} (locked)
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-gray-600"
          >
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-24 h-28 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[10px] text-gray-400 text-center px-1">
                  No photo
                </span>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
                {student.passport_url ? 'Replace Photo' : 'Add Photo'}
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="w-full text-[11px] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-[#0A1E3D] file:text-white hover:file:bg-black bg-white border border-amber-200 rounded-xl p-1"
              />
            </div>
          </div>

          <FormField label="Full Name" required>
            <input
              required
              value={draft.full_name}
              onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Class" required>
              <select
                value={draft.class_id || ''}
                onChange={(e) => setDraft({ ...draft, class_id: e.target.value })}
                className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              >
                <option value="">-- Choose --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Gender" required>
              <select
                value={draft.gender || 'Male'}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    gender: e.target.value as 'Male' | 'Female',
                  })
                }
                className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              >
                <option>Male</option>
                <option>Female</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date of Birth" required>
              <input
                type="date"
                max={todayIso()}
                required
                value={draft.date_of_birth || ''}
                onChange={(e) =>
                  setDraft({ ...draft, date_of_birth: e.target.value })
                }
                className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
            </FormField>
            <FormField label="Computed Age">
              <input
                value={ageFromDob(draft.date_of_birth) ?? '—'}
                disabled
                className="w-full text-sm px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-gray-700"
              />
            </FormField>
          </div>

          <FormField label="Parent Phone">
            <input
              value={draft.parent_phone || ''}
              onChange={(e) =>
                setDraft({ ...draft, parent_phone: e.target.value })
              }
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>

          <FormField label="Password" required>
            <input
              required
              value={draft.password || ''}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl font-mono outline-none text-[#1A2332]"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
/* ============================================================================
   TAB: TEACHERS
   ============================================================================ */

function TeachersTab({
  teachers,
  classes,
  subjects,
  classLevels,
  classSubjects,
  streams,
  refresh,
  showToast,
  logAction,
  askConfirm,
}: {
  teachers: Teacher[]
  classes: ClassRow[]
  subjects: SubjectRow[]
  classLevels: ClassLevel[]
  classSubjects: ClassSubject[]
  streams: Stream[]
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const [form, setForm] = useState({
    staff_id: '',
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role_type: 'subject' as 'subject' | 'class' | 'both',
    assigned_class_ids: [] as string[],
    assigned_subjects: '',
  })
  const [saving, setSaving] = useState(false)
  const [editTarget, setEditTarget] = useState<Teacher | null>(null)
  const [assignTarget, setAssignTarget] = useState<Teacher | null>(null)

  const classById = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.id, c.name])),
    [classes]
  )
  const subjectById = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    [subjects]
  )

  function toggleClass(id: string) {
    setForm((prev) => {
      const has = prev.assigned_class_ids.includes(id)
      return {
        ...prev,
        assigned_class_ids: has
          ? prev.assigned_class_ids.filter((x) => x !== id)
          : [...prev.assigned_class_ids, id],
      }
    })
  }

  async function addTeacher(e: React.FormEvent) {
    e.preventDefault()
    if (
      (form.role_type === 'class' || form.role_type === 'both') &&
      form.assigned_class_ids.length === 0
    ) {
      showToast('Pick at least one assigned class.', 'error')
      return
    }
    setSaving(true)

    const primaryClass = form.assigned_class_ids[0] || null

    const { data: inserted, error } = await supabase
      .from('teachers')
      .insert([
        {
          staff_id: form.staff_id.trim(),
          full_name: toTitleCase(form.full_name.trim()),
          email: form.email.trim(),
          password: form.password.trim(),
          phone: form.phone.trim() || null,
          role_type: form.role_type,
          assigned_class_id: form.role_type === 'subject' ? null : primaryClass,
          assigned_subjects: form.assigned_subjects.trim() || null,
        },
      ])
      .select()
      .single()

    if (error || !inserted) {
      setSaving(false)
      showToast(`Save failed: ${error?.message || 'unknown error'}`, 'error')
      return
    }

    if (form.role_type !== 'subject' && form.assigned_class_ids.length > 0) {
      const rows = form.assigned_class_ids.map((cid, i) => ({
        teacher_id: inserted.id,
        class_id: cid,
        is_primary: i === 0,
      }))
      const { error: tcErr } = await supabase.from('teacher_classes').insert(rows)
      if (tcErr) {
        setSaving(false)
        showToast(
          `Teacher created but class assignment failed: ${tcErr.message}`,
          'warn'
        )
        refresh()
        return
      }
    }

    setSaving(false)
    showToast(`Teacher ${form.full_name} registered.`)
    logAction('Teacher registered', `${form.full_name} · ${form.staff_id}`)
    setForm({
      staff_id: '',
      full_name: '',
      email: '',
      password: '',
      phone: '',
      role_type: 'subject',
      assigned_class_ids: [],
      assigned_subjects: '',
    })
    refresh()
  }

  async function saveEdit(
    updated: Teacher,
    newClassIds: string[],
    newSubjectIds: string[]
  ): Promise<boolean> {
    const assigned_class_id =
      updated.role_type === 'subject' ? null : newClassIds[0] || null

    // Build the text summary of subjects (backward-compat for student portal)
    const subjectNames = newSubjectIds
      .map((sid) => subjectById[sid])
      .filter(Boolean)
    const assigned_subjects = subjectNames.length > 0 ? subjectNames.join(', ') : null

    const { error } = await supabase
      .from('teachers')
      .update({
        full_name: updated.full_name,
        email: updated.email,
        phone: updated.phone,
        password: updated.password,
        role_type: updated.role_type,
        assigned_class_id,
        assigned_subjects,
      })
      .eq('id', updated.id)

    if (error) {
      showToast(`Update failed: ${error.message}`, 'error')
      return false
    }

    // Refresh teacher_classes
    const { error: delClassErr } = await supabase
      .from('teacher_classes')
      .delete()
      .eq('teacher_id', updated.id)
    if (delClassErr) {
      showToast(
        `Teacher updated but class links failed: ${delClassErr.message}`,
        'warn'
      )
    } else if (updated.role_type !== 'subject' && newClassIds.length > 0) {
      const rows = newClassIds.map((cid, i) => ({
        teacher_id: updated.id,
        class_id: cid,
        is_primary: i === 0,
      }))
      const { error: insErr } = await supabase
        .from('teacher_classes')
        .insert(rows)
      if (insErr) {
        showToast(
          `Teacher updated but class links failed: ${insErr.message}`,
          'warn'
        )
      }
    }

    // Refresh teacher_subjects
    const { error: delSubjErr } = await supabase
      .from('teacher_subjects')
      .delete()
      .eq('teacher_id', updated.id)
    if (delSubjErr) {
      showToast(
        `Teacher updated but subject links failed: ${delSubjErr.message}`,
        'warn'
      )
    } else if (newSubjectIds.length > 0) {
      const rows = newSubjectIds.map((sid) => ({
        teacher_id: updated.id,
        subject_id: sid,
        class_id: newClassIds[0] || null,
      }))
      const { error: insErr } = await supabase
        .from('teacher_subjects')
        .insert(rows)
      if (insErr) {
        showToast(
          `Teacher updated but subject links failed: ${insErr.message}`,
          'warn'
        )
      }
    }

    showToast(`Teacher ${updated.full_name} updated.`)
    logAction(
      'Teacher updated',
      `${updated.full_name} · ${newClassIds.length} class(es) · ${newSubjectIds.length} subject(s)`
    )
    refresh()
    return true
  }

  async function saveAssignedSubjects(
    teacher: Teacher,
    subjectIds: string[]
  ): Promise<boolean> {
    const subjectNames = subjectIds
      .map((sid) => subjectById[sid])
      .filter(Boolean)
    const assigned_subjects = subjectNames.length > 0 ? subjectNames.join(', ') : null

    const { error } = await supabase
      .from('teachers')
      .update({ assigned_subjects })
      .eq('id', teacher.id)

    if (error) {
      showToast(`Update failed: ${error.message}`, 'error')
      return false
    }

    const { error: delErr } = await supabase
      .from('teacher_subjects')
      .delete()
      .eq('teacher_id', teacher.id)
    if (delErr) {
      showToast(`Update failed: ${delErr.message}`, 'error')
      return false
    }

    if (subjectIds.length > 0) {
      const rows = subjectIds.map((sid) => ({
        teacher_id: teacher.id,
        subject_id: sid,
        class_id: teacher.class_ids?.[0] || null,
      }))
      const { error: insErr } = await supabase
        .from('teacher_subjects')
        .insert(rows)
      if (insErr) {
        showToast(`Update failed: ${insErr.message}`, 'error')
        return false
      }
    }

    showToast(`Subjects updated for ${teacher.full_name}.`)
    logAction('Teacher subjects updated', `${teacher.full_name} · ${subjectIds.length} subject(s)`)
    refresh()
    return true
  }

  function resetPassword(t: Teacher) {
    const np = randomPassword(10)
    askConfirm(
      'Reset Password?',
      `Set new password for ${t.full_name}? New password: ${np}`,
      async () => {
        const { error } = await supabase
          .from('teachers')
          .update({ password: np })
          .eq('id', t.id)
        if (error) {
          showToast(`Reset failed: ${error.message}`, 'error')
          return
        }
        showToast(`New password for ${t.full_name}: ${np}`, 'warn')
        logAction('Teacher password reset', `${t.full_name}`)
        refresh()
      }
    )
  }

  function removeTeacher(t: Teacher) {
    askConfirm(
      'Remove Teacher?',
      `Remove ${t.full_name} from staff register?`,
      async () => {
        const { error } = await supabase
          .from('teachers')
          .delete()
          .eq('id', t.id)
        if (error) {
          showToast(`Delete failed: ${error.message}`, 'error')
          return
        }
        showToast('Teacher removed.', 'warn')
        logAction('Teacher removed', t.full_name)
        refresh()
      }
    )
  }

  const ROLE_LABEL: Record<Teacher['role_type'], string> = {
    subject: 'Subject Teacher',
    class: 'Class Teacher',
    both: 'Class & Subject Teacher',
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Register single */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="font-semibold text-[#0A1E3D]">Register Single Teacher</h2>
        </div>
        <form onSubmit={addTeacher} className="p-5 space-y-3.5">
          <FormField label="Staff ID" required>
            <input
              required
              value={form.staff_id}
              onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
              placeholder="IRIS/STF/009"
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl font-mono outline-none text-[#1A2332]"
            />
          </FormField>

          <FormField label="Full Name" required>
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Dr. Aliyu Ibrahim"
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>

          <FormField label="Email" required>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>

          <FormField label="Password" required>
            <input
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>

          <FormField label="Phone">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>

          <FormField label="Role Type" required>
            <select
              value={form.role_type}
              onChange={(e) =>
                setForm({ ...form, role_type: e.target.value as any })
              }
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            >
              <option value="subject">Subject Teacher</option>
              <option value="class">Class Teacher</option>
              <option value="both">Class &amp; Subject Teacher</option>
            </select>
          </FormField>

          {form.role_type !== 'subject' && (
            <div>
              <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
                Assigned Classes <span className="text-amber-600">*</span>
                <span className="text-[10px] text-gray-500 font-normal ml-1">
                  (tick all that apply — first one becomes primary)
                </span>
              </label>
              <div className="max-h-40 overflow-y-auto border border-amber-200 rounded-xl p-2 space-y-1 bg-white">
                {classes.map((c) => {
                  const idx = form.assigned_class_ids.indexOf(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={idx !== -1}
                        onChange={() => toggleClass(c.id)}
                        className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm text-[#1A2332] flex-1">
                        {c.name}
                      </span>
                      {idx === 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          PRIMARY
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {form.role_type !== 'class' && (
            <FormField label="Assigned Subjects (comma-separated)">
              <input
                value={form.assigned_subjects}
                onChange={(e) =>
                  setForm({ ...form, assigned_subjects: e.target.value })
                }
                placeholder="Mathematics, Physics"
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Tip: use the "Assign Subjects" button in the directory to open the
                full picker with combos.
              </p>
            </FormField>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Register Teacher'}
          </button>
        </form>
      </div>

      {/* Directory */}
      <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="font-semibold text-[#0A1E3D]">Teacher Directory</h2>
          <p className="text-xs text-gray-500 mt-0.5">Total: {teachers.length}</p>
        </div>
        <div className="overflow-x-auto max-h-[620px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A1E3D] text-white text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-white">Staff ID</th>
                <th className="px-4 py-3 text-white">Name</th>
                <th className="px-4 py-3 text-white">Role</th>
                <th className="px-4 py-3 text-white">Classes</th>
                <th className="px-4 py-3 text-white">Subjects</th>
                <th className="px-4 py-3 text-right text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {teachers.map((t) => {
                const classNames = (t.class_ids || [])
                  .map((id) => classById[id])
                  .filter(Boolean)
                const subjectNames = (t.subject_ids || [])
                  .map((id) => subjectById[id])
                  .filter(Boolean)
                return (
                  <tr key={t.id} className="hover:bg-amber-50/40">
                    <td className="px-4 py-3 font-mono text-amber-700 font-semibold bg-white">
                      {t.staff_id}
                    </td>
                    <td className="px-4 py-3 font-bold text-[#0A1E3D] bg-white">
                      {t.full_name}
                    </td>
                    <td className="px-4 py-3 bg-white">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 uppercase">
                        {ROLE_LABEL[t.role_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#1A2332] bg-white">
                      {classNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {classNames.map((n, i) => (
                            <span
                              key={i}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-gray-700 ring-1 ring-slate-200"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#1A2332] bg-white">
                      {subjectNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {subjectNames.slice(0, 4).map((n, i) => (
                            <span
                              key={i}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                            >
                              {n}
                            </span>
                          ))}
                          {subjectNames.length > 4 && (
                            <span className="text-[10px] text-gray-500">
                              +{subjectNames.length - 4}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">
                          {t.assigned_subjects || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap bg-white">
                      <button
                        onClick={() => setAssignTarget(t)}
                        className="text-emerald-700 hover:text-emerald-800 font-bold text-[11px] mr-3"
                      >
                        Assign Subjects
                      </button>
                      <button
                        onClick={() => setEditTarget(t)}
                        className="text-blue-700 hover:text-blue-800 font-bold text-[11px] mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => resetPassword(t)}
                        className="text-amber-700 hover:text-amber-800 font-bold text-[11px] mr-3"
                      >
                        Reset PW
                      </button>
                      <button
                        onClick={() => removeTeacher(t)}
                        className="text-red-700 hover:text-red-800 font-bold text-[11px]"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
              {teachers.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-xs text-gray-500 italic bg-white"
                  >
                    No teachers registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editTarget && (
        <EditTeacherModal
          teacher={editTarget}
          classes={classes}
          subjects={subjects}
          classLevels={classLevels}
          classSubjects={classSubjects}
          streams={streams}
          onClose={() => setEditTarget(null)}
          onSave={saveEdit}
        />
      )}

      {assignTarget && (
        <AssignSubjectsModal
          teacher={assignTarget}
          subjects={subjects}
          onClose={() => setAssignTarget(null)}
          onSave={saveAssignedSubjects}
        />
      )}
    </div>
  )
}

/* ============================================================================
   ASSIGN SUBJECTS MODAL — checkbox grid + combos
   ============================================================================ */

function AssignSubjectsModal({
  teacher,
  subjects,
  onClose,
  onSave,
}: {
  teacher: Teacher
  subjects: SubjectRow[]
  onClose: () => void
  onSave: (t: Teacher, subjectIds: string[]) => Promise<boolean>
}) {
  const initial = teacher.subject_ids || []
  const [selected, setSelected] = useState<string[]>(initial)
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    if (!q.trim()) return subjects
    const needle = q.trim().toLowerCase()
    return subjects.filter((s) => s.name.toLowerCase().includes(needle))
  }, [subjects, q])

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function applyCombo(comboName: string) {
    const combo = SUBJECT_COMBOS.find((c) => c.name === comboName)
    if (!combo) return
    const matching = subjects.filter((s) => combo.match(s.name)).map((s) => s.id)
    const merged = Array.from(new Set([...selected, ...matching]))
    setSelected(merged)
  }

  function clearAll() {
    setSelected([])
  }

  function selectAllVisible() {
    const visibleIds = filtered.map((s) => s.id)
    setSelected((prev) => Array.from(new Set([...prev, ...visibleIds])))
  }

  async function submit() {
    setSaving(true)
    const ok = await onSave(teacher, selected)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[#0A1E3D] text-base">
              Assign Subjects
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {teacher.full_name} · {teacher.staff_id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Combos */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-2">
              Quick Combos
            </p>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COMBOS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => applyCombo(c.name)}
                  className="text-[11px] font-bold px-3 py-2 rounded-lg bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                  title={c.description}
                >
                  + {c.name}
                </button>
              ))}
              <button
                onClick={selectAllVisible}
                className="text-[11px] font-bold px-3 py-2 rounded-lg bg-slate-100 text-gray-700 ring-1 ring-slate-200 hover:bg-slate-200"
              >
                ✓ Select all visible
              </button>
              <button
                onClick={clearAll}
                className="text-[11px] font-bold px-3 py-2 rounded-lg bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100"
              >
                ✕ Clear all
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Icon name="search" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search subjects…"
              className="w-full text-sm pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-[#1A2332]"
            />
          </div>

          {/* Grid */}
          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white">
            {filtered.map((s) => {
              const checked = selected.includes(s.id)
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ring-1 transition ${
                    checked
                      ? 'bg-emerald-50 ring-emerald-200'
                      : 'bg-white ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(s.id)}
                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm text-[#1A2332] flex-1">
                    {s.name}
                  </span>
                </label>
              )
            })}
            {filtered.length === 0 && (
              <div className="col-span-2 text-center py-8 text-xs text-gray-500 italic">
                No subjects match your search.
              </div>
            )}
          </div>

          <p className="text-[11px] text-gray-600">
            <span className="font-bold text-[#0A1E3D]">{selected.length}</span>{' '}
            subject{selected.length === 1 ? '' : 's'} selected
          </p>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Subjects'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   EDIT TEACHER MODAL
   ============================================================================ */

function EditTeacherModal({
  teacher,
  classes,
  subjects,
  classLevels,
  classSubjects,
  streams,
  onClose,
  onSave,
}: {
  teacher: Teacher
  classes: ClassRow[]
  subjects: SubjectRow[]
  classLevels: ClassLevel[]
  classSubjects: ClassSubject[]
  streams: Stream[]
  onClose: () => void
  onSave: (
    t: Teacher,
    newClassIds: string[],
    newSubjectIds: string[]
  ) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<Teacher>({ ...teacher })
  const [classIds, setClassIds] = useState<string[]>(
    teacher.class_ids ||
      (teacher.assigned_class_id ? [teacher.assigned_class_id] : [])
  )
  const [subjectIds, setSubjectIds] = useState<string[]>(
    teacher.subject_ids || []
  )
  const [saving, setSaving] = useState(false)

  const subjectById = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    [subjects]
  )

  function toggleClass(id: string) {
    setClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function toggleSubject(id: string) {
    setSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function applyCombo(name: string) {
    const combo = SUBJECT_COMBOS.find((c) => c.name === name)
    if (!combo) return
    const matching = subjects.filter((s) => combo.match(s.name)).map((s) => s.id)
    setSubjectIds((prev) => Array.from(new Set([...prev, ...matching])))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.full_name.trim() || !draft.email.trim()) return
    if (
      (draft.role_type === 'class' || draft.role_type === 'both') &&
      classIds.length === 0
    ) {
      alert('Pick at least one class.')
      return
    }
    setSaving(true)
    const ok = await onSave(
      {
        ...draft,
        full_name: toTitleCase(draft.full_name.trim()),
        email: draft.email.trim(),
      },
      draft.role_type === 'subject' ? [] : classIds,
      draft.role_type === 'class' ? [] : subjectIds
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[#0A1E3D] text-base">Edit Teacher</h3>
            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
              {teacher.staff_id} (locked)
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <FormField label="Full Name" required>
            <input
              required
              value={draft.full_name}
              onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>

          <FormField label="Email" required>
            <input
              type="email"
              required
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>

          <FormField label="Phone">
            <input
              value={draft.phone || ''}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>

          <FormField label="Password" required>
            <input
              required
              value={draft.password || ''}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl font-mono outline-none text-[#1A2332]"
            />
          </FormField>

          <FormField label="Role Type" required>
            <select
              value={draft.role_type}
              onChange={(e) =>
                setDraft({ ...draft, role_type: e.target.value as Teacher['role_type'] })
              }
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            >
              <option value="subject">Subject Teacher</option>
              <option value="class">Class Teacher</option>
              <option value="both">Class &amp; Subject Teacher</option>
            </select>
          </FormField>

          {draft.role_type !== 'subject' && (
            <div>
              <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
                Assigned Classes <span className="text-amber-600">*</span>
              </label>
              <div className="max-h-40 overflow-y-auto border border-amber-200 rounded-xl p-2 space-y-1 bg-white">
                {classes.map((c) => {
                  const idx = classIds.indexOf(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={idx !== -1}
                        onChange={() => toggleClass(c.id)}
                        className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm text-[#1A2332] flex-1">
                        {c.name}
                      </span>
                      {idx === 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          PRIMARY
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {draft.role_type !== 'class' && (
            <div>
              <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
                Assigned Subjects
              </label>

              <div className="flex flex-wrap gap-2 mb-2">
                {SUBJECT_COMBOS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => applyCombo(c.name)}
                    className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                    title={c.description}
                  >
                    + {c.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSubjectIds([])}
                  className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                >
                  Clear
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto border border-amber-200 rounded-xl p-2 grid grid-cols-1 sm:grid-cols-2 gap-1 bg-white">
                {subjects.map((s) => {
                  const checked = subjectIds.includes(s.id)
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${
                        checked ? 'bg-emerald-50' : 'hover:bg-amber-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSubject(s.id)}
                        className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs text-[#1A2332] flex-1">
                        {s.name}
                      </span>
                    </label>
                  )
                })}
              </div>

              <p className="text-[10px] text-gray-500 mt-1">
                <span className="font-bold text-[#0A1E3D]">{subjectIds.length}</span>{' '}
                subject{subjectIds.length === 1 ? '' : 's'} selected
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
/* ============================================================================
   TAB: CLASSES & SUBJECTS
   6 level tabs (JSS 1-3, SS 1-3). SS gets stream sub-tabs (Science/Arts/Commercial).
   JSS levels share ONE subject list (linked via JSS_GROUP pseudo-level).
   ============================================================================ */

// Marker: class_level_id used to denote the shared JSS subject list.
// We store the JSS shared list against the JSS 1 level and mirror it to
// JSS 2 and JSS 3 in the UI so editing one reflects on all three.
const JSS_SHARED_LEVEL_NAME = 'JSS 1'

function ClassesTab({
  classLevels,
  streams,
  subjects,
  classSubjects,
  classes,
  students,
  refresh,
  showToast,
  logAction,
  askConfirm,
}: {
  classLevels: ClassLevel[]
  streams: Stream[]
  subjects: SubjectRow[]
  classSubjects: ClassSubject[]
  classes: ClassRow[]
  students: Student[]
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const [selectedLevelId, setSelectedLevelId] = useState<string>('')
  const [selectedStreamId, setSelectedStreamId] = useState<string>('')
  const [showAddModal, setShowAddModal] = useState(false)

  // Initialize selection when levels load
  useEffect(() => {
    if (!selectedLevelId && classLevels.length > 0) {
      setSelectedLevelId(classLevels[0].id)
    }
  }, [classLevels, selectedLevelId])

  const selectedLevel = useMemo(
    () => classLevels.find((l) => l.id === selectedLevelId) || null,
    [classLevels, selectedLevelId]
  )

  const levelStreams = useMemo(
    () =>
      selectedLevel
        ? streams
            .filter((s) => s.class_level_id === selectedLevel.id)
            .sort((a, b) => a.display_order - b.display_order)
        : [],
    [streams, selectedLevel]
  )

  // Reset stream when level changes
  useEffect(() => {
    if (levelStreams.length > 0) {
      if (!levelStreams.find((s) => s.id === selectedStreamId)) {
        setSelectedStreamId(levelStreams[0].id)
      }
    } else {
      setSelectedStreamId('')
    }
  }, [levelStreams, selectedStreamId])

  // Identify the shared JSS group
  const jssLevels = useMemo(
    () => classLevels.filter((l) => !l.is_ss).sort((a, b) => a.display_order - b.display_order),
    [classLevels]
  )
  const jssSharedLevel = useMemo(
    () => jssLevels.find((l) => l.name === JSS_SHARED_LEVEL_NAME) || jssLevels[0] || null,
    [jssLevels]
  )

  // Which class_level_id do we use for querying class_subjects?
  // For JSS levels → shared JSS level ID. For SS levels → selected level ID.
  const effectiveLevelId = useMemo(() => {
    if (!selectedLevel) return ''
    if (!selectedLevel.is_ss && jssSharedLevel) return jssSharedLevel.id
    return selectedLevel.id
  }, [selectedLevel, jssSharedLevel])

  // Filter class_subjects for the current view
  const visibleSubjects = useMemo(() => {
    if (!effectiveLevelId) return []
    return classSubjects.filter((cs) => {
      if (cs.class_level_id !== effectiveLevelId) return false
      if (cs.is_active === false) return false
      // For SS: match selected stream (or null for core subjects)
      if (selectedLevel?.is_ss) {
        if (cs.stream_id === null) return true // core, shown in every stream
        if (selectedStreamId && cs.stream_id === selectedStreamId) return true
        return false
      }
      // For JSS: only rows with stream_id = null
      return cs.stream_id === null
    })
  }, [classSubjects, effectiveLevelId, selectedLevel, selectedStreamId])

  const subjectById = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    [subjects]
  )

  // How many students are in this level
  const studentsInLevel = useMemo(() => {
    if (!selectedLevel) return 0
    const levelClassIds = new Set(
      classes
        .filter((c) => {
          const norm = c.name.toLowerCase()
          return norm.startsWith(selectedLevel.name.toLowerCase())
        })
        .map((c) => c.id)
    )
    return students.filter((s) => s.class_id && levelClassIds.has(s.class_id)).length
  }, [classes, students, selectedLevel])

  const isJss = selectedLevel ? !selectedLevel.is_ss : false
  const isSharedJssView = isJss && jssLevels.length > 1

  async function deleteSubject(cs: ClassSubject) {
    const subjName = subjectById[cs.subject_id] || 'subject'
    const levelName = selectedLevel?.name || 'class'
    const streamName = levelStreams.find((s) => s.id === cs.stream_id)?.name

    // Check if any scores exist for this subject in this level
    // We use the class IDs that belong to this level to check scores.
    const levelClassIds = classes
      .filter((c) => c.name.toLowerCase().startsWith(levelName.toLowerCase()))
      .map((c) => c.id)

    let hasScores = false
    if (levelClassIds.length > 0) {
      const { count } = await supabase
        .from('scores')
        .select('id', { count: 'exact', head: true })
        .eq('subject_id', cs.subject_id)
        .in('class_id', levelClassIds)
      hasScores = (count || 0) > 0
    }

    const message = isJss
      ? `Remove "${subjName}" from all JSS levels (JSS 1, 2, 3)?`
      : streamName
      ? `Remove "${subjName}" from ${levelName} · ${streamName}?`
      : `Remove "${subjName}" from ${levelName}?`

    askConfirm('Remove Subject?', message, async () => {
      if (hasScores) {
        // Soft delete to preserve score history
        const { error } = await supabase
          .from('class_subjects')
          .update({ is_active: false })
          .eq('id', cs.id)
        if (error) {
          showToast(`Remove failed: ${error.message}`, 'error')
          return
        }
        showToast(`"${subjName}" archived (existing scores kept).`, 'warn')
      } else {
        const { error } = await supabase
          .from('class_subjects')
          .delete()
          .eq('id', cs.id)
        if (error) {
          showToast(`Delete failed: ${error.message}`, 'error')
          return
        }
        showToast(`"${subjName}" removed.`, 'warn')
      }
      logAction('Subject removed from class', `${levelName}${streamName ? ' · ' + streamName : ''} · ${subjName}`)
      refresh()
    })
  }

  async function toggleCore(cs: ClassSubject) {
    const { error } = await supabase
      .from('class_subjects')
      .update({ is_core: !cs.is_core })
      .eq('id', cs.id)
    if (error) {
      showToast(`Update failed: ${error.message}`, 'error')
      return
    }
    showToast(cs.is_core ? 'Marked as optional.' : 'Marked as core.', 'info')
    refresh()
  }

  // Group visible subjects by stream for SS view
  const groupedSubjects = useMemo(() => {
    if (!selectedLevel?.is_ss) {
      return [{ key: 'all', label: '', items: visibleSubjects }]
    }
    const core: ClassSubject[] = []
    const streamSpecific: ClassSubject[] = []
    visibleSubjects.forEach((cs) => {
      if (cs.stream_id === null) core.push(cs)
      else streamSpecific.push(cs)
    })
    const result: { key: string; label: string; items: ClassSubject[] }[] = []
    if (core.length > 0) {
      result.push({ key: 'core', label: 'Core Subjects (all streams)', items: core })
    }
    if (streamSpecific.length > 0) {
      const streamName = levelStreams.find((s) => s.id === selectedStreamId)?.name || 'Stream'
      result.push({ key: 'stream', label: `${streamName} Subjects`, items: streamSpecific })
    }
    return result
  }, [selectedLevel, visibleSubjects, levelStreams, selectedStreamId])

  if (classLevels.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-12 text-center text-xs text-gray-500 italic">
        No class levels configured. Run the migration to seed JSS 1–3 and SS 1–3.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Level tabs */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-[#0A1E3D]">Classes &amp; Subjects</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage which subjects each class level offers. JSS 1–3 share one subject list. SS streams have their own.
          </p>
        </div>

        <div className="border-b border-slate-100 overflow-x-auto">
          <div className="flex min-w-max">
            {classLevels.map((lvl) => {
              const active = selectedLevelId === lvl.id
              return (
                <button
                  key={lvl.id}
                  onClick={() => setSelectedLevelId(lvl.id)}
                  className={`px-5 py-3.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
                    active
                      ? 'border-amber-500 text-[#0A1E3D]'
                      : 'border-transparent text-gray-500 hover:text-[#0A1E3D]'
                  }`}
                >
                  {lvl.name}
                  {lvl.is_ss && (
                    <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                      SS
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* SS stream sub-tabs */}
        {selectedLevel?.is_ss && levelStreams.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-2">
            {levelStreams.map((s) => {
              const active = selectedStreamId === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStreamId(s.id)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition ${
                    active
                      ? 'bg-[#0A1E3D] text-white'
                      : 'bg-white text-gray-700 ring-1 ring-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Shared JSS indicator */}
        {isSharedJssView && (
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
            <p className="text-[11px] text-blue-800 font-semibold">
              ℹ️ JSS 1, JSS 2, and JSS 3 share one subject list. Adding or removing a subject here affects all three levels.
            </p>
          </div>
        )}

        {/* Header bar */}
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-600">
            <span className="font-bold text-[#0A1E3D]">{visibleSubjects.length}</span>{' '}
            subject{visibleSubjects.length === 1 ? '' : 's'} ·{' '}
            <span className="font-bold text-[#0A1E3D]">{studentsInLevel}</span>{' '}
            student{studentsInLevel === 1 ? '' : 's'} in {selectedLevel?.name}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 text-xs font-bold bg-amber-500 text-white px-4 py-2.5 rounded-xl hover:bg-amber-600"
          >
            <Icon name="plus" /> Add Subject
          </button>
        </div>
      </div>

      {/* Subject list grouped */}
      {groupedSubjects.map((group) => (
        <div
          key={group.key}
          className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden"
        >
          {group.label && (
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                {group.label}
              </p>
            </div>
          )}

          {group.items.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-500 italic">
              No subjects assigned to {selectedLevel?.name}
              {selectedLevel?.is_ss && selectedStreamId
                ? ' · ' +
                  (levelStreams.find((s) => s.id === selectedStreamId)?.name || '')
                : ''}
              . Click "Add Subject" to start.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0A1E3D] text-white text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 text-white">Subject</th>
                    <th className="px-5 py-3 text-center text-white">Type</th>
                    <th className="px-5 py-3 text-center text-white">Scope</th>
                    <th className="px-5 py-3 text-right text-white">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {group.items.map((cs) => {
                    const subjName = subjectById[cs.subject_id] || '—'
                    const scopeLabel = isJss
                      ? 'Shared (JSS 1–3)'
                      : cs.stream_id === null
                      ? 'All SS streams'
                      : levelStreams.find((s) => s.id === cs.stream_id)?.name || '—'
                    return (
                      <tr key={cs.id} className="hover:bg-amber-50/40">
                        <td className="px-5 py-3 font-bold text-[#0A1E3D] bg-white">
                          {subjName}
                        </td>
                        <td className="px-5 py-3 text-center bg-white">
                          <button
                            onClick={() => toggleCore(cs)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 uppercase transition ${
                              cs.is_core
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-gray-700 ring-slate-200 hover:bg-slate-200'
                            }`}
                            title="Click to toggle between Core and Optional"
                          >
                            {cs.is_core ? 'Core' : 'Optional'}
                          </button>
                        </td>
                        <td className="px-5 py-3 text-center text-gray-600 bg-white text-[11px]">
                          {scopeLabel}
                        </td>
                        <td className="px-5 py-3 text-right bg-white">
                          <button
                            onClick={() => deleteSubject(cs)}
                            className="text-red-700 hover:text-red-800 font-bold text-[11px] inline-flex items-center gap-1"
                          >
                            <Icon name="trash" /> Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {showAddModal && selectedLevel && (
        <AddSubjectModal
          level={selectedLevel}
          levelStreams={levelStreams}
          selectedStreamId={selectedStreamId}
          subjects={subjects}
          classSubjects={classSubjects}
          allClassLevels={classLevels}
          jssLevels={jssLevels}
          onClose={() => setShowAddModal(false)}
          onDone={() => {
            setShowAddModal(false)
            refresh()
          }}
          showToast={showToast}
          logAction={logAction}
        />
      )}
    </div>
  )
}

/* ============================================================================
   ADD SUBJECT MODAL
   ============================================================================ */

function AddSubjectModal({
  level,
  levelStreams,
  selectedStreamId,
  subjects,
  classSubjects,
  allClassLevels,
  jssLevels,
  onClose,
  onDone,
  showToast,
  logAction,
}: {
  level: ClassLevel
  levelStreams: Stream[]
  selectedStreamId: string
  subjects: SubjectRow[]
  classSubjects: ClassSubject[]
  allClassLevels: ClassLevel[]
  jssLevels: ClassLevel[]
  onClose: () => void
  onDone: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
}) {
  const isJss = !level.is_ss
  const isSs = level.is_ss

  // For JSS: default target level is the shared JSS level (JSS 1).
  const jssSharedLevel =
    jssLevels.find((l) => l.name === JSS_SHARED_LEVEL_NAME) || jssLevels[0] || null

  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [scope, setScope] = useState<'stream' | 'all_streams'>('stream')
  const [isCore, setIsCore] = useState(false)
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)

  const currentStream = levelStreams.find((s) => s.id === selectedStreamId)

  // Already-assigned subject IDs for this view (to disable them)
  const alreadyAssigned = useMemo(() => {
    const set = new Set<string>()
    if (isJss && jssSharedLevel) {
      classSubjects.forEach((cs) => {
        if (
          cs.class_level_id === jssSharedLevel.id &&
          cs.stream_id === null &&
          cs.is_active !== false
        ) {
          set.add(cs.subject_id)
        }
      })
    } else if (isSs) {
      classSubjects.forEach((cs) => {
        if (cs.class_level_id !== level.id) return
        if (cs.is_active === false) return
        // Already in stream OR already global core → disable
        if (cs.stream_id === null) {
          set.add(cs.subject_id)
        } else if (scope === 'stream' && cs.stream_id === selectedStreamId) {
          set.add(cs.subject_id)
        } else if (scope === 'all_streams') {
          set.add(cs.subject_id)
        }
      })
    }
    return set
  }, [classSubjects, isJss, isSs, jssSharedLevel, level.id, selectedStreamId, scope])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return subjects.filter((s) => {
      if (!needle) return true
      return s.name.toLowerCase().includes(needle)
    })
  }, [subjects, q])

  function toggle(id: string) {
    if (alreadyAssigned.has(id)) return
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function applyCombo(comboName: string) {
    const combo = SUBJECT_COMBOS.find((c) => c.name === comboName)
    if (!combo) return
    const matching = subjects
      .filter((s) => combo.match(s.name) && !alreadyAssigned.has(s.id))
      .map((s) => s.id)
    setSelectedSubjectIds((prev) => Array.from(new Set([...prev, ...matching])))
  }

  async function submit() {
    if (selectedSubjectIds.length === 0) {
      showToast('Pick at least one subject.', 'warn')
      return
    }

    setSaving(true)
    const rows: any[] = []

    if (isJss && jssSharedLevel) {
      // Write to shared JSS level only
      selectedSubjectIds.forEach((sid) => {
        rows.push({
          class_level_id: jssSharedLevel.id,
          stream_id: null,
          subject_id: sid,
          is_core: isCore,
          is_active: true,
        })
      })
    } else if (isSs) {
      const streamIdToUse = scope === 'all_streams' ? null : selectedStreamId || null
      selectedSubjectIds.forEach((sid) => {
        rows.push({
          class_level_id: level.id,
          stream_id: streamIdToUse,
          subject_id: sid,
          is_core: isCore,
          is_active: true,
        })
      })
    }

    // Insert row-by-row so we can skip conflicts without failing the batch
    let inserted = 0
    let skipped = 0
    for (const row of rows) {
      const { error } = await supabase.from('class_subjects').insert([row])
      if (error) {
        if (error.code === '23505') {
          skipped++
        } else {
          showToast(`Insert failed: ${error.message}`, 'error')
          setSaving(false)
          return
        }
      } else {
        inserted++
      }
    }

    setSaving(false)
    showToast(
      `${inserted} subject${inserted === 1 ? '' : 's'} added${
        skipped > 0 ? ` · ${skipped} already existed` : ''
      }.`
    )
    logAction(
      'Subject(s) added',
      `${level.name}${currentStream ? ' · ' + currentStream.name : ''} · ${inserted} subject(s)`
    )
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[#0A1E3D] text-base">Add Subjects</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {level.name}
              {currentStream && isSs ? ' · ' + currentStream.name : ''}
              {isJss ? ' · shared across all JSS levels' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Scope selector for SS */}
          {isSs && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-2">
                Apply to
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setScope('stream')}
                  className={`text-xs font-bold px-4 py-2 rounded-xl ring-1 ${
                    scope === 'stream'
                      ? 'bg-[#0A1E3D] text-white ring-[#0A1E3D]'
                      : 'bg-white text-gray-700 ring-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {currentStream?.name || 'This stream'} only
                </button>
                <button
                  onClick={() => setScope('all_streams')}
                  className={`text-xs font-bold px-4 py-2 rounded-xl ring-1 ${
                    scope === 'all_streams'
                      ? 'bg-[#0A1E3D] text-white ring-[#0A1E3D]'
                      : 'bg-white text-gray-700 ring-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All SS streams (core)
                </button>
              </div>
            </div>
          )}

          {/* Core toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isCore}
              onChange={(e) => setIsCore(e.target.checked)}
              className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-[#1A2332]">
              Mark as Core subject
            </span>
          </label>

          {/* Combos */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-2">
              Quick Combos
            </p>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COMBOS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => applyCombo(c.name)}
                  className="text-[11px] font-bold px-3 py-2 rounded-lg bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                  title={c.description}
                >
                  + {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Icon name="search" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search subjects…"
              className="w-full text-sm pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-[#1A2332]"
            />
          </div>

          {/* Grid */}
          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white">
            {filtered.map((s) => {
              const checked = selectedSubjectIds.includes(s.id)
              const disabled = alreadyAssigned.has(s.id)
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ring-1 transition ${
                    disabled
                      ? 'bg-slate-50 ring-slate-200 opacity-60 cursor-not-allowed'
                      : checked
                      ? 'bg-emerald-50 ring-emerald-200'
                      : 'bg-white ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(s.id)}
                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm text-[#1A2332] flex-1">
                    {s.name}
                  </span>
                  {disabled && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-gray-500">
                      ALREADY
                    </span>
                  )}
                </label>
              )
            })}
            {filtered.length === 0 && (
              <div className="col-span-2 text-center py-8 text-xs text-gray-500 italic">
                No subjects match your search.
              </div>
            )}
          </div>

          <p className="text-[11px] text-gray-600">
            <span className="font-bold text-[#0A1E3D]">
              {selectedSubjectIds.length}
            </span>{' '}
            subject{selectedSubjectIds.length === 1 ? '' : 's'} selected
          </p>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving || selectedSubjectIds.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? 'Adding…' : `Add ${selectedSubjectIds.length || ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
/* ============================================================================
   TAB: QUESTION BANK
   ============================================================================ */

function QuestionsTab({
  exams,
  questions,
  subjects,
  refresh,
  showToast,
  askConfirm,
}: {
  exams: CbtExam[]
  questions: Question[]
  subjects: SubjectRow[]
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const examById = useMemo(
    () => Object.fromEntries(exams.map((e) => [e.id, e])),
    [exams]
  )

  function removeQuestion(q: Question) {
    askConfirm('Delete Question?', 'Remove this question?', async () => {
      const { error } = await supabase
        .from('cbt_questions')
        .delete()
        .eq('id', q.id)
      if (error) {
        showToast(`Delete failed: ${error.message}`, 'error')
        return
      }
      showToast('Question removed.', 'warn')
      refresh()
    })
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100">
        <h2 className="font-semibold text-[#0A1E3D]">Question Bank</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {questions.length} question(s) across {exams.length} exam(s)
        </p>
      </div>
      <div className="p-5 space-y-3 max-h-[700px] overflow-y-auto">
        {questions.length === 0 && (
          <div className="text-center py-12 text-xs text-gray-500 italic">
            No questions yet. Add them from the Exams tab.
          </div>
        )}
        {questions.slice(0, 200).map((q) => {
          const ex = examById[q.exam_id]
          return (
            <div
              key={q.id}
              className="p-4 rounded-xl ring-1 ring-slate-200 bg-white"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {ex && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 uppercase">
                      {ex.title}
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      q.type === 'theory'
                        ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
                        : 'bg-slate-100 text-gray-700 ring-1 ring-slate-200'
                    }`}
                  >
                    {q.type}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {q.marks} mark{q.marks === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  onClick={() => removeQuestion(q)}
                  className="text-red-700 hover:text-red-800 text-[11px] font-bold"
                >
                  Delete
                </button>
              </div>
              <p className="text-xs text-[#1A2332] font-medium mb-2">
                {q.question_text}
              </p>
              {q.type === 'objective' && (
                <ul className="grid grid-cols-2 gap-1.5 text-[11px]">
                  {(['A', 'B', 'C', 'D'] as const).map((k) => {
                    const txt = (q as any)[`option_${k.toLowerCase()}`]
                    if (!txt) return null
                    const isCorrect = q.correct_answer === k
                    return (
                      <li
                        key={k}
                        className={`px-2.5 py-1.5 rounded-lg ${
                          isCorrect
                            ? 'bg-emerald-50 ring-1 ring-emerald-200 text-emerald-800 font-semibold'
                            : 'bg-slate-50 ring-1 ring-slate-200 text-gray-700'
                        }`}
                      >
                        {k}. {txt} {isCorrect ? '✓' : ''}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================================
   TAB: EXAMS
   ============================================================================ */

function ExamsTab({
  exams,
  classes,
  subjects,
  questions,
  defaultSession,
  defaultTerm,
  refresh,
  showToast,
  logAction,
  askConfirm,
}: {
  exams: CbtExam[]
  classes: ClassRow[]
  subjects: SubjectRow[]
  questions: Question[]
  defaultSession: string
  defaultTerm: Term
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null)
  const selectedExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) || null,
    [exams, selectedExamId]
  )

  if (selectedExam) {
    return (
      <ExamDetail
        exam={selectedExam}
        classes={classes}
        subjects={subjects}
        questions={questions.filter((q) => q.exam_id === selectedExam.id)}
        onBack={() => setSelectedExamId(null)}
        refresh={refresh}
        showToast={showToast}
        logAction={logAction}
        askConfirm={askConfirm}
      />
    )
  }

  return (
    <ExamList
      exams={exams}
      classes={classes}
      subjects={subjects}
      questions={questions}
      defaultSession={defaultSession}
      defaultTerm={defaultTerm}
      onOpen={setSelectedExamId}
      refresh={refresh}
      showToast={showToast}
      logAction={logAction}
      askConfirm={askConfirm}
    />
  )
}

function ExamList({
  exams,
  classes,
  subjects,
  questions,
  defaultSession,
  defaultTerm,
  onOpen,
  refresh,
  showToast,
  logAction,
  askConfirm,
}: {
  exams: CbtExam[]
  classes: ClassRow[]
  subjects: SubjectRow[]
  questions: Question[]
  defaultSession: string
  defaultTerm: Term
  onOpen: (id: string) => void
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    title: '',
    class_id: '',
    subject_id: '',
    duration_minutes: 30,
    session: defaultSession,
    term: defaultTerm as Term,
    status: 'draft' as 'draft' | 'published',
  })
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Update form defaults when props change
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      session: defaultSession,
      term: defaultTerm,
    }))
  }, [defaultSession, defaultTerm])

  const classById = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.id, c.name])),
    [classes]
  )
  const subjectById = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    [subjects]
  )
  const questionCount = useMemo(() => {
    const m = new Map<string, number>()
    questions.forEach((q) => m.set(q.exam_id, (m.get(q.exam_id) || 0) + 1))
    return m
  }, [questions])
  const marksByExam = useMemo(() => {
    const m = new Map<string, number>()
    questions.forEach((q) =>
      m.set(q.exam_id, (m.get(q.exam_id) || 0) + q.marks)
    )
    return m
  }, [questions])

  async function createExam(e: React.FormEvent) {
    e.preventDefault()
    if (!form.class_id || !form.subject_id) {
      showToast('Pick class and subject.', 'error')
      return
    }
    setSaving(true)

    if (form.status === 'published') {
      const { data: existing } = await supabase
        .from('cbt_exams')
        .select('id')
        .eq('class_id', form.class_id)
        .eq('subject_id', form.subject_id)
        .eq('term', form.term)
        .eq('session', form.session)
        .eq('status', 'published')
        .maybeSingle()
      if (existing) {
        showToast(
          `${classById[form.class_id]} · ${subjectById[form.subject_id]} already has a published exam for ${form.term}.`,
          'error'
        )
        setSaving(false)
        return
      }
    }

    const { data, error } = await supabase
      .from('cbt_exams')
      .insert([
        {
          ...form,
          published_at:
            form.status === 'published' ? new Date().toISOString() : null,
        },
      ])
      .select()
      .single()

    setSaving(false)
    if (error) {
      showToast(`Save failed: ${error.message}`, 'error')
      return
    }

    showToast(`Exam "${form.title}" created.`)
    logAction('Exam created', `${form.title} · ${form.status}`)
    setForm({
      title: '',
      class_id: '',
      subject_id: '',
      duration_minutes: 30,
      session: defaultSession,
      term: defaultTerm,
      status: 'draft',
    })
    setShowCreate(false)
    refresh()
    if (data?.id) onOpen(data.id)
  }

  function removeExam(ex: CbtExam) {
    askConfirm(
      'Delete Exam?',
      `Remove "${ex.title}" and all its questions?`,
      async () => {
        const { error } = await supabase
          .from('cbt_exams')
          .delete()
          .eq('id', ex.id)
        if (error) {
          showToast(`Delete failed: ${error.message}`, 'error')
          return
        }
        showToast('Exam removed.', 'warn')
        logAction('Exam deleted', ex.title)
        refresh()
      }
    )
  }

  const filtered = useMemo(() => {
    return exams.filter((ex) => {
      if (q && !ex.title.toLowerCase().includes(q.toLowerCase())) return false
      if (filterClass && ex.class_id !== filterClass) return false
      if (filterStatus && examDerivedStatus(ex) !== filterStatus) return false
      return true
    })
  }, [exams, q, filterClass, filterStatus])

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[#0A1E3D]">CBT Exams</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {exams.length} exam(s) ·{' '}
              {exams.filter((e) => examDerivedStatus(e) === 'live').length} live now
            </p>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="text-xs font-bold bg-amber-500 text-white px-4 py-2.5 rounded-xl hover:bg-amber-600"
          >
            {showCreate ? 'Close' : '+ New Exam'}
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={createExam}
            className="p-5 bg-slate-50 border-b border-slate-100 space-y-4"
          >
            <FormField label="Title" required>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Mid-Term Chemistry Test"
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Class" required>
                <select
                  required
                  value={form.class_id}
                  onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                >
                  <option value="">-- Choose --</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Subject" required>
                <select
                  required
                  value={form.subject_id}
                  onChange={(e) =>
                    setForm({ ...form, subject_id: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                >
                  <option value="">-- Choose --</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="Duration (min)">
                <input
                  type="number"
                  min={1}
                  value={form.duration_minutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      duration_minutes: Number(e.target.value),
                    })
                  }
                  className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                />
              </FormField>
              <FormField label="Term">
                <select
                  value={form.term}
                  onChange={(e) =>
                    setForm({ ...form, term: e.target.value as Term })
                  }
                  className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                >
                  {TERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Session">
                <input
                  value={form.session}
                  onChange={(e) =>
                    setForm({ ...form, session: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                />
              </FormField>
            </div>

            <FormField label="Initial Status">
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as any })
                }
                className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              >
                <option value="draft">Save as Draft</option>
                <option value="published">Publish Immediately</option>
              </select>
            </FormField>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create Exam'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Icon name="search" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title…"
              className="w-full text-sm pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-[#1A2332]"
            />
          </div>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-[#1A2332]"
          >
            <option value="">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-[#1A2332]"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="overflow-x-auto max-h-[640px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A1E3D] text-white text-[11px] uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-4 py-3 text-white">Title</th>
                <th className="px-4 py-3 text-white">Class</th>
                <th className="px-4 py-3 text-white">Subject</th>
                <th className="px-4 py-3 text-center text-white">Qs</th>
                <th className="px-4 py-3 text-center text-white">Marks</th>
                <th className="px-4 py-3 text-center text-white">Duration</th>
                <th className="px-4 py-3 text-center text-white">Status</th>
                <th className="px-4 py-3 text-right text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-xs text-gray-500 italic bg-white"
                  >
                    No exams match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((ex) => {
                const status = examDerivedStatus(ex)
                const tone =
                  status === 'live'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : status === 'scheduled'
                    ? 'bg-blue-50 text-blue-700 ring-blue-200'
                    : status === 'closed'
                    ? 'bg-slate-100 text-gray-700 ring-slate-200'
                    : 'bg-amber-50 text-amber-700 ring-amber-200'
                return (
                  <tr key={ex.id} className="hover:bg-amber-50/40">
                    <td className="px-4 py-3 font-bold text-[#0A1E3D] bg-white">
                      <button
                        onClick={() => onOpen(ex.id)}
                        className="text-left hover:text-amber-700 hover:underline"
                      >
                        {ex.title}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[#1A2332] bg-white">
                      {classById[ex.class_id] || '—'}
                    </td>
                    <td className="px-4 py-3 text-[#1A2332] bg-white">
                      {subjectById[ex.subject_id] || '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[#1A2332] bg-white">
                      {questionCount.get(ex.id) || 0}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[#1A2332] bg-white">
                      {marksByExam.get(ex.id) || 0}
                    </td>
                    <td className="px-4 py-3 text-center text-[#1A2332] bg-white">
                      {ex.duration_minutes} min
                    </td>
                    <td className="px-4 py-3 text-center bg-white">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 uppercase ${tone}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap bg-white">
                      <button
                        onClick={() => onOpen(ex.id)}
                        className="text-blue-700 hover:text-blue-800 font-bold text-[11px] mr-3"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => removeExam(ex)}
                        className="text-red-700 hover:text-red-800 font-bold text-[11px]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   EXAM DETAIL
   ============================================================================ */

function ExamDetail({
  exam,
  classes,
  subjects,
  questions,
  onBack,
  refresh,
  showToast,
  logAction,
  askConfirm,
}: {
  exam: CbtExam
  classes: ClassRow[]
  subjects: SubjectRow[]
  questions: Question[]
  onBack: () => void
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const [tab, setTab] = useState<'setup' | 'questions' | 'preview'>('setup')
  const cls = useMemo(
    () => classes.find((c) => c.id === exam.class_id),
    [classes, exam.class_id]
  )
  const subj = useMemo(
    () => subjects.find((s) => s.id === exam.subject_id),
    [subjects, exam.subject_id]
  )

  const totalMarks = useMemo(
    () => questions.reduce((a, q) => a + q.marks, 0),
    [questions]
  )
  const objectiveCount = questions.filter((q) => q.type === 'objective').length
  const theoryCount = questions.filter((q) => q.type === 'theory').length
  const derivedStatus = examDerivedStatus(exam)

  async function updateExam(patch: Partial<CbtExam>) {
    const { error } = await supabase
      .from('cbt_exams')
      .update(patch)
      .eq('id', exam.id)
    if (error) {
      showToast(`Update failed: ${error.message}`, 'error')
      return false
    }
    return true
  }

  async function togglePublish() {
    if (exam.status === 'draft') {
      const { data: existing } = await supabase
        .from('cbt_exams')
        .select('id, title')
        .eq('class_id', exam.class_id)
        .eq('subject_id', exam.subject_id)
        .eq('term', exam.term)
        .eq('session', exam.session)
        .eq('status', 'published')
        .neq('id', exam.id)
        .maybeSingle()

      if (existing) {
        showToast(
          `Another published exam already exists for ${cls?.name} · ${subj?.name} · ${exam.term}.`,
          'error'
        )
        return
      }
      if (questions.length === 0) {
        showToast('Add at least one question before publishing.', 'error')
        return
      }

      askConfirm(
        'Publish Exam?',
        `Students in ${cls?.name} will see this exam (subject to availability window). Continue?`,
        async () => {
          const ok = await updateExam({
            status: 'published',
            published_at: new Date().toISOString(),
          })
          if (ok) {
            showToast('Exam published.')
            logAction('Exam published', exam.title)
            refresh()
          }
        }
      )
    } else {
      askConfirm(
        'Unpublish Exam?',
        'Students will no longer see this exam. In-progress attempts remain.',
        async () => {
          const ok = await updateExam({ status: 'draft' })
          if (ok) {
            showToast('Exam unpublished.', 'warn')
            logAction('Exam unpublished', exam.title)
            refresh()
          }
        }
      )
    }
  }

  function deleteExam() {
    askConfirm(
      'Delete Exam?',
      `Permanently delete "${exam.title}" and all its questions?`,
      async () => {
        const { error } = await supabase
          .from('cbt_exams')
          .delete()
          .eq('id', exam.id)
        if (error) {
          showToast(`Delete failed: ${error.message}`, 'error')
          return
        }
        showToast('Exam deleted.', 'warn')
        logAction('Exam deleted', exam.title)
        onBack()
        refresh()
      }
    )
  }

  function deleteQuestion(q: Question) {
    askConfirm('Delete Question?', 'Remove this question?', async () => {
      const { error } = await supabase
        .from('cbt_questions')
        .delete()
        .eq('id', q.id)
      if (error) {
        showToast(`Delete failed: ${error.message}`, 'error')
        return
      }
      showToast('Question removed.', 'warn')
      refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
        <button
          onClick={onBack}
          className="text-xs font-bold text-gray-600 hover:text-[#0A1E3D] mb-3 inline-flex items-center gap-1"
        >
          ← Back to Exams
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-[#0A1E3D] truncate">
              {exam.title}
            </h1>
            <p className="text-xs text-gray-600 mt-1">
              {cls?.name || '—'} · {subj?.name || '—'} · {exam.term} ·{' '}
              {exam.session}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ring-1 uppercase ${
                  derivedStatus === 'live'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : derivedStatus === 'scheduled'
                    ? 'bg-blue-50 text-blue-700 ring-blue-200'
                    : derivedStatus === 'closed'
                    ? 'bg-slate-100 text-gray-700 ring-slate-200'
                    : 'bg-amber-50 text-amber-700 ring-amber-200'
                }`}
              >
                {derivedStatus}
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-gray-700 ring-1 ring-slate-200">
                {questions.length} questions
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-gray-700 ring-1 ring-slate-200">
                {totalMarks} marks
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-gray-700 ring-1 ring-slate-200">
                {exam.duration_minutes} min
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={togglePublish}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white ${
                exam.status === 'published'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {exam.status === 'published' ? 'Unpublish' : '🚀 Publish'}
            </button>
            <button
              onClick={deleteExam}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 flex">
          {(['setup', 'questions', 'preview'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3.5 text-xs font-bold border-b-2 transition ${
                tab === t
                  ? 'border-amber-500 text-[#0A1E3D]'
                  : 'border-transparent text-gray-500 hover:text-[#0A1E3D]'
              }`}
            >
              {t === 'setup' && 'Setup'}
              {t === 'questions' && `Questions (${questions.length})`}
              {t === 'preview' && 'Preview'}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'setup' && (
            <SetupSection
              exam={exam}
              totalMarks={totalMarks}
              objectiveCount={objectiveCount}
              theoryCount={theoryCount}
              onSave={updateExam}
              showToast={showToast}
            />
          )}
          {tab === 'questions' && (
            <QuestionsSection
              examId={exam.id}
              exam={exam}
              questions={questions}
              onReload={refresh}
              showToast={showToast}
              onDelete={deleteQuestion}
            />
          )}
          {tab === 'preview' && (
            <PreviewSection exam={exam} questions={questions} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   EXAM DETAIL — SETUP SECTION
   ============================================================================ */

function SetupSection({
  exam,
  totalMarks,
  objectiveCount,
  theoryCount,
  onSave,
  showToast,
}: {
  exam: CbtExam
  totalMarks: number
  objectiveCount: number
  theoryCount: number
  onSave: (patch: Partial<CbtExam>) => Promise<boolean>
  showToast: (m: string, t?: Toast['tone']) => void
}) {
  const [draft, setDraft] = useState({
    title: exam.title,
    duration_minutes: exam.duration_minutes,
    instructions: exam.instructions || '',
    start_at: toLocalDatetimeInput(exam.start_at),
    end_at: toLocalDatetimeInput(exam.end_at),
    shuffle_questions: exam.shuffle_questions,
    shuffle_options: exam.shuffle_options,
    max_attempts: exam.max_attempts,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!draft.title.trim()) {
      showToast('Title is required.', 'error')
      return
    }
    if (draft.duration_minutes <= 0) {
      showToast('Duration must be positive.', 'error')
      return
    }
    const startIso = fromLocalDatetimeInput(draft.start_at)
    const endIso = fromLocalDatetimeInput(draft.end_at)
    if (startIso && endIso && new Date(startIso) >= new Date(endIso)) {
      showToast('End time must be after start time.', 'error')
      return
    }
    setSaving(true)
    const ok = await onSave({
      title: draft.title.trim(),
      duration_minutes: draft.duration_minutes,
      instructions: draft.instructions.trim() || null,
      start_at: startIso,
      end_at: endIso,
      shuffle_questions: draft.shuffle_questions,
      shuffle_options: draft.shuffle_options,
      max_attempts: draft.max_attempts,
    })
    setSaving(false)
    if (ok) showToast('Setup saved.')
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h3 className="font-semibold text-[#0A1E3D] mb-3">Exam Setup</h3>
        <div className="space-y-4">
          <FormField label="Title" required>
            <input
              required
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Duration (minutes)" required>
              <input
                type="number"
                min={1}
                value={draft.duration_minutes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    duration_minutes: Number(e.target.value),
                  })
                }
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
            </FormField>
            <FormField label="Max Attempts">
              <input
                type="number"
                min={1}
                value={draft.max_attempts}
                onChange={(e) =>
                  setDraft({ ...draft, max_attempts: Number(e.target.value) })
                }
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
            </FormField>
          </div>

          <FormField label="Instructions for Students">
            <textarea
              rows={3}
              value={draft.instructions}
              onChange={(e) =>
                setDraft({ ...draft, instructions: e.target.value })
              }
              placeholder="e.g. No calculators. Read each question carefully."
              className="w-full text-sm p-3 bg-white border border-amber-200 rounded-xl outline-none resize-none text-[#1A2332]"
            />
          </FormField>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-[#0A1E3D] mb-3">
          Availability Window
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Leave blank = available immediately when published.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start (optional)">
            <input
              type="datetime-local"
              value={draft.start_at}
              onChange={(e) => setDraft({ ...draft, start_at: e.target.value })}
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>
          <FormField label="End (optional)">
            <input
              type="datetime-local"
              value={draft.end_at}
              onChange={(e) => setDraft({ ...draft, end_at: e.target.value })}
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-[#0A1E3D] mb-3">Randomization</h3>
        <div className="space-y-2">
          <Toggle
            checked={draft.shuffle_questions}
            onChange={(v) => setDraft({ ...draft, shuffle_questions: v })}
            label="Shuffle question order per student"
          />
          <Toggle
            checked={draft.shuffle_options}
            onChange={(v) => setDraft({ ...draft, shuffle_options: v })}
            label="Shuffle A/B/C/D option order per student"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center bg-slate-50 rounded-xl p-4 border border-slate-200">
        <div>
          <p className="text-[10px] font-bold uppercase text-gray-500">
            Objective
          </p>
          <p className="text-xl font-black text-[#0A1E3D] mt-0.5">
            {objectiveCount}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-gray-500">Theory</p>
          <p className="text-xl font-black text-[#0A1E3D] mt-0.5">
            {theoryCount}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-gray-500">
            Total Marks
          </p>
          <p className="text-xl font-black text-amber-600 mt-0.5">
            {totalMarks}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="bg-[#0A1E3D] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-[#051228] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Setup'}
        </button>
      </div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
      />
      <span className="text-sm font-medium text-[#1A2332]">{label}</span>
    </label>
  )
}

/* ============================================================================
   EXAM DETAIL — QUESTIONS SECTION (bulk upload + list)
   ============================================================================ */

function QuestionsSection({
  examId,
  exam,
  questions,
  onReload,
  showToast,
  onDelete,
}: {
  examId: string
  exam: CbtExam
  questions: Question[]
  onReload: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  onDelete: (q: Question) => void
}) {
  const [preview, setPreview] = useState<{
    rows: any[]
    errors: string[]
  } | null>(null)
  const [importing, setImporting] = useState(false)

  function downloadSample() {
    const rows: any[][] = [
      [
        'type',
        'question',
        'option_a',
        'option_b',
        'option_c',
        'option_d',
        'correct_answer',
        'marks',
        'theory_answer_guide',
      ],
      ['objective', 'What is 2 + 2?', '3', '4', '5', '6', 'B', 1, ''],
      ['objective', 'Capital of Nigeria?', 'Lagos', 'Abuja', 'Kano', 'Ibadan', 'B', 1, ''],
      [
        'theory',
        'Explain the process of photosynthesis.',
        '',
        '',
        '',
        '',
        '',
        5,
        'Chlorophyll absorbs light energy...',
      ],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [
      { wch: 12 },
      { wch: 44 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 8 },
      { wch: 44 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Questions')
    XLSX.writeFile(wb, 'IRIS_CBT_Questions_Sample.xlsx')
    showToast('Sample downloaded.', 'info')
  }

  function processRows(rows: any[][]) {
    const parsed: any[] = []
    const errors: string[] = []
    if (rows.length < 2) return { rows: parsed, errors: ['File is empty'] }

    const header = (rows[0] as string[]).map(normalizeHeader)
    const idx = (name: string) => header.indexOf(name)
    const iType = idx('type')
    const iQ = idx('question')
    const iA = idx('option_a'),
      iB = idx('option_b'),
      iC = idx('option_c'),
      iD = idx('option_d')
    const iCorrect = idx('correct_answer')
    const iMarks = idx('marks')
    const iGuide = idx('theory_answer_guide')

    if (iQ === -1) {
      errors.push('Missing "question" column')
      return { rows: parsed, errors }
    }

    rows.slice(1).forEach((r, i) => {
      const rowNum = i + 2
      const typeRaw = String(iType !== -1 ? r[iType] : 'objective')
        .trim()
        .toLowerCase()
      const type = typeRaw === 'theory' ? 'theory' : 'objective'
      const question = String(r[iQ] ?? '').trim()
      const a = iA !== -1 ? String(r[iA] ?? '').trim() : ''
      const b = iB !== -1 ? String(r[iB] ?? '').trim() : ''
      const c = iC !== -1 ? String(r[iC] ?? '').trim() : ''
      const d = iD !== -1 ? String(r[iD] ?? '').trim() : ''
      const correct =
        iCorrect !== -1 ? String(r[iCorrect] ?? '').trim().toUpperCase() : ''
      const marksRaw = iMarks !== -1 ? r[iMarks] : 1
      const guide = iGuide !== -1 ? String(r[iGuide] ?? '').trim() : ''

      if (!question) return
      const errs: string[] = []
      if (type === 'objective') {
        if (![a, b, c, d].every((x) => x)) errs.push('needs 4 options')
        if (!/^[A-D]$/.test(correct)) errs.push('correct must be A/B/C/D')
      }
      const marksNum = Number(marksRaw)
      if (isNaN(marksNum) || marksNum <= 0) errs.push('marks must be > 0')
      if (errs.length) errors.push(`Row ${rowNum}: ${errs.join(' · ')}`)

      parsed.push({
        rowNum,
        type,
        question_text: question,
        option_a: a,
        option_b: b,
        option_c: c,
        option_d: d,
        correct_answer: type === 'objective' ? correct : null,
        marks: isNaN(marksNum) ? 1 : marksNum,
        theory_answer_guide: type === 'theory' ? guide || null : null,
        errors: errs,
      })
    })

    return { rows: parsed, errors }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<any>(sheet, {
          header: 1,
          defval: '',
        })
        setPreview(processRows(raw))
      } catch {
        showToast('Could not read the file.', 'error')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function confirmImport() {
    if (!preview) return
    const valid = preview.rows.filter((r) => r.errors.length === 0)
    if (valid.length === 0) return
    setImporting(true)
    const payload = valid.map((r) => ({
      exam_id: examId,
      type: r.type,
      question_text: r.question_text,
      option_a: r.option_a || null,
      option_b: r.option_b || null,
      option_c: r.option_c || null,
      option_d: r.option_d || null,
      correct_answer: r.correct_answer,
      marks: r.marks,
      theory_answer_guide: r.theory_answer_guide,
    }))
    const { error } = await supabase.from('cbt_questions').insert(payload)
    setImporting(false)
    if (error) {
      showToast(`Insert failed: ${error.message}`, 'error')
      return
    }
    const hasTheory = valid.some((r) => r.type === 'theory')
    if (hasTheory && !exam.has_theory) {
      await supabase
        .from('cbt_exams')
        .update({ has_theory: true })
        .eq('id', examId)
    }
    showToast(`${valid.length} question(s) imported.`)
    setPreview(null)
    onReload()
  }

  const validCount = preview?.rows.filter((r) => r.errors.length === 0).length ?? 0
  const errorCount = preview?.errors.length ?? 0

  return (
    <div className="space-y-5">
      <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#0A1E3D]">
              Bulk Question Upload
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Columns:{' '}
              <span className="font-mono">
                type, question, option_a..d, correct_answer, marks,
                theory_answer_guide
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadSample}
              className="text-xs font-semibold bg-[#0A1E3D] text-white px-3.5 py-2 rounded-lg hover:bg-black"
            >
              📥 Sample Excel
            </button>
            <label className="text-xs font-semibold bg-amber-500 text-white px-3.5 py-2 rounded-lg hover:bg-amber-600 cursor-pointer">
              📤 Upload Excel
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {preview && (
          <div className="p-5 space-y-3">
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 font-semibold">
                {validCount} ready
              </span>
              {errorCount > 0 && (
                <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 font-semibold">
                  {errorCount} error(s)
                </span>
              )}
            </div>
            {errorCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
                {preview.errors.slice(0, 8).map((e, i) => (
                  <div key={i}>• {e}</div>
                ))}
              </div>
            )}
            {validCount > 0 && (
              <div className="overflow-x-auto max-h-60 rounded-xl ring-1 ring-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-gray-700 text-[10px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Question</th>
                      <th className="px-3 py-2 text-center">Marks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.slice(0, 60).map((r, i) => (
                      <tr
                        key={i}
                        className={r.errors.length ? 'bg-red-50/40' : 'bg-white'}
                      >
                        <td className="px-3 py-2 font-mono text-gray-600">
                          {r.rowNum}
                        </td>
                        <td className="px-3 py-2 uppercase text-[10px] font-bold text-[#1A2332]">
                          {r.type}
                        </td>
                        <td className="px-3 py-2 max-w-md truncate text-[#1A2332]">
                          {r.question_text}
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-[#1A2332]">
                          {r.marks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreview(null)}
                className="text-xs font-semibold px-4 py-2 rounded-lg text-gray-700 hover:bg-red-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={validCount === 0 || importing}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {importing ? 'Importing…' : `Confirm Import (${validCount})`}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
          <p className="text-xs font-bold text-[#0A1E3D]">
            Existing Questions ({questions.length})
          </p>
          <p className="text-[11px] text-gray-600">
            {questions.filter((q) => q.type === 'objective').length} objective ·{' '}
            {questions.filter((q) => q.type === 'theory').length} theory ·{' '}
            {questions.reduce((a, b) => a + b.marks, 0)} marks
          </p>
        </div>
        {questions.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-500 italic">
            No questions yet. Upload above.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[560px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0A1E3D] text-white text-[11px] uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-white">#</th>
                  <th className="px-4 py-3 text-white">Type</th>
                  <th className="px-4 py-3 text-white">Question</th>
                  <th className="px-4 py-3 text-center text-white">Correct</th>
                  <th className="px-4 py-3 text-center text-white">Marks</th>
                  <th className="px-4 py-3 text-right text-white">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {questions.map((q, i) => (
                  <tr key={q.id} className="hover:bg-amber-50/40">
                    <td className="px-4 py-3 font-mono text-gray-600 bg-white">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 bg-white">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          q.type === 'theory'
                            ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                        }`}
                      >
                        {q.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-md text-[#1A2332] bg-white">
                      {q.question_text}
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-[#1A2332] bg-white">
                      {q.type === 'objective' ? q.correct_answer : '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[#1A2332] bg-white">
                      {q.marks}
                    </td>
                    <td className="px-4 py-3 text-right bg-white">
                      <button
                        onClick={() => onDelete(q)}
                        className="text-red-700 hover:text-red-800 font-bold text-[11px]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
   EXAM DETAIL — PREVIEW SECTION
   ============================================================================ */

function PreviewSection({
  exam,
  questions,
}: {
  exam: CbtExam
  questions: Question[]
}) {
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[#0A1E3D] text-white rounded-2xl p-6">
        <h1 className="text-xl font-black">{exam.title}</h1>
        <div className="flex flex-wrap gap-4 mt-3 text-xs">
          <span>⏱ {exam.duration_minutes} minutes</span>
          <span>📝 {questions.length} questions</span>
          <span>💯 {questions.reduce((a, b) => a + b.marks, 0)} marks</span>
        </div>
        {exam.instructions && (
          <p className="text-xs mt-3 italic opacity-90">{exam.instructions}</p>
        )}
      </div>

      {questions.map((q, i) => (
        <div
          key={q.id}
          className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5"
        >
          <div className="flex items-start gap-3 mb-3">
            <span className="shrink-0 w-7 h-7 rounded-lg bg-[#0A1E3D] text-white text-xs font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <p className="font-medium text-sm text-[#1A2332] flex-1">
              {q.question_text}
            </p>
            <span className="text-[10px] font-bold text-gray-600 shrink-0">
              {q.marks} mark{q.marks === 1 ? '' : 's'}
            </span>
          </div>
          {q.type === 'objective' ? (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-10">
              {(['A', 'B', 'C', 'D'] as const).map((k) => {
                const txt = (q as any)[`option_${k.toLowerCase()}`]
                const isCorrect = q.correct_answer === k
                return (
                  <li
                    key={k}
                    className={`px-3 py-2 rounded-lg text-xs ${
                      isCorrect
                        ? 'bg-emerald-50 ring-1 ring-emerald-200 text-emerald-800 font-semibold'
                        : 'bg-slate-50 ring-1 ring-slate-200 text-gray-700'
                    }`}
                  >
                    <span className="font-bold mr-2">{k}.</span>
                    {txt} {isCorrect && '✓'}
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="ml-10">
              <textarea
                disabled
                placeholder="Students type their answer here."
                rows={3}
                className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-lg resize-none text-[#1A2332]"
              />
              {q.theory_answer_guide && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                    Show answer guide (admin only)
                  </summary>
                  <p className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 italic">
                    {q.theory_answer_guide}
                  </p>
                </details>
              )}
            </div>
          )}
        </div>
      ))}

      {questions.length === 0 && (
        <div className="text-center py-12 text-xs text-gray-500 italic border-2 border-dashed border-slate-200 rounded-2xl">
          No questions to preview yet.
        </div>
      )}
    </div>
  )
}
/* ============================================================================
   TAB: SUBMISSIONS
   ============================================================================ */

function SubmissionsTab({
  exams,
  students,
  showToast,
}: {
  exams: CbtExam[]
  students: Student[]
  showToast: (m: string, t?: Toast['tone']) => void
}) {
  const [examId, setExamId] = useState('')
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(false)

  const studentById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  )

  useEffect(() => {
    if (!examId) {
      setAttempts([])
      return
    }
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('cbt_attempts')
        .select('*')
        .eq('exam_id', examId)
        .order('submitted_at', { ascending: false })
      if (error) showToast(`Failed: ${error.message}`, 'error')
      setAttempts((data || []) as Attempt[])
      setLoading(false)
    })()
  }, [examId, showToast])

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100">
        <h2 className="font-semibold text-[#0A1E3D]">Submissions</h2>
        <p className="text-xs text-gray-500 mt-0.5">Student attempts per exam.</p>
      </div>

      <div className="p-5 border-b border-slate-100">
        <label className="block text-xs font-bold text-[#0A1E3D] mb-1">Exam</label>
        <select
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
          className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
        >
          <option value="">-- Choose Exam --</option>
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.title}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0A1E3D] text-white text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3 w-12 text-white"></th>
              <th className="px-5 py-3 text-white">Student</th>
              <th className="px-5 py-3 text-center text-white">Status</th>
              <th className="px-5 py-3 text-center text-white">Score</th>
              <th className="px-5 py-3 text-center text-white">Time Spent</th>
              <th className="px-5 py-3 text-center text-white">Switches</th>
              <th className="px-5 py-3 text-center text-white">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-12 text-center text-xs text-gray-500 italic bg-white"
                >
                  Loading…
                </td>
              </tr>
            )}
            {!loading && !examId && (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-12 text-center text-xs text-gray-500 italic bg-white"
                >
                  Pick an exam above.
                </td>
              </tr>
            )}
            {!loading && examId && attempts.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-12 text-center text-xs text-gray-500 italic bg-white"
                >
                  No submissions yet.
                </td>
              </tr>
            )}
            {!loading &&
              attempts.map((a) => {
                const s = studentById[a.student_id]
                const pct = a.total_marks
                  ? Math.round(((a.score || 0) / a.total_marks) * 100)
                  : 0
                return (
                  <tr key={a.id} className="hover:bg-amber-50/40">
                    <td className="px-3 py-2 bg-white">
                      {s?.passport_url ? (
                        <img
                          src={s.passport_url}
                          alt={s.full_name}
                          className="w-8 h-10 object-cover rounded ring-1 ring-slate-200"
                        />
                      ) : (
                        <div className="w-8 h-10 rounded bg-slate-100 ring-1 ring-slate-200" />
                      )}
                    </td>
                    <td className="px-5 py-3 font-bold text-[#0A1E3D] bg-white">
                      {s?.full_name || '—'}{' '}
                      <span className="text-gray-600 font-mono text-[10px] font-normal">
                        {s?.admission_number}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center bg-white">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 uppercase ${
                          a.status === 'submitted'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : a.status === 'in_progress'
                            ? 'bg-blue-50 text-blue-700 ring-blue-200'
                            : a.status === 'graded'
                            ? 'bg-purple-50 text-purple-700 ring-purple-200'
                            : 'bg-amber-50 text-amber-700 ring-amber-200'
                        }`}
                      >
                        {a.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center font-bold text-[#1A2332] bg-white">
                      {a.score ?? '—'} / {a.total_marks ?? '—'}{' '}
                      <span className="text-gray-600">({pct}%)</span>
                    </td>
                    <td className="px-5 py-3 text-center text-[#1A2332] bg-white">
                      {formatDuration(a.duration_spent_seconds)}
                    </td>
                    <td className="px-5 py-3 text-center bg-white">
                      <span
                        className={`font-bold ${
                          a.tab_switch_count > 0 ? 'text-red-700' : 'text-gray-600'
                        }`}
                      >
                        {a.tab_switch_count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-gray-600 bg-white">
                      {a.submitted_at
                        ? new Date(a.submitted_at).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ============================================================================
   TAB: LIVE MONITOR
   ============================================================================ */

function LiveMonitorTab({
  exams,
  students,
  classes,
  subjects,
  questions,
  showToast,
  logAction,
  askConfirm,
}: {
  exams: CbtExam[]
  students: Student[]
  classes: ClassRow[]
  subjects: SubjectRow[]
  questions: Question[]
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const [selectedExamId, setSelectedExamId] = useState('')
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [subTab, setSubTab] = useState<'live' | 'theory'>('live')

  const classById = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.id, c.name])),
    [classes]
  )
  const subjectById = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    [subjects]
  )
  const studentById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  )

  const selectedExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) || null,
    [exams, selectedExamId]
  )

  const classStudents = useMemo(() => {
    if (!selectedExam) return []
    return students
      .filter((s) => s.class_id === selectedExam.class_id)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [students, selectedExam])

  const examQuestions = useMemo(() => {
    if (!selectedExam) return []
    return questions.filter((q) => q.exam_id === selectedExam.id)
  }, [questions, selectedExam])

  const objectiveQuestions = useMemo(
    () => examQuestions.filter((q) => q.type === 'objective'),
    [examQuestions]
  )
  const theoryQuestions = useMemo(
    () => examQuestions.filter((q) => q.type === 'theory'),
    [examQuestions]
  )

  const loadAttempts = useCallback(async () => {
    if (!selectedExamId) {
      setAttempts([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('cbt_attempts')
      .select('*')
      .eq('exam_id', selectedExamId)
    if (error) showToast(`Failed to load attempts: ${error.message}`, 'error')
    setAttempts((data || []) as Attempt[])
    setLastRefresh(new Date())
    setLoading(false)
  }, [selectedExamId, showToast])

  useEffect(() => {
    loadAttempts()
  }, [loadAttempts])

  useEffect(() => {
    if (!autoRefresh || !selectedExamId) return
    const i = setInterval(() => {
      loadAttempts()
    }, LIVE_REFRESH_MS)
    return () => clearInterval(i)
  }, [autoRefresh, selectedExamId, loadAttempts])

  const stats = useMemo(() => {
    const total = classStudents.length
    const started = attempts.length
    const submitted = attempts.filter((a) => a.status !== 'in_progress').length
    const inProgress = attempts.filter((a) => a.status === 'in_progress').length
    const notStarted = total - started
    const durations = attempts
      .filter((a) => a.duration_spent_seconds)
      .map((a) => a.duration_spent_seconds || 0)
    const avgSeconds =
      durations.length > 0
        ? Math.round(
            durations.reduce((a, b) => a + b, 0) / durations.length
          )
        : 0
    return { total, started, submitted, inProgress, notStarted, avgSeconds }
  }, [classStudents, attempts])

  async function forceSubmit(attempt: Attempt) {
    const student = studentById[attempt.student_id]
    askConfirm(
      'Force Submit?',
      `Force submit ${student?.full_name}'s attempt? Score will be calculated from current answers.`,
      async () => {
        const score = computeObjectiveScore(attempt.answers, objectiveQuestions)
        const total = objectiveQuestions.reduce((a, q) => a + q.marks, 0)
        const needsManual = theoryQuestions.length > 0
        const { error } = await supabase
          .from('cbt_attempts')
          .update({
            status: needsManual ? 'pending_manual_marking' : 'submitted',
            submitted_at: new Date().toISOString(),
            score,
            total_marks: total,
            final_score: needsManual ? null : score,
          })
          .eq('id', attempt.id)
        if (error) {
          showToast(`Force submit failed: ${error.message}`, 'error')
          return
        }
        showToast(`${student?.full_name}'s attempt force-submitted.`, 'warn')
        logAction('Force submit', `${student?.full_name} · ${selectedExam?.title}`)
        loadAttempts()
      }
    )
  }

  function cancelAttempt(attempt: Attempt) {
    const student = studentById[attempt.student_id]
    askConfirm(
      'Cancel Attempt?',
      `Delete ${student?.full_name}'s attempt? They can start fresh.`,
      async () => {
        const { error } = await supabase
          .from('cbt_attempts')
          .delete()
          .eq('id', attempt.id)
        if (error) {
          showToast(`Cancel failed: ${error.message}`, 'error')
          return
        }
        showToast(`Attempt cancelled for ${student?.full_name}.`, 'warn')
        logAction('Attempt cancelled', `${student?.full_name}`)
        loadAttempts()
      }
    )
  }

  function extendOne(attempt: Attempt, minutes: number) {
    const student = studentById[attempt.student_id]
    askConfirm(
      'Extend Time?',
      `Add +${minutes} minutes to ${student?.full_name}'s attempt?`,
      async () => {
        const { error } = await supabase
          .from('cbt_attempts')
          .update({
            extended_minutes: (attempt.extended_minutes || 0) + minutes,
          })
          .eq('id', attempt.id)
        if (error) {
          showToast(`Extend failed: ${error.message}`, 'error')
          return
        }
        showToast(`+${minutes} min added for ${student?.full_name}.`, 'info')
        logAction('Extended time', `${student?.full_name} · +${minutes}m`)
        loadAttempts()
      }
    )
  }

  function extendAll(minutes: number) {
    if (!selectedExam) return
    const active = attempts.filter((a) => a.status === 'in_progress')
    if (active.length === 0) {
      showToast('No active attempts to extend.', 'warn')
      return
    }
    askConfirm(
      'Extend Everyone?',
      `Add +${minutes} minutes to all ${active.length} in-progress attempts?`,
      async () => {
        for (const a of active) {
          await supabase
            .from('cbt_attempts')
            .update({
              extended_minutes: (a.extended_minutes || 0) + minutes,
            })
            .eq('id', a.id)
        }
        showToast(`+${minutes} min added to ${active.length} student(s).`, 'info')
        logAction('Extended all', `${selectedExam.title} · +${minutes}m`)
        loadAttempts()
      }
    )
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
              Live Exam
            </label>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            >
              <option value="">-- Choose Exam --</option>
              {exams
                .filter((e) => e.status === 'published')
                .map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title} · {classById[ex.class_id]} ·{' '}
                    {subjectById[ex.subject_id]}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`flex-1 text-xs font-bold py-2.5 rounded-xl border ${
                autoRefresh
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-gray-700 border-slate-200'
              }`}
            >
              {autoRefresh ? '● Auto-refresh ON' : '○ Auto-refresh OFF'}
            </button>
            <button
              onClick={loadAttempts}
              className="text-xs font-bold bg-[#0A1E3D] text-white px-4 py-2.5 rounded-xl hover:bg-black inline-flex items-center gap-2"
            >
              <Icon name="refresh" /> Refresh
            </button>
          </div>
        </div>

        {selectedExam && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
            <span className="text-[11px] text-gray-600">
              {lastRefresh
                ? `Last refresh: ${lastRefresh.toLocaleTimeString()}`
                : 'Loading…'}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => extendAll(5)}
              className="text-xs font-bold bg-amber-100 text-amber-800 px-3.5 py-2 rounded-xl hover:bg-amber-200"
            >
              +5 min (all)
            </button>
            <button
              onClick={() => extendAll(10)}
              className="text-xs font-bold bg-amber-100 text-amber-800 px-3.5 py-2 rounded-xl hover:bg-amber-200"
            >
              +10 min (all)
            </button>
          </div>
        )}
      </div>

      {!selectedExam && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-12 text-center text-xs text-gray-500 italic">
          Choose a published exam above to monitor attempts.
        </div>
      )}

      {selectedExam && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <LiveStat label="Enrolled" value={stats.total} tone="neutral" />
            <LiveStat label="Started" value={stats.started} tone="blue" />
            <LiveStat
              label="In Progress"
              value={stats.inProgress}
              tone="amber"
            />
            <LiveStat
              label="Submitted"
              value={stats.submitted}
              tone="emerald"
            />
            <LiveStat
              label="Not Started"
              value={stats.notStarted}
              tone="neutral"
            />
            <LiveStat
              label="Avg Time"
              value={
                stats.avgSeconds > 0 ? formatDuration(stats.avgSeconds) : '—'
              }
              tone="neutral"
              isText
            />
          </div>

          {theoryQuestions.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="border-b border-slate-100 flex">
                <button
                  onClick={() => setSubTab('live')}
                  className={`px-5 py-3.5 text-xs font-bold border-b-2 ${
                    subTab === 'live'
                      ? 'border-amber-500 text-[#0A1E3D]'
                      : 'border-transparent text-gray-500'
                  }`}
                >
                  Live Status
                </button>
                <button
                  onClick={() => setSubTab('theory')}
                  className={`px-5 py-3.5 text-xs font-bold border-b-2 ${
                    subTab === 'theory'
                      ? 'border-amber-500 text-[#0A1E3D]'
                      : 'border-transparent text-gray-500'
                  }`}
                >
                  Mark Theory ({theoryQuestions.length})
                </button>
              </div>
            </div>
          )}

          {subTab === 'live' && (
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-[#0A1E3D]">
                  {selectedExam.title} · Live Status
                </h3>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  {classStudents.length} students · {objectiveQuestions.length}{' '}
                  objective · {theoryQuestions.length} theory
                </p>
              </div>
              <div className="overflow-x-auto max-h-[640px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0A1E3D] text-white text-[11px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-3 py-3 w-12 text-white"></th>
                      <th className="px-4 py-3 text-white">Student</th>
                      <th className="px-4 py-3 text-white">Adm No</th>
                      <th className="px-4 py-3 text-center text-white">Status</th>
                      <th className="px-4 py-3 text-center text-white">
                        Progress
                      </th>
                      <th className="px-4 py-3 text-center text-white">Score</th>
                      <th className="px-4 py-3 text-center text-white">
                        Switches
                      </th>
                      <th className="px-4 py-3 text-right text-white">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {classStudents.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-12 text-center text-xs text-gray-500 italic bg-white"
                        >
                          No students in this class.
                        </td>
                      </tr>
                    )}
                    {classStudents.map((student) => {
                      const att = attempts.find(
                        (a) => a.student_id === student.id
                      )
                      const objAnswered = att
                        ? Object.keys(att.answers || {}).length
                        : 0
                      const objScore = att
                        ? computeObjectiveScore(att.answers, objectiveQuestions)
                        : 0
                      const totalObj = objectiveQuestions.reduce(
                        (a, q) => a + q.marks,
                        0
                      )
                      const statusLabel = !att
                        ? 'Not Started'
                        : att.status === 'in_progress'
                        ? 'In Progress'
                        : att.status === 'submitted'
                        ? 'Submitted'
                        : att.status === 'auto_submitted'
                        ? 'Auto Submitted'
                        : att.status === 'pending_manual_marking'
                        ? 'Pending Marking'
                        : att.status === 'graded'
                        ? 'Graded'
                        : att.status
                      const tone = !att
                        ? 'bg-slate-100 text-gray-700 ring-slate-200'
                        : att.status === 'in_progress'
                        ? 'bg-blue-50 text-blue-700 ring-blue-200'
                        : att.status === 'pending_manual_marking'
                        ? 'bg-amber-50 text-amber-700 ring-amber-200'
                        : att.status === 'graded'
                        ? 'bg-purple-50 text-purple-700 ring-purple-200'
                        : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      return (
                        <tr key={student.id} className="hover:bg-amber-50/40">
                          <td className="px-3 py-2 bg-white">
                            {student.passport_url ? (
                              <img
                                src={student.passport_url}
                                alt={student.full_name}
                                className="w-8 h-10 object-cover rounded ring-1 ring-slate-200"
                              />
                            ) : (
                              <div className="w-8 h-10 rounded bg-slate-100 ring-1 ring-slate-200" />
                            )}
                          </td>
                          <td className="px-4 py-3 font-bold text-[#0A1E3D] bg-white">
                            {student.full_name}
                          </td>
                          <td className="px-4 py-3 font-mono text-amber-700 font-semibold bg-white">
                            {student.admission_number}
                          </td>
                          <td className="px-4 py-3 text-center bg-white">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 uppercase ${tone}`}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-[#1A2332] font-mono bg-white">
                            {att ? (
                              <span>
                                {objAnswered}/{objectiveQuestions.length}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-[#1A2332] bg-white">
                            {att && att.status !== 'in_progress' ? (
                              <>
                                {objScore}/{totalObj}
                              </>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center bg-white">
                            {att ? (
                              <span
                                className={`font-bold ${
                                  att.tab_switch_count > 0
                                    ? 'text-red-700'
                                    : 'text-gray-600'
                                }`}
                              >
                                {att.tab_switch_count}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap bg-white">
                            {att ? (
                              <>
                                {att.status === 'in_progress' && (
                                  <>
                                    <button
                                      onClick={() => extendOne(att, 5)}
                                      className="text-amber-700 hover:text-amber-800 font-bold text-[11px] mr-2"
                                    >
                                      +5m
                                    </button>
                                    <button
                                      onClick={() => forceSubmit(att)}
                                      className="text-emerald-700 hover:text-emerald-800 font-bold text-[11px] mr-2"
                                    >
                                      Force
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => cancelAttempt(att)}
                                  className="text-red-700 hover:text-red-800 font-bold text-[11px]"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <span className="text-[11px] text-gray-500 italic">
                                Waiting…
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {subTab === 'theory' && theoryQuestions.length > 0 && (
            <TheoryMarkingPanel
              exam={selectedExam}
              questions={theoryQuestions}
              attempts={attempts}
              students={classStudents}
              objectiveQuestions={objectiveQuestions}
              showToast={showToast}
              logAction={logAction}
              onReload={loadAttempts}
            />
          )}
        </>
      )}
    </div>
  )
}

function LiveStat({
  label,
  value,
  tone,
  isText,
}: {
  label: string
  value: number | string
  tone: 'neutral' | 'blue' | 'amber' | 'emerald'
  isText?: boolean
}) {
  const toneMap = {
    neutral: 'text-[#0A1E3D]',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
  }
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
        {label}
      </p>
      <p
        className={`${isText ? 'text-lg' : 'text-2xl'} font-black mt-1 ${
          toneMap[tone]
        }`}
      >
        {value}
      </p>
    </div>
  )
}

/* ============================================================================
   THEORY MARKING PANEL
   ============================================================================ */

function TheoryMarkingPanel({
  exam,
  questions,
  attempts,
  students,
  objectiveQuestions,
  showToast,
  logAction,
  onReload,
}: {
  exam: CbtExam
  questions: Question[]
  attempts: Attempt[]
  students: Student[]
  objectiveQuestions: Question[]
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  onReload: () => void
}) {
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Record<string, number>>>({})
  const [saving, setSaving] = useState(false)

  const studentById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  )

  const pendingAttempts = useMemo(
    () =>
      attempts.filter(
        (a) =>
          a.status === 'pending_manual_marking' || a.status === 'graded'
      ),
    [attempts]
  )

  function initDraft(attempt: Attempt) {
    if (drafts[attempt.id]) return
    const init: Record<string, number> = {}
    questions.forEach((q) => {
      init[q.id] = 0
    })
    setDrafts((prev) => ({ ...prev, [attempt.id]: init }))
  }

  async function saveMarks(attempt: Attempt) {
    const d = drafts[attempt.id] || {}
    const theoryScore = Object.values(d).reduce((a, b) => a + (b || 0), 0)
    const objScore = attempt.score || 0
    const finalScore = objScore + theoryScore

    setSaving(true)
    const { error } = await supabase
      .from('cbt_attempts')
      .update({
        final_score: finalScore,
        status: 'graded',
        graded_at: new Date().toISOString(),
      })
      .eq('id', attempt.id)
    setSaving(false)

    if (error) {
      showToast(`Save failed: ${error.message}`, 'error')
      return
    }
    showToast(`Marks saved. Final score: ${finalScore}`)
    logAction(
      'Theory marked',
      `${studentById[attempt.student_id]?.full_name} · Final ${finalScore}`
    )
    onReload()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-[#0A1E3D]">
          Theory Marking · {questions.length} question(s)
        </h3>
        <p className="text-[11px] text-gray-600 mt-0.5">
          Open each submission to award marks per question.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {pendingAttempts.length === 0 && (
          <div className="p-12 text-center text-xs text-gray-500 italic">
            No submissions waiting for manual marking.
          </div>
        )}
        {pendingAttempts.map((attempt) => {
          const student = studentById[attempt.student_id]
          const open = openAttemptId === attempt.id
          const objTotal = objectiveQuestions.reduce((a, q) => a + q.marks, 0)
          return (
            <div key={attempt.id}>
              <button
                onClick={() => {
                  setOpenAttemptId(open ? null : attempt.id)
                  if (!open) initDraft(attempt)
                }}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-amber-50/40"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {student?.passport_url ? (
                    <img
                      src={student.passport_url}
                      alt={student.full_name}
                      className="w-10 h-12 object-cover rounded-lg ring-1 ring-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-12 rounded-lg bg-slate-100 ring-1 ring-slate-200 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[#0A1E3D] truncate">
                      {student?.full_name || '—'}
                    </p>
                    <p className="text-[10px] text-gray-600 font-mono">
                      {student?.admission_number}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 uppercase ${
                      attempt.status === 'graded'
                        ? 'bg-purple-50 text-purple-700 ring-purple-200'
                        : 'bg-amber-50 text-amber-700 ring-amber-200'
                    }`}
                  >
                    {attempt.status === 'graded' ? 'Graded' : 'Pending'}
                  </span>
                  {attempt.final_score !== null && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-gray-700">
                      Final: {attempt.final_score}
                    </span>
                  )}
                  <span className="text-xs text-gray-600">
                    {open ? '▲' : '▼'}
                  </span>
                </div>
              </button>

              {open && (
                <div className="px-5 pb-6 space-y-4 bg-slate-50">
                  <div className="bg-white rounded-xl p-4 border border-slate-200 mt-3">
                    <p className="text-[11px] font-bold uppercase text-gray-600">
                      Objective Section
                    </p>
                    <p className="text-sm font-bold text-[#0A1E3D] mt-1">
                      {attempt.score ?? 0} / {objTotal} marks auto-scored
                    </p>
                  </div>

                  {questions.map((q, idx) => {
                    const studentAnswer =
                      (attempt.theory_answers || {})[q.id] || ''
                    const awarded = drafts[attempt.id]?.[q.id] ?? 0
                    return (
                      <div
                        key={q.id}
                        className="bg-white rounded-xl p-4 border border-slate-200 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 flex-1">
                            <span className="shrink-0 w-7 h-7 rounded-lg bg-[#0A1E3D] text-white text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <p className="text-sm font-medium text-[#1A2332]">
                              {q.question_text}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-gray-600 shrink-0">
                            Max {q.marks}
                          </span>
                        </div>

                        <div>
                          <p className="text-[11px] font-bold uppercase text-gray-600 mb-1">
                            Student's Answer
                          </p>
                          <div className="bg-slate-50 rounded-lg p-3 text-xs text-[#1A2332] whitespace-pre-wrap border border-slate-200">
                            {studentAnswer || (
                              <span className="italic text-gray-500">
                                (Blank)
                              </span>
                            )}
                          </div>
                        </div>

                        {q.theory_answer_guide && (
                          <details>
                            <summary className="cursor-pointer text-[11px] font-bold text-amber-700 hover:text-amber-800">
                              Show answer guide
                            </summary>
                            <p className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 italic whitespace-pre-wrap">
                              {q.theory_answer_guide}
                            </p>
                          </details>
                        )}

                        <div className="flex items-center gap-3">
                          <label className="text-xs font-bold text-gray-700">
                            Marks:
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={q.marks}
                            value={awarded}
                            onChange={(e) => {
                              const v = Math.max(
                                0,
                                Math.min(q.marks, Number(e.target.value) || 0)
                              )
                              setDrafts((prev) => ({
                                ...prev,
                                [attempt.id]: {
                                  ...(prev[attempt.id] || {}),
                                  [q.id]: v,
                                },
                              }))
                            }}
                            className="w-20 text-sm px-3 py-2 bg-white border border-amber-200 rounded-lg outline-none text-center font-bold text-[#1A2332]"
                          />
                          <span className="text-xs text-gray-600">
                            / {q.marks}
                          </span>
                        </div>
                      </div>
                    )
                  })}

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      onClick={() => setOpenAttemptId(null)}
                      className="text-xs font-bold px-4 py-2 rounded-lg text-gray-700 hover:bg-slate-100"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => saveMarks(attempt)}
                      disabled={saving}
                      className="text-xs font-bold px-5 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      Save Marks &amp; Finalize
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
/* ============================================================================
   TAB: BROADSHEET (Download + Lock)
   ============================================================================ */

function BroadsheetTab({
  classes,
  subjects,
  students,
  scores,
  setScores,
  reportCardPub,
  broadsheetLocks,
  defaultSession,
  defaultTerm,
  refresh,
  showToast,
  logAction,
  askConfirm,
}: {
  classes: ClassRow[]
  subjects: SubjectRow[]
  students: Student[]
  scores: ScoreRow[]
  setScores: (s: ScoreRow[]) => void
  reportCardPub: ReportCardPub[]
  broadsheetLocks: BroadsheetLock[]
  defaultSession: string
  defaultTerm: Term
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedTerm, setSelectedTerm] = useState<Term>(defaultTerm)
  const [session, setSession] = useState(defaultSession)

  // Update defaults when parent changes
  useEffect(() => {
    setSelectedTerm(defaultTerm)
    setSession(defaultSession)
  }, [defaultTerm, defaultSession])

  const classById = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.id, c.name])),
    [classes]
  )
  const subjectById = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    [subjects]
  )
  const studentById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  )

  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === selectedClass),
    [students, selectedClass]
  )

  const filteredScores = useMemo(
    () =>
      scores.filter((sc) => {
        const student = studentById[sc.student_id]
        return (
          student?.class_id === selectedClass &&
          sc.term === selectedTerm &&
          sc.session === session
        )
      }),
    [scores, selectedClass, selectedTerm, session, studentById]
  )

  const classSubjectIds = useMemo(() => {
    const set = new Set<string>()
    filteredScores.forEach((s) => set.add(s.subject_id))
    return Array.from(set).sort()
  }, [filteredScores])

  const rows = useMemo(() => {
    const byStudent = new Map<
      string,
      {
        id: string
        name: string
        admissionNo: string
        age: number | null
        passport: string | null
        subjects: Record<
          string,
          { test: number | null; exam: number | null; total: number }
        >
        total: number
        subjectsOffered: number
        percentage: number
      }
    >()

    classStudents.forEach((st) => {
      byStudent.set(st.id, {
        id: st.id,
        name: st.full_name,
        admissionNo: st.admission_number,
        age: ageFromDob(st.date_of_birth),
        passport: st.passport_url,
        subjects: {},
        total: 0,
        subjectsOffered: 0,
        percentage: 0,
      })
    })

    filteredScores.forEach((sc) => {
      const row = byStudent.get(sc.student_id)
      if (!row) return
      row.subjects[sc.subject_id] = {
        test: sc.test_score,
        exam: sc.exam_score,
        total: (sc.test_score || 0) + (sc.exam_score || 0),
      }
      if (sc.test_score !== null || sc.exam_score !== null) {
        row.total += (sc.test_score || 0) + (sc.exam_score || 0)
        row.subjectsOffered++
      }
    })

    const arr = Array.from(byStudent.values()).map((r) => ({
      ...r,
      percentage:
        r.subjectsOffered > 0
          ? (r.total / (r.subjectsOffered * 100)) * 100
          : 0,
    }))

    const sorted = [...arr].sort((a, b) => b.total - a.total)
    const rankMap: Record<string, number> = {}
    let lastTotal = -1,
      lastRank = 0
    sorted.forEach((s, i) => {
      if (s.total === lastTotal) rankMap[s.id] = lastRank
      else {
        rankMap[s.id] = i + 1
        lastRank = i + 1
        lastTotal = s.total
      }
    })

    return arr
      .map((r) => ({ ...r, rank: rankMap[r.id] }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [classStudents, filteredScores])

  const classAverage = useMemo(() => {
    if (rows.length === 0) return '0.00'
    const sum = rows.reduce((a, r) => a + r.percentage, 0)
    return (sum / rows.length).toFixed(2)
  }, [rows])

  const isPublished = reportCardPub.some(
    (r) =>
      r.class_id === selectedClass &&
      r.term === selectedTerm &&
      r.session === session
  )

  const isLocked = broadsheetLocks.some(
    (l) =>
      l.class_id === selectedClass &&
      l.term === selectedTerm &&
      l.session === session &&
      l.locked
  )

  function downloadTemplate() {
    if (!selectedClass) {
      showToast('Pick a class.', 'warn')
      return
    }
    const header: string[] = ['Admission No', 'Name', 'Date of Birth']
    subjects.forEach((s) =>
      header.push(`${s.name} CA (40)`, `${s.name} Exam (60)`)
    )
    const ws = XLSX.utils.aoa_to_sheet([
      header,
      ...classStudents.map((s) => [
        s.admission_number,
        s.full_name,
        s.date_of_birth || '',
        ...subjects.flatMap(() => ['', '']),
      ]),
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      (classById[selectedClass] || 'Class').slice(0, 28)
    )
    XLSX.writeFile(
      wb,
      `IRIS_Broadsheet_${classById[selectedClass]}_${selectedTerm}.xlsx`.replace(
        /\s+/g,
        '_'
      )
    )
    showToast('Template downloaded.', 'info')
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!selectedClass) {
      showToast('Pick a class first.', 'warn')
      return
    }

    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<any>(sheet, {
          header: 1,
          defval: '',
        })
        if (raw.length < 2) {
          showToast('File is empty.', 'error')
          return
        }

        const header = raw[0] as string[]
        const body = raw.slice(1) as any[][]

        const subjectNameToId = new Map<string, string>()
        subjects.forEach((s) => subjectNameToId.set(normalizeName(s.name), s.id))

        const subjectCols: {
          subject_id: string
          caIdx: number
          examIdx: number
        }[] = []
        const errors: string[] = []
        for (let i = 0; i < header.length; i++) {
          const h = String(header[i]).trim()
          const m = h.match(/^(.+?)\s+CA\s*\(\d+\)$/i)
          if (m) {
            const subjName = m[1].trim()
            const sid = subjectNameToId.get(normalizeName(subjName))
            if (!sid) {
              errors.push(`Unknown subject "${subjName}"`)
              continue
            }
            const examIdx = header.findIndex((x) =>
              new RegExp(
                `^${subjName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+Exam`,
                'i'
              ).test(String(x))
            )
            if (examIdx === -1) {
              errors.push(`No Exam column for "${subjName}"`)
              continue
            }
            subjectCols.push({ subject_id: sid, caIdx: i, examIdx })
          }
        }
        if (subjectCols.length === 0) {
          showToast('No subject columns found. Use the template.', 'error')
          return
        }
        if (errors.length) {
          showToast(`Header errors: ${errors[0]}`, 'error')
          return
        }

        const admToStudent = new Map<string, Student>()
        classStudents.forEach((s) =>
          admToStudent.set(s.admission_number.toLowerCase(), s)
        )

        const upserts: any[] = []
        const rowErrors: string[] = []

        body.forEach((row, rowIdx) => {
          const adm = String(row[0] ?? '').trim()
          if (!adm) return
          const student = admToStudent.get(adm.toLowerCase())
          if (!student) {
            rowErrors.push(`Row ${rowIdx + 2}: ${adm} not in this class`)
            return
          }
          subjectCols.forEach((sc) => {
            const caRaw = row[sc.caIdx]
            const examRaw = row[sc.examIdx]
            const ca = caRaw === '' || caRaw == null ? null : Number(caRaw)
            const exam =
              examRaw === '' || examRaw == null ? null : Number(examRaw)
            if (ca !== null && (isNaN(ca) || ca < 0 || ca > 40)) {
              rowErrors.push(`Row ${rowIdx + 2}: CA must be 0–40`)
              return
            }
            if (exam !== null && (isNaN(exam) || exam < 0 || exam > 60)) {
              rowErrors.push(`Row ${rowIdx + 2}: Exam must be 0–60`)
              return
            }
            if (ca === null && exam === null) return
            upserts.push({
              student_id: student.id,
              subject_id: sc.subject_id,
              class_id: selectedClass,
              test_score: ca,
              exam_score: exam,
              term: selectedTerm,
              session,
            })
          })
        })

        if (rowErrors.length) {
          showToast(`${rowErrors.length} issue(s): ${rowErrors[0]}`, 'error')
          return
        }
        if (upserts.length === 0) {
          showToast('No valid scores found.', 'error')
          return
        }

        const { error } = await supabase
          .from('scores')
          .upsert(upserts, {
            onConflict: 'student_id,subject_id,term,session',
          })

        if (error) {
          showToast(`Save failed: ${error.message}`, 'error')
          return
        }

        const { data: fresh } = await supabase.from('scores').select('*')
        setScores(fresh || [])
        showToast(`${upserts.length} score(s) saved.`)
        logAction(
          'Broadsheet uploaded',
          `${classById[selectedClass]} · ${selectedTerm} · ${upserts.length} scores`
        )
      } catch {
        showToast('Could not read the file.', 'error')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  function downloadBroadsheet() {
    if (!selectedClass || rows.length === 0) {
      showToast('No broadsheet data to download.', 'warn')
      return
    }

    const header: string[] = ['#', 'Admission No', 'Name', 'Age']
    classSubjectIds.forEach((sid) => header.push(subjectById[sid] || 'Subject'))
    header.push('Total', 'Average', 'Grade', 'Position')

    const dataRows = rows.map((r, idx) => {
      const { grade } = gradeFromTotal(r.percentage)
      const row: any[] = [idx + 1, r.admissionNo, r.name, r.age ?? '']
      classSubjectIds.forEach((sid) => {
        const s = r.subjects[sid]
        row.push(s ? s.total : '')
      })
      row.push(r.total, Number(r.percentage.toFixed(2)), grade, ordinal(r.rank))
      return row
    })

    const avgRow: any[] = ['', '', 'CLASS AVERAGE', '']
    classSubjectIds.forEach(() => avgRow.push(''))
    avgRow.push('', classAverage, '', '')
    dataRows.push(avgRow)

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows])
    ws['!cols'] = [
      { wch: 4 },
      { wch: 16 },
      { wch: 26 },
      { wch: 6 },
      ...classSubjectIds.map(() => ({ wch: 10 })),
      { wch: 8 },
      { wch: 10 },
      { wch: 8 },
      { wch: 10 },
    ]

    const wb = XLSX.utils.book_new()
    const safeClass = (classById[selectedClass] || 'Class').replace(
      /[^A-Za-z0-9]+/g,
      '_'
    )
    XLSX.utils.book_append_sheet(wb, ws, safeClass.slice(0, 28))
    XLSX.writeFile(
      wb,
      `IRIS_Broadsheet_${safeClass}_${selectedTerm.replace(/\s+/g, '_')}.xlsx`
    )
    showToast('Broadsheet downloaded.', 'info')
    logAction(
      'Broadsheet downloaded',
      `${classById[selectedClass]} · ${selectedTerm}`
    )
  }

  async function publishReportCards() {
    askConfirm(
      'Publish Report Cards?',
      `All students in ${classById[selectedClass]} will see their ${selectedTerm} report cards immediately. Continue?`,
      async () => {
        const { error } = await supabase
          .from('report_card_publications')
          .insert([
            { class_id: selectedClass, term: selectedTerm, session },
          ])
        if (error) {
          if (error.code === '23505')
            showToast('Already published for this class + term.', 'warn')
          else showToast(`Publish failed: ${error.message}`, 'error')
          return
        }
        showToast(
          `Report cards published for ${classById[selectedClass]} · ${selectedTerm}.`
        )
        logAction(
          'Report cards published',
          `${classById[selectedClass]} · ${selectedTerm} · ${session}`
        )
        refresh()
      }
    )
  }

  async function unpublishReportCards() {
    askConfirm(
      'Unpublish Report Cards?',
      `Students in ${classById[selectedClass]} will no longer see their ${selectedTerm} report cards. Continue?`,
      async () => {
        const { error } = await supabase
          .from('report_card_publications')
          .delete()
          .eq('class_id', selectedClass)
          .eq('term', selectedTerm)
          .eq('session', session)
        if (error) {
          showToast(`Unpublish failed: ${error.message}`, 'error')
          return
        }
        showToast(
          `Report cards unpublished for ${classById[selectedClass]} · ${selectedTerm}.`,
          'warn'
        )
        logAction(
          'Report cards unpublished',
          `${classById[selectedClass]} · ${selectedTerm}`
        )
        refresh()
      }
    )
  }

  async function lockScores() {
    askConfirm(
      'Lock Scores?',
      `Once locked, teachers will NOT be able to add or edit scores for ${classById[selectedClass]} · ${selectedTerm}. Continue?`,
      async () => {
        const existing = broadsheetLocks.find(
          (l) =>
            l.class_id === selectedClass &&
            l.term === selectedTerm &&
            l.session === session
        )
        if (existing) {
          const { error } = await supabase
            .from('broadsheet_locks')
            .update({
              locked: true,
              locked_at: new Date().toISOString(),
              locked_by: 'Master Admin',
            })
            .eq('id', existing.id)
          if (error) {
            showToast(`Lock failed: ${error.message}`, 'error')
            return
          }
        } else {
          const { error } = await supabase
            .from('broadsheet_locks')
            .insert([
              {
                class_id: selectedClass,
                term: selectedTerm,
                session,
                locked: true,
                locked_at: new Date().toISOString(),
                locked_by: 'Master Admin',
              },
            ])
          if (error) {
            showToast(`Lock failed: ${error.message}`, 'error')
            return
          }
        }
        showToast('Scores locked. Teachers can no longer edit.', 'warn')
        logAction(
          'Scores locked',
          `${classById[selectedClass]} · ${selectedTerm} · ${session}`
        )
        refresh()
      }
    )
  }

  async function unlockScores() {
    askConfirm(
      'Unlock Scores?',
      `Teachers will be able to edit scores again for ${classById[selectedClass]} · ${selectedTerm}.`,
      async () => {
        const existing = broadsheetLocks.find(
          (l) =>
            l.class_id === selectedClass &&
            l.term === selectedTerm &&
            l.session === session
        )
        if (!existing) {
          showToast('No lock found.', 'warn')
          return
        }
        const { error } = await supabase
          .from('broadsheet_locks')
          .update({ locked: false, locked_at: null, locked_by: null })
          .eq('id', existing.id)
        if (error) {
          showToast(`Unlock failed: ${error.message}`, 'error')
          return
        }
        showToast('Scores unlocked. Teachers can edit again.', 'info')
        logAction(
          'Scores unlocked',
          `${classById[selectedClass]} · ${selectedTerm} · ${session}`
        )
        refresh()
      }
    )
  }

  async function clearBroadsheet() {
    askConfirm(
      'Clear All Scores?',
      `This will delete ALL subject scores for ${classById[selectedClass]} · ${selectedTerm} · ${session}. You can re-upload a corrected file after. Cannot be undone.`,
      async () => {
        const { error: scErr } = await supabase
          .from('scores')
          .delete()
          .eq('class_id', selectedClass)
          .eq('term', selectedTerm)
          .eq('session', session)

        if (scErr) {
          showToast(`Clear failed: ${scErr.message}`, 'error')
          return
        }

        const { error: pubErr } = await supabase
          .from('report_card_publications')
          .delete()
          .eq('class_id', selectedClass)
          .eq('term', selectedTerm)
          .eq('session', session)

        if (pubErr) {
          showToast(
            `Cleared scores but couldn't unpublish report cards: ${pubErr.message}`,
            'warn'
          )
        }

        showToast('Broadsheet cleared. You can now re-upload.')
        logAction(
          'Broadsheet cleared',
          `${classById[selectedClass]} · ${selectedTerm} · ${session}`
        )

        const { data: fresh } = await supabase.from('scores').select('*')
        setScores(fresh || [])
        refresh()
      }
    )
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
              Class
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            >
              <option value="">-- Choose Class --</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
              Term
            </label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value as Term)}
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            >
              {TERMS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
              Session
            </label>
            <input
              value={session}
              onChange={(e) => setSession(e.target.value)}
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={downloadTemplate}
            className="text-xs font-bold bg-[#0A1E3D] text-white px-4 py-2.5 rounded-xl hover:bg-black inline-flex items-center gap-2"
          >
            <Icon name="download" /> Template
          </button>
          <label className="text-xs font-bold bg-amber-500 text-white px-4 py-2.5 rounded-xl hover:bg-amber-600 cursor-pointer inline-flex items-center gap-2">
            <Icon name="upload" /> Upload Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUpload}
              className="hidden"
            />
          </label>

          {selectedClass && rows.length > 0 && (
            <button
              onClick={downloadBroadsheet}
              className="text-xs font-bold bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 inline-flex items-center gap-2"
            >
              <Icon name="download" /> Download Broadsheet
            </button>
          )}

          {selectedClass && !isPublished && (
            <button
              onClick={publishReportCards}
              className="text-xs font-bold bg-emerald-600 text-white px-4 py-2.5 rounded-xl hover:bg-emerald-700 inline-flex items-center gap-2"
            >
              🚀 Publish Report Cards
            </button>
          )}
          {selectedClass && isPublished && (
            <>
              <span className="text-xs font-bold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-4 py-2.5 rounded-xl inline-flex items-center gap-2">
                ✓ Report Cards Published
              </span>
              <button
                onClick={unpublishReportCards}
                className="text-xs font-bold bg-amber-600 text-white px-4 py-2.5 rounded-xl hover:bg-amber-700"
              >
                Unpublish Report Cards
              </button>
            </>
          )}

          {selectedClass && !isLocked && (
            <button
              onClick={lockScores}
              className="text-xs font-bold bg-slate-800 text-white px-4 py-2.5 rounded-xl hover:bg-black inline-flex items-center gap-2"
            >
              <Icon name="lock" /> Lock Scores
            </button>
          )}
          {selectedClass && isLocked && (
            <>
              <span className="text-xs font-bold bg-rose-50 text-rose-700 ring-1 ring-rose-200 px-4 py-2.5 rounded-xl inline-flex items-center gap-2">
                🔒 Scores Locked
              </span>
              <button
                onClick={unlockScores}
                className="text-xs font-bold bg-rose-600 text-white px-4 py-2.5 rounded-xl hover:bg-rose-700 inline-flex items-center gap-2"
              >
                <Icon name="unlock" /> Unlock Scores
              </button>
            </>
          )}

          {selectedClass && filteredScores.length > 0 && (
            <button
              onClick={clearBroadsheet}
              className="text-xs font-bold bg-red-600 text-white px-4 py-2.5 rounded-xl hover:bg-red-700 inline-flex items-center gap-2"
            >
              🗑️ Clear All Scores
            </button>
          )}
        </div>

        {isLocked && (
          <p className="text-[11px] text-rose-700 font-bold mt-3">
            ⚠ This broadsheet is locked. Teachers cannot add or edit scores
            until you unlock.
          </p>
        )}
      </div>

      {selectedClass && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-[#0A1E3D]">
              {classById[selectedClass]} · {selectedTerm} Broadsheet
            </h3>
            <p className="text-[11px] text-gray-600 mt-0.5">
              {rows.length} students · Class Average {classAverage}%
            </p>
          </div>
          {rows.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-500 italic">
              No students or scores yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#0A1E3D] text-white">
                  <tr>
                    <th className="p-2 w-12 text-white"></th>
                    <th className="p-3 sticky left-12 bg-[#0A1E3D] text-white">
                      Name
                    </th>
                    <th className="p-3 text-center text-white">Age</th>
                    <th className="p-3 text-center text-white">Pos.</th>
                    {classSubjectIds.map((sid) => (
                      <th
                        key={sid}
                        className="p-3 text-center border-l border-amber-800/50 text-white"
                      >
                        {subjectById[sid]}
                        <br />
                        <span className="text-[10px] opacity-90">(100)</span>
                      </th>
                    ))}
                    <th className="p-3 text-center border-l border-amber-800 text-white">
                      Total
                    </th>
                    <th className="p-3 text-center border-l border-amber-800 text-white">
                      Avg (%)
                    </th>
                    <th className="p-3 text-center border-l border-amber-800 text-white">
                      Grade
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 bg-white">
                  {rows.map((r) => {
                    const { grade, tone } = gradeFromTotal(r.percentage)
                    return (
                      <tr key={r.id} className="hover:bg-amber-50/40">
                        <td className="p-2 bg-white">
                          {r.passport ? (
                            <img
                              src={r.passport}
                              alt={r.name}
                              className="w-8 h-10 object-cover rounded ring-1 ring-slate-200"
                            />
                          ) : (
                            <div className="w-8 h-10 rounded bg-slate-100 ring-1 ring-slate-200" />
                          )}
                        </td>
                        <td className="p-3 font-bold text-[#0A1E3D] bg-white">
                          {r.name}
                          <div className="text-[10px] text-gray-600 font-mono font-normal">
                            {r.admissionNo}
                          </div>
                        </td>
                        <td className="p-3 text-center text-[#1A2332] bg-white">
                          {r.age ?? '—'}
                        </td>
                        <td className="p-3 text-center font-black text-[#0A1E3D] bg-white">
                          {ordinal(r.rank)}
                        </td>
                        {classSubjectIds.map((sid) => {
                          const s = r.subjects[sid]
                          if (!s)
                            return (
                              <td
                                key={sid}
                                className="p-3 text-center bg-gray-50 text-gray-400"
                              >
                                –
                              </td>
                            )
                          const subG = gradeFromTotal(s.total)
                          return (
                            <td
                              key={sid}
                              className="p-3 text-center border-l border-amber-100 bg-white"
                            >
                              <div
                                className={
                                  s.total < 40
                                    ? 'text-red-700 font-bold'
                                    : 'text-[#1A2332] font-semibold'
                                }
                              >
                                {s.total}
                              </div>
                              <div className={`text-[10px] ${subG.tone}`}>
                                {subG.grade}
                              </div>
                            </td>
                          )
                        })}
                        <td className="p-3 text-center font-black text-amber-700 bg-white">
                          {r.total}
                        </td>
                        <td className="p-3 text-center font-bold text-emerald-700 bg-white">
                          {r.percentage.toFixed(2)}
                        </td>
                        <td
                          className={`p-3 text-center font-black bg-white ${tone}`}
                        >
                          {grade}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   TAB: NEWS & ANNOUNCEMENTS
   ============================================================================ */

function NewsTab({
  announcements,
  classes,
  refresh,
  showToast,
  logAction,
  askConfirm,
}: {
  announcements: Announcement[]
  classes: ClassRow[]
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    title: '',
    body: '',
    audience: 'all' as 'all' | 'students' | 'teachers' | 'class',
    class_id: '',
    pinned: false,
    expires_at: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const classById = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.id, c.name])),
    [classes]
  )

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') {
      showToast('Only PDF files are allowed.', 'error')
      e.target.value = ''
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      showToast('File too large. Max 5 MB.', 'error')
      e.target.value = ''
      return
    }
    setFile(f)
  }

  async function submitAnnouncement(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      showToast('Title is required.', 'error')
      return
    }
    if (!form.body.trim()) {
      showToast('Body is required.', 'error')
      return
    }
    if (form.audience === 'class' && !form.class_id) {
      showToast('Please choose a class.', 'error')
      return
    }

    setSaving(true)
    let attachment_url: string | null = null
    let attachment_name: string | null = null

    if (file) {
      const ts = Date.now()
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
      const path = `${ts}_${safeName}`
      const { error: upErr } = await supabase.storage
        .from('announcements')
        .upload(path, file, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (upErr) {
        showToast(`Upload failed: ${upErr.message}`, 'error')
        setSaving(false)
        return
      }

      const { data: urlData } = supabase.storage
        .from('announcements')
        .getPublicUrl(path)
      attachment_url = urlData.publicUrl
      attachment_name = file.name
    }

    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      class_id: form.audience === 'class' ? form.class_id : null,
      attachment_url,
      attachment_name,
      pinned: form.pinned,
      expires_at: form.expires_at
        ? new Date(form.expires_at).toISOString()
        : null,
    }

    const { error } = await supabase.from('announcements').insert([payload])
    setSaving(false)

    if (error) {
      showToast(`Save failed: ${error.message}`, 'error')
      return
    }

    showToast('Announcement published.')
    logAction('Announcement published', `${form.title} · ${form.audience}`)
    setForm({
      title: '',
      body: '',
      audience: 'all',
      class_id: '',
      pinned: false,
      expires_at: '',
    })
    setFile(null)
    setShowForm(false)
    refresh()
  }

  function deleteAnnouncement(a: Announcement) {
    askConfirm(
      'Delete Announcement?',
      `Remove "${a.title}"? Students will no longer see it.`,
      async () => {
        if (a.attachment_url) {
          const path = a.attachment_url.split('/').pop()
          if (path) {
            await supabase.storage.from('announcements').remove([path])
          }
        }
        const { error } = await supabase
          .from('announcements')
          .delete()
          .eq('id', a.id)
        if (error) {
          showToast(`Delete failed: ${error.message}`, 'error')
          return
        }
        showToast('Announcement removed.', 'warn')
        logAction('Announcement deleted', a.title)
        refresh()
      }
    )
  }

  async function togglePin(a: Announcement) {
    const { error } = await supabase
      .from('announcements')
      .update({ pinned: !a.pinned })
      .eq('id', a.id)
    if (error) {
      showToast(`Update failed: ${error.message}`, 'error')
      return
    }
    showToast(a.pinned ? 'Unpinned.' : 'Pinned to top.', 'info')
    refresh()
  }

  const AUDIENCE_LABEL: Record<Announcement['audience'], string> = {
    all: 'Everyone',
    students: 'All Students',
    teachers: 'All Teachers',
    class: 'Specific Class',
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[#0A1E3D]">
              News &amp; Announcements
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Post news to students and teachers. Attach a PDF (school calendar,
              newsletter, etc.).
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs font-bold bg-amber-500 text-white px-4 py-2.5 rounded-xl hover:bg-amber-600"
          >
            {showForm ? 'Close' : '+ New Announcement'}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={submitAnnouncement}
            className="p-5 bg-slate-50 border-b border-slate-100 space-y-4"
          >
            <FormField label="Title" required>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Mid-Term Break Announcement"
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
            </FormField>

            <FormField label="Message" required>
              <textarea
                required
                rows={4}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Write your announcement here…"
                className="w-full text-sm p-3 bg-white border border-amber-200 rounded-xl outline-none resize-none text-[#1A2332]"
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Send To" required>
                <select
                  value={form.audience}
                  onChange={(e) =>
                    setForm({ ...form, audience: e.target.value as any })
                  }
                  className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                >
                  <option value="all">Everyone</option>
                  <option value="students">All Students</option>
                  <option value="teachers">All Teachers</option>
                  <option value="class">Specific Class</option>
                </select>
              </FormField>

              {form.audience === 'class' && (
                <FormField label="Class" required>
                  <select
                    required
                    value={form.class_id}
                    onChange={(e) =>
                      setForm({ ...form, class_id: e.target.value })
                    }
                    className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                  >
                    <option value="">-- Choose Class --</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Attach PDF (optional)">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#0A1E3D] file:text-white hover:file:bg-black bg-white border border-amber-200 rounded-xl p-1"
                />
                {file && (
                  <p className="text-[11px] text-gray-600 mt-1">
                    Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </p>
                )}
              </FormField>

              <FormField label="Expires (optional)">
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) =>
                    setForm({ ...form, expires_at: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Leave blank to keep forever
                </p>
              </FormField>
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) =>
                  setForm({ ...form, pinned: e.target.checked })
                }
                className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm font-medium text-[#1A2332]">
                📌 Pin to top (important)
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setFile(null)
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
              >
                {saving ? 'Publishing…' : 'Publish Announcement'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="font-semibold text-[#0A1E3D]">
            Published Announcements
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {announcements.length} total
          </p>
        </div>

        {announcements.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-500 italic">
            No announcements yet. Click "+ New Announcement" to publish one.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {announcements.map((a) => (
              <li key={a.id} className="p-5 hover:bg-amber-50/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {a.pinned && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                          📌 Pinned
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 uppercase ${
                          a.audience === 'all'
                            ? 'bg-slate-100 text-gray-700 ring-slate-200'
                            : a.audience === 'students'
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : a.audience === 'teachers'
                            ? 'bg-blue-50 text-blue-700 ring-blue-200'
                            : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        }`}
                      >
                        {a.audience === 'class'
                          ? classById[a.class_id || ''] || 'Class'
                          : AUDIENCE_LABEL[a.audience]}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#0A1E3D]">
                      {a.title}
                    </h3>
                    <p className="text-xs text-[#1A2332] mt-1 whitespace-pre-wrap">
                      {a.body}
                    </p>

                    {a.attachment_url && (
                      <a
                        href={a.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-amber-700 hover:text-amber-800 underline"
                      >
                        📎 {a.attachment_name || 'Attachment'}
                      </a>
                    )}

                    <p className="text-[10px] text-gray-500 mt-2">
                      Published {new Date(a.published_at).toLocaleString()}
                      {a.expires_at &&
                        ` · Expires ${new Date(a.expires_at).toLocaleString()}`}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={() => togglePin(a)}
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-900"
                    >
                      {a.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      onClick={() => deleteAnnouncement(a)}
                      className="text-[11px] font-bold text-red-700 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
   TAB: AUDIT
   ============================================================================ */

function AuditTab({
  audit,
  setAudit,
  showToast,
  askConfirm,
}: {
  audit: AuditEntry[]
  setAudit: React.Dispatch<React.SetStateAction<AuditEntry[]>>
  showToast: (m: string, t?: Toast['tone']) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-[#0A1E3D]">Audit Log</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Session actions (not persisted across reloads).
          </p>
        </div>
        <button
          onClick={() =>
            askConfirm('Clear Log?', 'Clear the session audit log?', () => {
              setAudit([])
              showToast('Cleared.', 'warn')
            })
          }
          className="text-xs font-semibold text-gray-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50"
        >
          Clear
        </button>
      </div>
      <ol className="p-5 space-y-3 max-h-[600px] overflow-y-auto">
        {audit.length === 0 && (
          <li className="text-center py-10 text-xs text-gray-500 italic">
            No actions in this session.
          </li>
        )}
        {audit.map((a, i) => (
          <li
            key={i}
            className="flex items-start gap-3 p-3 rounded-xl ring-1 ring-slate-200 bg-white"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Icon name="clock" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#0A1E3D]">{a.action}</p>
              {a.detail && (
                <p className="text-[11px] text-gray-600">{a.detail}</p>
              )}
              <p className="text-[10px] text-gray-500 mt-1">
                {new Date(a.ts).toLocaleString()}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ============================================================================
   TAB: SUBSCRIPTION
   ============================================================================ */

function SubscriptionTab({
  school,
  plans,
  payments,
  paymentAccount,
  status,
  refresh,
  showToast,
  logAction,
}: {
  school: SchoolRow | null
  plans: SubscriptionPlan[]
  payments: SubscriptionPayment[]
  paymentAccount: PaymentAccount | null
  status: PortalLockStatus
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
}) {
  const [showSubmit, setShowSubmit] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [bankRef, setBankRef] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const pendingPayments = useMemo(
    () => payments.filter((p) => p.status === 'pending'),
    [payments]
  )

  function planById(id: string): SubscriptionPlan | null {
    return plans.find((p) => p.id === id) || null
  }

  // Auto-fill amount when plan selected
  useEffect(() => {
    if (selectedPlanId) {
      const p = planById(selectedPlanId)
      if (p) setAmount(String(p.amount))
    }
  }, [selectedPlanId])

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!school) {
      showToast('School record not found.', 'error')
      return
    }
    if (!selectedPlanId) {
      showToast('Pick a plan.', 'error')
      return
    }
    if (!amount || Number(amount) <= 0) {
      showToast('Enter a valid amount.', 'error')
      return
    }
    if (!file) {
      showToast('Attach proof of payment.', 'error')
      return
    }

    setSubmitting(true)

    const { url, error: upErr } = await uploadPaymentProof(file, school.slug)
    if (upErr || !url) {
      showToast(`Upload failed: ${upErr}`, 'error')
      setSubmitting(false)
      return
    }

    const { error } = await supabase.from('subscription_payments').insert([
      {
        school_id: school.id,
        plan_id: selectedPlanId,
        amount: Number(amount),
        bank_reference: bankRef.trim() || null,
        proof_url: url,
        proof_name: file.name,
        submitted_by: 'Master Admin',
        status: 'pending',
      },
    ])

    setSubmitting(false)

    if (error) {
      showToast(`Submit failed: ${error.message}`, 'error')
      return
    }

    showToast('Payment proof submitted. Awaiting vendor approval.')
    logAction('Payment proof submitted', `₦${amount} · plan: ${planById(selectedPlanId)?.name}`)
    setShowSubmit(false)
    setSelectedPlanId('')
    setAmount('')
    setBankRef('')
    setFile(null)
    refresh()
  }

  // Status hero
  const heroTone = useMemo(() => {
    switch (status.status) {
      case 'active':
        return {
          bg: 'bg-emerald-50',
          ring: 'ring-emerald-200',
          text: 'text-emerald-800',
          label: 'ACTIVE',
        }
      case 'expiring_soon':
        return {
          bg: 'bg-amber-50',
          ring: 'ring-amber-200',
          text: 'text-amber-800',
          label: 'EXPIRING SOON',
        }
      case 'in_grace':
        return {
          bg: 'bg-orange-50',
          ring: 'ring-orange-200',
          text: 'text-orange-800',
          label: 'IN GRACE PERIOD',
        }
      case 'expired':
        return {
          bg: 'bg-red-50',
          ring: 'ring-red-200',
          text: 'text-red-800',
          label: 'EXPIRED',
        }
      case 'locked':
        return {
          bg: 'bg-red-50',
          ring: 'ring-red-200',
          text: 'text-red-800',
          label: 'LOCKED',
        }
      default:
        return {
          bg: 'bg-slate-50',
          ring: 'ring-slate-200',
          text: 'text-slate-800',
          label: 'NO SUBSCRIPTION',
        }
    }
  }, [status.status])

  return (
    <div className="space-y-5">
      {/* Hero card */}
      <div
        className={`rounded-2xl p-6 ring-1 ${heroTone.bg} ${heroTone.ring}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
              Subscription Status
            </p>
            <h2
              className={`text-2xl font-black mt-1 ${heroTone.text}`}
            >
              {heroTone.label}
            </h2>
            <div className="mt-3 space-y-1 text-xs text-gray-700">
              <p>
                <span className="font-semibold">Plan:</span>{' '}
                {school?.subscription_plan || '—'}
              </p>
              <p>
                <span className="font-semibold">Start:</span>{' '}
                {formatDateHuman(school?.subscription_start_date)}
              </p>
              <p>
                <span className="font-semibold">Expires:</span>{' '}
                {formatDateHuman(school?.subscription_end_date)}
              </p>
              <p>
                <span className="font-semibold">Grace days:</span>{' '}
                {school?.grace_days ?? 0}
              </p>
              {status.status === 'active' && (
                <p className="text-emerald-700 font-semibold mt-2">
                  {status.daysLeft} day{status.daysLeft === 1 ? '' : 's'} remaining
                </p>
              )}
              {status.status === 'expiring_soon' && (
                <p className="text-amber-700 font-semibold mt-2">
                  ⚠️ Expires in {status.daysLeft} day{status.daysLeft === 1 ? '' : 's'}
                </p>
              )}
              {status.status === 'in_grace' && (
                <p className="text-orange-700 font-semibold mt-2">
                  🚨 {status.graceLeft} grace day{status.graceLeft === 1 ? '' : 's'} left
                </p>
              )}
              {status.status === 'locked' && (
                <p className="text-red-700 font-semibold mt-2">
                  🔒 {status.reason}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowSubmit(true)}
            className="text-xs font-bold bg-[#0A1E3D] text-white px-5 py-3 rounded-xl hover:bg-black shrink-0"
          >
            + Submit Payment Proof
          </button>
        </div>
      </div>

      {/* Pending banner */}
      {pendingPayments.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <p className="text-sm font-bold text-blue-800">
            ⏳ {pendingPayments.length} payment
            {pendingPayments.length === 1 ? '' : 's'} awaiting vendor approval
          </p>
          <p className="text-xs text-blue-700 mt-1">
            Your submission is under review. The vendor will approve it and extend
            your subscription shortly.
          </p>
        </div>
      )}

      {/* Submit form modal */}
      {showSubmit && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[#0A1E3D] text-base">
                  Submit Payment Proof
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Upload a receipt or bank transfer screenshot. The vendor will
                  review and approve.
                </p>
              </div>
              <button
                onClick={() => setShowSubmit(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitPayment} className="p-6 space-y-4">
              <FormField label="Plan" required>
                <select
                  required
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                >
                  <option value="">-- Choose Plan --</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatMoney(p.amount)} · {p.duration_days} days
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Amount Paid" required>
                <input
                  type="number"
                  min={1}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                />
              </FormField>

              <FormField label="Bank Reference / Teller No.">
                <input
                  value={bankRef}
                  onChange={(e) => setBankRef(e.target.value)}
                  placeholder="e.g. TRF/2026/0481"
                  className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
                />
              </FormField>

              <FormField label="Proof of Payment" required>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#0A1E3D] file:text-white hover:file:bg-black bg-white border border-amber-200 rounded-xl p-1"
                />
                {file && (
                  <p className="text-[11px] text-gray-600 mt-1">
                    {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </p>
                )}
                <p className="text-[10px] text-gray-500 mt-1">
                  JPG, PNG, WEBP, or PDF · Max {PAYMENT_PROOF_MAX_MB} MB
                </p>
              </FormField>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSubmit(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit Proof'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bank details + plans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-[#0A1E3D]">Bank Transfer Details</h3>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Transfer to this account, then submit proof above.
            </p>
          </div>
          <div className="p-5 space-y-3 text-sm">
            <ReadOnly label="Bank" value={paymentAccount?.bank_name || '—'} />
            <ReadOnly
              label="Account Name"
              value={paymentAccount?.account_name || '—'}
            />
            <ReadOnly
              label="Account Number"
              value={paymentAccount?.account_number || '—'}
            />
            {paymentAccount?.vendor_email && (
              <ReadOnly label="Vendor Email" value={paymentAccount.vendor_email} />
            )}
            {paymentAccount?.vendor_whatsapp && (
              <ReadOnly
                label="Vendor WhatsApp"
                value={paymentAccount.vendor_whatsapp}
              />
            )}
            {(paymentAccount?.bank_name?.toLowerCase().includes('edit') ||
              !paymentAccount?.bank_name) && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                ⚠️ Bank details not configured yet. The vendor (Moraks Tech) will
                update these shortly. Contact them directly for payment
                instructions.
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-[#0A1E3D]">Available Plans</h3>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Pick a plan when submitting a payment.
            </p>
          </div>
          <div className="p-5 space-y-2">
            {plans.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 ring-1 ring-slate-200"
              >
                <div>
                  <p className="text-sm font-bold text-[#0A1E3D]">{p.name}</p>
                  <p className="text-[11px] text-gray-600">
                    {p.duration_days} days
                  </p>
                </div>
                <p className="text-sm font-bold text-amber-700">
                  {formatMoney(p.amount)}
                </p>
              </div>
            ))}
            {plans.length === 0 && (
              <p className="text-xs text-gray-500 italic text-center py-6">
                No plans configured yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Payment history */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-[#0A1E3D]">Payment History</h3>
          <p className="text-[11px] text-gray-600 mt-0.5">
            All submitted payments and their approval status.
          </p>
        </div>
        {payments.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-500 italic">
            No payments submitted yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0A1E3D] text-white text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-white">Date</th>
                  <th className="px-5 py-3 text-white">Plan</th>
                  <th className="px-5 py-3 text-right text-white">Amount</th>
                  <th className="px-5 py-3 text-white">Reference</th>
                  <th className="px-5 py-3 text-center text-white">Status</th>
                  <th className="px-5 py-3 text-center text-white">Proof</th>
                  <th className="px-5 py-3 text-white">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {payments.map((p) => {
                  const plan = planById(p.plan_id || '')
                  return (
                    <tr key={p.id} className="hover:bg-amber-50/40">
                      <td className="px-5 py-3 text-[#1A2332] bg-white">
                        {p.submitted_at
                          ? new Date(p.submitted_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-5 py-3 font-bold text-[#0A1E3D] bg-white">
                        {plan?.name || '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-amber-700 bg-white">
                        {formatMoney(p.amount)}
                      </td>
                      <td className="px-5 py-3 text-gray-700 font-mono bg-white">
                        {p.bank_reference || '—'}
                      </td>
                      <td className="px-5 py-3 text-center bg-white">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 uppercase ${
                            p.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                              : p.status === 'rejected'
                              ? 'bg-red-50 text-red-700 ring-red-200'
                              : 'bg-amber-50 text-amber-700 ring-amber-200'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center bg-white">
                        {p.proof_url ? (
                          <a
                            href={p.proof_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-700 hover:text-amber-900 font-bold inline-flex items-center gap-1"
                          >
                            <Icon name="external" /> View
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3 text-[#1A2332] bg-white max-w-xs truncate">
                        {p.notes || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
   TAB: SETTINGS — School Identity + Logo Upload + Term Calendar + Grade Scale
   ============================================================================ */

function SettingsTab({
  school,
  sessions,
  termCalendars,
  currentSession,
  schoolLogo,
  refresh,
  showToast,
  logAction,
  askConfirm,
}: {
  school: SchoolRow | null
  sessions: SessionRow[]
  termCalendars: TermCalendar[]
  currentSession: SessionRow | null
  schoolLogo: string
  refresh: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  logAction: (a: string, d?: string) => void
  askConfirm: (t: string, m: string, cb: () => void) => void
}) {
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [editTermTarget, setEditTermTarget] = useState<TermCalendar | null>(null)
  const [addSessionOpen, setAddSessionOpen] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')

  const [selectedSessionId, setSelectedSessionId] = useState<string>('')

  useEffect(() => {
    if (currentSession) setSelectedSessionId(currentSession.id)
    else if (sessions.length > 0) setSelectedSessionId(sessions[0].id)
  }, [currentSession, sessions])

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  )

  const termsForSession = useMemo(
    () =>
      TERMS.map((term) => {
        return (
          termCalendars.find(
            (t) =>
              t.session_id === selectedSessionId && t.term === term
          ) || null
        )
      }),
    [termCalendars, selectedSessionId]
  )

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setUploadingLogo(true)
    const { url, error } = await uploadSchoolLogo(f)
    setUploadingLogo(false)
    if (error || !url) {
      showToast(`Upload failed: ${error}`, 'error')
      return
    }
    const { error: dbErr } = await supabase
      .from('settings')
      .upsert({ key: 'school_logo', value: url }, { onConflict: 'key' })
    if (dbErr) {
      showToast(`Saved file but couldn't update setting: ${dbErr.message}`, 'warn')
      return
    }
    showToast('Logo updated.')
    logAction('Logo updated', url)
    refresh()
  }

  async function addSession(e: React.FormEvent) {
    e.preventDefault()
    const name = newSessionName.trim()
    if (!name) return
    if (!/^\d{4}\/\d{4}$/.test(name)) {
      showToast('Format: YYYY/YYYY (e.g. 2026/2027)', 'error')
      return
    }
    const { error } = await supabase.from('sessions').insert([{ name }])
    if (error) {
      if (error.code === '23505')
        showToast('Session already exists.', 'warn')
      else showToast(`Save failed: ${error.message}`, 'error')
      return
    }
    showToast(`Session ${name} added.`)
    logAction('Session added', name)
    setNewSessionName('')
    setAddSessionOpen(false)
    refresh()
  }

  async function setCurrentSession(s: SessionRow) {
    askConfirm(
      'Set Current Session?',
      `Mark ${s.name} as the active session? This affects exam defaults and headers across the app.`,
      async () => {
        // Clear all first
        await supabase.from('sessions').update({ is_current: false }).neq('id', s.id)
        const { error } = await supabase
          .from('sessions')
          .update({ is_current: true })
          .eq('id', s.id)
        if (error) {
          showToast(`Update failed: ${error.message}`, 'error')
          return
        }
        showToast(`${s.name} is now the current session.`)
        logAction('Session set current', s.name)
        refresh()
      }
    )
  }

  async function deleteSession(s: SessionRow) {
    askConfirm(
      'Delete Session?',
      `Remove ${s.name}? Term calendar entries for this session will also be deleted.`,
      async () => {
        const { error } = await supabase.from('sessions').delete().eq('id', s.id)
        if (error) {
          showToast(`Delete failed: ${error.message}`, 'error')
          return
        }
        showToast('Session deleted.', 'warn')
        logAction('Session deleted', s.name)
        refresh()
      }
    )
  }

  async function saveTerm(term: TermCalendar, patch: Partial<TermCalendar>) {
    if (term.id) {
      const { error } = await supabase
        .from('term_calendars')
        .update(patch)
        .eq('id', term.id)
      if (error) {
        showToast(`Save failed: ${error.message}`, 'error')
        return false
      }
    } else {
      // Create new row for this session+term
      const { error } = await supabase.from('term_calendars').insert([
        {
          session_id: term.session_id,
          term: term.term,
          ...patch,
        },
      ])
      if (error) {
        showToast(`Save failed: ${error.message}`, 'error')
        return false
      }
    }
    showToast('Term saved.')
    logAction('Term updated', `${selectedSession?.name} · ${term.term}`)
    refresh()
    return true
  }

  async function setCurrentTerm(term: TermCalendar) {
    if (!term.id) {
      showToast('Save the term first before setting it current.', 'warn')
      return
    }
    askConfirm(
      'Set Current Term?',
      `Mark ${term.term} (${selectedSession?.name}) as the active term?`,
      async () => {
        await supabase.from('term_calendars').update({ is_current: false }).neq('id', term.id)
        const { error } = await supabase
          .from('term_calendars')
          .update({ is_current: true })
          .eq('id', term.id)
        if (error) {
          showToast(`Update failed: ${error.message}`, 'error')
          return
        }
        showToast(`${term.term} is now current.`)
        logAction('Term set current', `${selectedSession?.name} · ${term.term}`)
        refresh()
      }
    )
  }

  return (
    <div className="space-y-5">
      {/* School Identity + Logo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="font-semibold text-[#0A1E3D]">School Identity</h2>
            <p className="text-xs text-gray-500 mt-0.5">Read-only info + editable logo.</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 flex items-center gap-5 p-4 rounded-xl bg-slate-50 ring-1 ring-slate-200">
              <div className="w-20 h-20 rounded-xl bg-white ring-1 ring-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={schoolLogo}
                  alt="Logo"
                  className="w-full h-full object-contain p-2"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src = SCHOOL.logo
                  }}
                />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-[#0A1E3D] mb-1">
                  School Logo
                </p>
                <label className="inline-flex items-center gap-2 text-xs font-bold bg-[#0A1E3D] text-white px-4 py-2 rounded-lg hover:bg-black cursor-pointer">
                  {uploadingLogo ? 'Uploading…' : 'Upload New Logo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    className="hidden"
                  />
                </label>
                <p className="text-[10px] text-gray-500 mt-1">
                  PNG or JPG · Max 2 MB
                </p>
              </div>
            </div>

            <ReadOnly label="School Name" value={school?.name || SCHOOL.name} />
            <ReadOnly label="Motto" value={SCHOOL.motto} />
            <div className="sm:col-span-2">
              <ReadOnly label="Address" value={SCHOOL.address} />
            </div>
            <ReadOnly label="Email" value={SCHOOL.email} />
            <ReadOnly label="Phones" value={SCHOOL.phones.join(', ')} />
            <ReadOnly
              label="Current Plan"
              value={school?.subscription_plan || '—'}
            />
            <ReadOnly label="Version" value={`v${SCHOOL.version}`} />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="font-semibold text-[#0A1E3D]">Grade Scale</h2>
          </div>
          <div className="p-5 grid grid-cols-2 gap-2 text-[11px]">
            {GRADE_SCALE.map((g) => (
              <div
                key={g.g}
                className="flex justify-between p-2.5 rounded-lg bg-slate-50 ring-1 ring-slate-200"
              >
                <span className="font-semibold text-[#0A1E3D]">{g.g}</span>
                <span className="text-gray-700">{g.min}+</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Term Calendar */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[#0A1E3D] flex items-center gap-2">
              <Icon name="calendar" /> Term Calendar
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage sessions and term dates. Mark one term as current to drive
              exam and broadsheet defaults.
            </p>
          </div>
          <button
            onClick={() => setAddSessionOpen(true)}
            className="text-xs font-bold bg-amber-500 text-white px-4 py-2.5 rounded-xl hover:bg-amber-600 inline-flex items-center gap-2"
          >
            <Icon name="plus" /> New Session
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Session picker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
                Session
              </label>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              >
                {sessions.length === 0 && <option value="">No sessions</option>}
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_current ? ' · CURRENT' : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedSession && (
              <div className="flex items-end gap-2">
                {!selectedSession.is_current && (
                  <button
                    onClick={() => setCurrentSession(selectedSession)}
                    className="flex-1 text-xs font-bold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-3 py-2.5 rounded-xl hover:bg-emerald-100"
                  >
                    Set as Current
                  </button>
                )}
                {selectedSession.is_current && (
                  <span className="flex-1 text-xs font-bold bg-emerald-500 text-white px-3 py-2.5 rounded-xl text-center">
                    ✓ Current Session
                  </span>
                )}
                <button
                  onClick={() => deleteSession(selectedSession)}
                  className="text-xs font-bold bg-red-50 text-red-700 ring-1 ring-red-200 px-3 py-2.5 rounded-xl hover:bg-red-100"
                >
                  <Icon name="trash" />
                </button>
              </div>
            )}
          </div>

          {/* Term cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TERMS.map((term, idx) => {
              const existing = termsForSession[idx]
              const t: TermCalendar = existing || {
                id: '',
                session_id: selectedSessionId,
                term,
                start_date: null,
                end_date: null,
                next_term_begins: null,
                days_opened: null,
                is_current: false,
                created_at: '',
              }
              const isCurrent = t.is_current
              return (
                <div
                  key={term}
                  className={`rounded-2xl p-5 ring-1 transition ${
                    isCurrent
                      ? 'bg-emerald-50 ring-emerald-300'
                      : 'bg-white ring-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-[#0A1E3D]">{term}</p>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                        CURRENT
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-xs text-gray-700">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Start:</span>
                      <span className="font-semibold">
                        {formatDateHuman(t.start_date)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">End:</span>
                      <span className="font-semibold">
                        {formatDateHuman(t.end_date)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Next term begins:</span>
                      <span className="font-semibold">
                        {formatDateHuman(t.next_term_begins)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Days opened:</span>
                      <span className="font-semibold">
                        {t.days_opened ?? '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setEditTermTarget(t)}
                      className="flex-1 text-[11px] font-bold bg-slate-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-slate-200"
                    >
                      <Icon name="edit" /> Edit
                    </button>
                    {!isCurrent && existing && (
                      <button
                        onClick={() => setCurrentTerm(t)}
                        className="flex-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-3 py-2 rounded-lg hover:bg-emerald-100"
                      >
                        Set Current
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Edit Term Modal */}
      {editTermTarget && (
        <EditTermModal
          term={editTermTarget}
          sessionName={selectedSession?.name || ''}
          onClose={() => setEditTermTarget(null)}
          onSave={saveTerm}
        />
      )}

      {/* Add Session Modal */}
      {addSessionOpen && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-[#0A1E3D] text-base">New Session</h3>
              <button
                onClick={() => setAddSessionOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-gray-600"
              >
                ✕
              </button>
            </div>
            <form onSubmit={addSession} className="p-6 space-y-4">
              <FormField label="Session Name" required>
                <input
                  required
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="2026/2027"
                  className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl font-mono outline-none text-[#1A2332]"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Format: YYYY/YYYY
                </p>
              </FormField>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddSessionOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600"
                >
                  Add Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   EDIT TERM MODAL
   ============================================================================ */

function EditTermModal({
  term,
  sessionName,
  onClose,
  onSave,
}: {
  term: TermCalendar
  sessionName: string
  onClose: () => void
  onSave: (t: TermCalendar, patch: Partial<TermCalendar>) => Promise<boolean>
}) {
  const [draft, setDraft] = useState({
    start_date: term.start_date || '',
    end_date: term.end_date || '',
    next_term_begins: term.next_term_begins || '',
    days_opened: term.days_opened?.toString() || '',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const ok = await onSave(term, {
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
      next_term_begins: draft.next_term_begins || null,
      days_opened: draft.days_opened ? Number(draft.days_opened) : null,
    })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full my-8">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[#0A1E3D] text-base">
              Edit {term.term}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {sessionName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-gray-600"
          >
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start Date">
              <input
                type="date"
                value={draft.start_date}
                onChange={(e) =>
                  setDraft({ ...draft, start_date: e.target.value })
                }
                className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
            </FormField>
            <FormField label="End Date">
              <input
                type="date"
                value={draft.end_date}
                onChange={(e) =>
                  setDraft({ ...draft, end_date: e.target.value })
                }
                className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
              />
            </FormField>
          </div>
          <FormField label="Next Term Begins">
            <input
              type="date"
              value={draft.next_term_begins}
              onChange={(e) =>
                setDraft({ ...draft, next_term_begins: e.target.value })
              }
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>
          <FormField label="Days School Opened">
            <input
              type="number"
              min={0}
              value={draft.days_opened}
              onChange={(e) =>
                setDraft({ ...draft, days_opened: e.target.value })
              }
              placeholder="e.g. 62"
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none text-[#1A2332]"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Term'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ============================================================================
   SHARED UI
   ============================================================================ */

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
        {label}
      </p>
      <p className="text-sm text-[#1A2332] font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
        {value}
      </p>
    </div>
  )
}

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
        {label} {required && <span className="text-amber-600">*</span>}
      </label>
      {children}
    </div>
  )
}

/* ============================================================================
   END OF FILE
   ============================================================================ */