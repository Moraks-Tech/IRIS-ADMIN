'use client'

/* ============================================================================
   IBADU RAHMAN INTERNATIONAL SCHOOL — STUDENT PORTAL
   Tabs: My Report Card · My Exams · News
   CBT Engine with anti-cheat: auto-save, resume, tab-switch counter, timer
   Header: school banner + passport-ratio student photo
   ============================================================================ */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/* ============================================================================
   TYPES
   ============================================================================ */

type Student = {
  id: string
  admission_number: string
  full_name: string
  class_id: string | null
  gender: 'Male' | 'Female' | null
  date_of_birth: string | null
  passport_url: string | null
}

type ClassRow = { id: string; name: string }
type SubjectRow = { id: string; name: string }

type ScoreRow = {
  id: string
  student_id: string
  subject_id: string
  test_score: number | null
  exam_score: number | null
  total_score: number
  term: string
  session: string
}

type AttendanceRow = {
  id: string
  student_id: string
  date: string
  status: 'Present' | 'Absent' | 'Late'
}

type BehaviouralRow = {
  id: string
  student_id: string
  term: string
  session: string
  affective: Record<string, number>
  psychomotor: Record<string, number>
  teacher_comment: string | null
}

type ReportCardPub = {
  id: string
  class_id: string
  term: string
  session: string
  published_at: string
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
}

type CbtQuestion = {
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

type Toast = { id: number; msg: string; tone: 'success' | 'error' | 'info' | 'warn' }

/* ============================================================================
   CONSTANTS
   ============================================================================ */

const AFFECTIVE_TRAITS = [
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'neatness', label: 'Neatness' },
  { key: 'politeness', label: 'Politeness' },
  { key: 'honesty', label: 'Honesty' },
  { key: 'cooperation', label: 'Cooperation with Others' },
  { key: 'attentiveness', label: 'Attentiveness' },
  { key: 'obedience', label: 'Obedience' },
  { key: 'self_control', label: 'Self Control' },
  { key: 'leadership', label: 'Leadership' },
  { key: 'attitude_to_work', label: 'Attitude to Work' },
]

const PSYCHOMOTOR_SKILLS = [
  { key: 'handwriting', label: 'Handwriting' },
  { key: 'verbal_fluency', label: 'Verbal Fluency' },
  { key: 'sports_games', label: 'Sports & Games' },
  { key: 'drawing_painting', label: 'Drawing & Painting' },
  { key: 'handling_tools', label: 'Handling Tools' },
  { key: 'musical_skills', label: 'Musical Skills' },
]

const RATING_LABELS: Record<number, string> = { 5: 'Excellent', 4: 'Very Good', 3: 'Good', 2: 'Fair', 1: 'Poor' }

const SCHOOL = {
  name: 'Ibadu Rahman International School',
  motto: 'Quest for Excellence',
  address: '57, Unity Street, Papa Ibafo, Ogun State',
  phones: ['09152625084'],
  email: 'morakstech02@gmail.com',
  website: '',
  logo: 'https://github.com/Moraks-Tech/Ibadurahmaninternationalschool/blob/main/logo.jpg?raw=true',
}

/* ============================================================================
   HELPERS
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

/** Deterministic shuffle using string seed (mulberry32-ish) */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function fmtTime(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function isWithinWindow(exam: CbtExam): boolean {
  const now = Date.now()
  if (exam.start_at && new Date(exam.start_at).getTime() > now) return false
  if (exam.end_at && new Date(exam.end_at).getTime() < now) return false
  return true
}

/* ============================================================================
   STUDENT AVATAR — supports circle, square, and passport-ratio
   ============================================================================ */

function StudentAvatar({
  student,
  size = 40,
  height,
  ring = 'ring-white/40',
  shape = 'circle',
}: {
  student: Pick<Student, 'full_name' | 'passport_url'>
  size?: number
  height?: number
  ring?: string
  shape?: 'circle' | 'square'
}) {
  const initials = student.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-lg'
  const w = size
  const h = height ?? size

  if (student.passport_url) {
    return (
      <img
        src={student.passport_url}
        alt={student.full_name}
        className={`${radius} object-cover bg-white shrink-0 ring-2 ${ring}`}
        style={{ width: w, height: h }}
        onError={(e) => {
          const img = e.currentTarget as HTMLImageElement
          img.style.display = 'none'
          const fallback = img.nextElementSibling as HTMLElement | null
          if (fallback) fallback.style.display = 'flex'
        }}
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement
          const fallback = img.nextElementSibling as HTMLElement | null
          if (fallback) fallback.style.display = 'none'
        }}
      />
    )
  }

  return (
    <div
      className={`${radius} bg-amber-500 text-white font-black flex items-center justify-center shrink-0 ring-2 ${ring}`}
      style={{ width: w, height: h, fontSize: Math.min(w, h) * 0.4 }}
    >
      {initials || '👤'}
    </div>
  )
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
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; }
            @page { size: A4 portrait; margin: 12mm; }
          }
        `,
      }}
    />
  )
}

/* ============================================================================
   MAIN
   ============================================================================ */

export default function StudentPortal() {
  const router = useRouter()
  const [student, setStudent] = useState<Student | null>(null)
  const [klass, setKlass] = useState<ClassRow | null>(null)
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [booting, setBooting] = useState(true)

  const [view, setView] = useState<'report' | 'exams' | 'exam-take' | 'news'>('report')
  const [activeExam, setActiveExam] = useState<CbtExam | null>(null)

  const [toasts, setToasts] = useState<Toast[]>([])
  const showToast = useCallback((msg: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('loggedInStudent')
    if (!stored) { router.push('/login'); return }
    let parsed: Student
    try {
      parsed = JSON.parse(stored)
    } catch {
      router.push('/login')
      return
    }
    setStudent(parsed)

    if (process.env.NODE_ENV !== 'production' && !parsed.passport_url) {
      console.warn(
        '[StudentPortal] passport_url missing from localStorage.loggedInStudent. ' +
        'Verify the login page selects passport_url from the students table.'
      )
    }

    ;(async () => {
      if (parsed.class_id) {
        const { data: c } = await supabase.from('classes').select('*').eq('id', parsed.class_id).maybeSingle()
        setKlass(c as ClassRow)
      }
      const { data: s } = await supabase.from('subjects').select('*').order('name')
      setSubjects((s || []) as SubjectRow[])
      setBooting(false)
    })()
  }, [router])

  function handleLogout() {
    localStorage.removeItem('loggedInStudent')
    router.push('/login')
  }

  if (booting) return null
  if (!student) return null

  if (view === 'exam-take' && activeExam) {
    return (
      <>
        <GlobalStyles />
        <ExamRunner
          exam={activeExam}
          student={student}
          onFinish={() => {
            setActiveExam(null)
            setView('exams')
          }}
          showToast={showToast}
          toasts={toasts}
        />
      </>
    )
  }

  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-slate-50 flex flex-col text-gray-800">
        {/* HEADER */}
        <header className="bg-[#0A1E3D] text-white shadow-md border-b-2 border-amber-500 sticky top-0 z-30 no-print">
          {/* Top bar — School logo + name */}
          <div className="border-b border-white/10">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={SCHOOL.logo}
                  alt={SCHOOL.name}
                  className="w-9 h-9 rounded-full bg-white p-0.5 object-contain shrink-0 ring-1 ring-amber-300/50"
                />
                <div className="min-w-0 leading-tight">
                  <p className="text-xs sm:text-sm font-black tracking-wide truncate">
                    {SCHOOL.name.toUpperCase()}
                  </p>
                  <p className="text-[10px] text-amber-300 italic truncate">
                    Motto: {SCHOOL.motto}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-red-500 shrink-0"
              >
                Log Out
              </button>
            </div>
          </div>

          {/* Bottom bar — Passport + student info */}
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
            <div className="relative shrink-0">
              <StudentAvatar
                student={student}
                size={60}
                height={76}
                shape="square"
                ring="ring-amber-400/60"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-[#0A1E3D]" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Welcome back</p>
              <h2 className="font-black text-base sm:text-lg truncate">{student.full_name}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 ring-1 ring-white/20">
                  {student.admission_number}
                </span>
                {klass?.name && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40">
                    {klass.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* TABS */}
        <div className="bg-white border-b border-slate-200 no-print">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="flex gap-1 overflow-x-auto">
              <TabBtn id="report" current={view} onClick={setView} label="📋 My Report Card" />
              <TabBtn id="exams" current={view} onClick={setView} label="🎯 My Exams" />
              <TabBtn id="news" current={view} onClick={setView} label="📢 News" />
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <main className="flex-1">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            {view === 'report' && (
              <ReportCardTab student={student} klass={klass} subjects={subjects} showToast={showToast} />
            )}
            {view === 'exams' && (
              <ExamsListTab
                student={student}
                subjects={subjects}
                showToast={showToast}
                onStart={(exam) => { setActiveExam(exam); setView('exam-take') }}
              />
            )}
            {view === 'news' && (
              <NewsTab student={student} showToast={showToast} />
            )}
          </div>
        </main>

        {/* TOASTS */}
        <div className="fixed bottom-6 right-6 z-[100] space-y-3 pointer-events-none no-print">
          {toasts.map((t) => (
            <div key={t.id} className={`pointer-events-auto px-4 py-3 rounded-xl shadow-2xl text-white text-xs font-semibold max-w-sm border-l-4 ${
              t.tone === 'success' ? 'bg-emerald-600 border-emerald-300' :
              t.tone === 'error' ? 'bg-red-600 border-red-300' :
              t.tone === 'warn' ? 'bg-amber-600 border-amber-300' :
              'bg-[#0A1E3D] border-amber-400'
            }`}>{t.msg}</div>
          ))}
        </div>

        <footer className="bg-[#061A33] text-white py-4 px-6 text-center text-[11px] border-t border-amber-500/30 no-print">
          {SCHOOL.name} · Student Portal · {new Date().getFullYear()}
        </footer>
      </div>
    </>
  )
}

function TabBtn({
  id, current, onClick, label,
}: {
  id: 'report' | 'exams' | 'exam-take' | 'news'
  current: string
  onClick: (v: 'report' | 'exams' | 'exam-take' | 'news') => void
  label: string
}) {
  const active = current === id
  return (
    <button
      onClick={() => onClick(id)}
      className={`whitespace-nowrap px-4 py-3.5 text-xs font-bold border-b-2 transition ${
        active ? 'border-amber-500 text-[#0A1E3D]' : 'border-transparent text-gray-500 hover:text-[#0A1E3D]'
      }`}
    >
      {label}
    </button>
  )
}

/* ============================================================================
   TAB: NEWS & ANNOUNCEMENTS
   ============================================================================ */

function NewsTab({
  student, showToast,
}: {
  student: Student
  showToast: (m: string, t?: Toast['tone']) => void
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .in('audience', ['all', 'students', 'class'])
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false })

      if (error) {
        showToast('Could not load news.', 'error')
        setLoading(false)
        return
      }

      if (cancelled) return

      const now = Date.now()
      const filtered = (data || []).filter((a: any) => {
        if (a.audience === 'class') {
          if (!student.class_id || a.class_id !== student.class_id) return false
        }
        if (a.expires_at && new Date(a.expires_at).getTime() < now) return false
        return true
      })

      setAnnouncements(filtered as Announcement[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [student.class_id, showToast])

  if (loading) {
    return <div className="text-center py-20 text-sm text-gray-500 italic">Loading news…</div>
  }

  if (announcements.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-12 text-center">
        <p className="text-4xl mb-3">📭</p>
        <h2 className="text-base font-bold text-[#0A1E3D]">No News Yet</h2>
        <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
          There are no announcements for you right now. Check back later.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
        <h2 className="text-sm font-bold text-[#0A1E3D]">News &amp; Announcements</h2>
        <p className="text-xs text-gray-500 mt-0.5">{announcements.length} item(s)</p>
      </div>

      {announcements.map((a) => (
        <div key={a.id} className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {a.pinned && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                  📌 Pinned
                </span>
              )}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 uppercase">
                {a.audience === 'class' ? 'Your Class' : a.audience === 'students' ? 'Students' : 'General'}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
              {new Date(a.published_at).toLocaleDateString()}
            </p>
          </div>

          <h3 className="text-sm font-bold text-[#0A1E3D]">{a.title}</h3>
          <p className="text-xs text-gray-700 mt-2 whitespace-pre-wrap leading-relaxed">{a.body}</p>

          {a.attachment_url && (
            <a
              href={a.attachment_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 mt-3 bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-amber-100"
            >
              📎 {a.attachment_name || 'Download attachment'}
            </a>
          )}

          {a.expires_at && (
            <p className="text-[10px] text-gray-400 mt-2 italic">
              Expires {new Date(a.expires_at).toLocaleDateString()}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/* ============================================================================
   TAB: REPORT CARD
   ============================================================================ */

function ReportCardTab({
  student, klass, subjects, showToast,
}: {
  student: Student
  klass: ClassRow | null
  subjects: SubjectRow[]
  showToast: (m: string, t?: Toast['tone']) => void
}) {
  const [publications, setPublications] = useState<ReportCardPub[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ReportCardPub | null>(null)
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [behavioural, setBehavioural] = useState<BehaviouralRow | null>(null)
  const [classRanks, setClassRanks] = useState<Record<string, number>>({})
  const [overallRank, setOverallRank] = useState<number | null>(null)
  const [totalStudentsInClass, setTotalStudentsInClass] = useState(0)
  const [loadingCard, setLoadingCard] = useState(false)

  useEffect(() => {
    if (!student.class_id) { setLoading(false); return }
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('report_card_publications')
        .select('*')
        .eq('class_id', student.class_id)
        .order('published_at', { ascending: false })
      if (error) showToast('Failed to load report cards.', 'error')
      setPublications((data || []) as ReportCardPub[])
      setLoading(false)
    })()
  }, [student.class_id, showToast])

  useEffect(() => {
    if (!selected || !student.class_id) return
    ;(async () => {
      setLoadingCard(true)

      const [sc, att, beh, classmates] = await Promise.all([
        supabase.from('scores').select('*').eq('student_id', student.id).eq('term', selected.term).eq('session', selected.session),
        supabase.from('attendance').select('*').eq('student_id', student.id),
        supabase.from('behavioural_ratings').select('*').eq('student_id', student.id).eq('term', selected.term).eq('session', selected.session).maybeSingle(),
        supabase.from('students').select('id').eq('class_id', student.class_id),
      ])

      setScores((sc.data || []) as ScoreRow[])
      setAttendance((att.data || []) as AttendanceRow[])
      setBehavioural((beh.data || null) as BehaviouralRow | null)
      setTotalStudentsInClass((classmates.data || []).length)

      const classmateIds = (classmates.data || []).map((s: any) => s.id)
      if (classmateIds.length > 0) {
        const { data: allScores } = await supabase
          .from('scores').select('*')
          .in('student_id', classmateIds)
          .eq('term', selected.term)
          .eq('session', selected.session)

        const ranks: Record<string, number> = {}
        const subjectIds = Array.from(new Set((allScores || []).map((s: any) => s.subject_id)))
        subjectIds.forEach((sid) => {
          const list = (allScores || [])
            .filter((s: any) => s.subject_id === sid)
            .map((s: any) => ({ student_id: s.student_id, total: (s.test_score || 0) + (s.exam_score || 0) }))
            .sort((a, b) => b.total - a.total)
          const idx = list.findIndex((r) => r.student_id === student.id)
          if (idx >= 0) ranks[sid] = idx + 1
        })
        setClassRanks(ranks)

        const totals = new Map<string, number>()
        ;(allScores || []).forEach((s: any) => {
          const t = (s.test_score || 0) + (s.exam_score || 0)
          totals.set(s.student_id, (totals.get(s.student_id) || 0) + t)
        })
        const ranked = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
        const pos = ranked.findIndex(([id]) => id === student.id)
        setOverallRank(pos >= 0 ? pos + 1 : null)
      }

      setLoadingCard(false)
    })()
  }, [selected, student.id, student.class_id])

  const subjectById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s.name])), [subjects])

  const computed = useMemo(() => {
    if (scores.length === 0) return { rows: [], total: 0, avg: '0.00', count: 0 }
    const rows = scores.map((sc) => {
      const total = (sc.test_score || 0) + (sc.exam_score || 0)
      const g = gradeFromTotal(total)
      return {
        subject_name: subjectById[sc.subject_id] || '—',
        subject_id: sc.subject_id,
        ca: sc.test_score ?? 0,
        exam: sc.exam_score ?? 0,
        total,
        grade: g.grade,
        tone: g.tone,
        position: classRanks[sc.subject_id] ?? null,
      }
    })
    const sum = rows.reduce((a, r) => a + r.total, 0)
    const avg = rows.length > 0 ? (sum / (rows.length * 100)) * 100 : 0
    return { rows, total: sum, avg: avg.toFixed(2), count: rows.length }
  }, [scores, subjectById, classRanks])

  const attStats = useMemo(() => {
    const total = attendance.length
    const present = attendance.filter((a) => a.status === 'Present').length
    const late = attendance.filter((a) => a.status === 'Late').length
    const absent = attendance.filter((a) => a.status === 'Absent').length
    return { total, present, late, absent, presentPct: total > 0 ? Math.round(((present + late) / total) * 100) : 0 }
  }, [attendance])

  if (loading) {
    return <div className="text-center py-20 text-sm text-gray-500 italic">Loading…</div>
  }

  if (publications.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-12 text-center">
        <p className="text-4xl mb-3">📭</p>
        <h2 className="text-base font-bold text-[#0A1E3D]">No Report Cards Available</h2>
        <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
          Your report cards will appear here once the school publishes them. Please check back later.
        </p>
      </div>
    )
  }

  if (selected) {
    return (
      <>
        <div className="no-print mb-4 flex justify-between items-center">
          <button
            onClick={() => { setSelected(null); setScores([]); setAttendance([]); setBehavioural(null); setClassRanks({}); setOverallRank(null) }}
            className="text-xs font-bold text-gray-600 hover:text-[#0A1E3D]"
          >
            ← Back to Report Cards
          </button>
          <button
            onClick={() => window.print()}
            className="text-xs font-bold bg-[#0A1E3D] text-white px-4 py-2.5 rounded-xl hover:bg-[#051228]"
          >
            🖨️ Print / Save as PDF
          </button>
        </div>

        {loadingCard ? (
          <div className="text-center py-20 text-sm text-gray-500 italic">Loading report card…</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-6 sm:p-8 print:shadow-none print:ring-0 print:rounded-none">
            {/* SCHOOL HEADER with passport top-right (Option A) */}
            <div className="relative pb-4 border-b-2 border-[#0A1E3D]">
              {/* Passport — top-right corner */}
              <div className="absolute top-0 right-0 z-10">
                <div className="relative">
                  {student.passport_url ? (
                    <img
                      src={student.passport_url}
                      alt={student.full_name}
                      className="w-20 h-24 sm:w-24 sm:h-28 rounded-md object-cover ring-2 ring-[#0A1E3D]/30 bg-slate-100 shadow-sm"
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement
                        img.style.display = 'none'
                        const fb = img.nextElementSibling as HTMLElement | null
                        if (fb) fb.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  {!student.passport_url && (
                    <div className="w-20 h-24 sm:w-24 sm:h-28 rounded-md ring-2 ring-[#0A1E3D]/30 bg-slate-50 flex flex-col items-center justify-center text-gray-400 text-[9px] font-bold text-center px-1">
                      <span className="text-lg mb-1">👤</span>
                      PASSPORT
                    </div>
                  )}
                  {/* Hidden fallback if img fails */}
                  <div
                    className="w-20 h-24 sm:w-24 sm:h-28 rounded-md ring-2 ring-[#0A1E3D]/30 bg-amber-500 text-white font-black hidden items-center justify-center text-2xl"
                    style={{ display: 'none' }}
                  >
                    {student.full_name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
                  </div>
                </div>
              </div>

              {/* School header — centered, padded to avoid passport collision */}
              <div className="text-center px-24 sm:px-28">
                <img src={SCHOOL.logo} alt="Logo" className="w-16 h-16 mx-auto mb-2" />
                <h1 className="text-lg sm:text-xl font-black text-[#0A1E3D] tracking-tight">{SCHOOL.name.toUpperCase()}</h1>
                <p className="text-xs italic mt-0.5">Motto: {SCHOOL.motto}</p>
                <p className="text-[11px] text-gray-600 mt-0.5">{SCHOOL.address}</p>
                <p className="text-[11px] text-gray-600">{SCHOOL.phones.join(' · ')} · {SCHOOL.email}</p>
              </div>
            </div>

            <div className="text-center py-3">
              <h2 className="text-base font-black text-[#0A1E3D] uppercase tracking-wide">
                {selected.term} Report Card
              </h2>
              <p className="text-[11px] text-gray-500">Academic Session: {selected.session}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4 border-y border-slate-200 text-xs">
              <InfoRow label="Name" value={student.full_name} />
              <InfoRow label="Admission Number" value={student.admission_number} />
              <InfoRow label="Class" value={klass?.name || '—'} />
              <InfoRow label="Age" value={String(ageFromDob(student.date_of_birth) ?? '—')} />
              <InfoRow label="Gender" value={student.gender || '—'} />
              <InfoRow
                label="Attendance"
                value={`${attStats.present + attStats.late} / ${attStats.total} (${attStats.presentPct}%)`}
              />
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-300">
                <thead className="bg-[#0A1E3D] text-white">
                  <tr>
                    <th className="p-2 border border-slate-300 text-left">Subject</th>
                    <th className="p-2 border border-slate-300 text-center w-16">CA (40)</th>
                    <th className="p-2 border border-slate-300 text-center w-16">Exam (60)</th>
                    <th className="p-2 border border-slate-300 text-center w-16">Total</th>
                    <th className="p-2 border border-slate-300 text-center w-16">Grade</th>
                    <th className="p-2 border border-slate-300 text-center w-20">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.rows.map((r, i) => (
                    <tr key={r.subject_id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2 border border-slate-300 font-semibold text-[#0A1E3D]">{r.subject_name}</td>
                      <td className="p-2 border border-slate-300 text-center">{r.ca}</td>
                      <td className="p-2 border border-slate-300 text-center">{r.exam}</td>
                      <td className="p-2 border border-slate-300 text-center font-bold">{r.total}</td>
                      <td className={`p-2 border border-slate-300 text-center font-bold ${r.tone}`}>{r.grade}</td>
                      <td className="p-2 border border-slate-300 text-center font-bold text-gray-700">
                        {r.position ? ordinal(r.position) : '—'}
                      </td>
                    </tr>
                  ))}
                  {computed.rows.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-400 italic text-xs">No scores recorded for this term.</td></tr>
                  )}
                </tbody>
                {computed.rows.length > 0 && (
                  <tfoot className="bg-slate-100">
                    <tr>
                      <td className="p-2 border border-slate-300 font-bold">TOTAL</td>
                      <td className="p-2 border border-slate-300" colSpan={2}></td>
                      <td className="p-2 border border-slate-300 text-center font-black text-amber-700">{computed.total}</td>
                      <td className="p-2 border border-slate-300" colSpan={2}></td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-slate-300 font-bold">AVERAGE</td>
                      <td className="p-2 border border-slate-300" colSpan={2}></td>
                      <td className="p-2 border border-slate-300 text-center font-bold text-emerald-700">{computed.avg}%</td>
                      <td className="p-2 border border-slate-300" colSpan={2}></td>
                    </tr>
                    {overallRank && (
                      <tr>
                        <td className="p-2 border border-slate-300 font-bold">POSITION IN CLASS</td>
                        <td className="p-2 border border-slate-300 text-center font-bold text-[#0A1E3D]" colSpan={5}>
                          {ordinal(overallRank)} out of {totalStudentsInClass}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>

            {behavioural && (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#0A1E3D] mb-2 border-b border-slate-200 pb-1">
                    Affective Traits
                  </h3>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {AFFECTIVE_TRAITS.map((t) => (
                        <tr key={t.key} className="border-b border-slate-100">
                          <td className="py-1 text-gray-700">{t.label}</td>
                          <td className="py-1 text-right font-bold text-[#0A1E3D]">
                            {behavioural.affective?.[t.key] ?? '—'}
                            {behavioural.affective?.[t.key] ? <span className="text-gray-400 font-normal ml-1">({RATING_LABELS[behavioural.affective[t.key]]})</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#0A1E3D] mb-2 border-b border-slate-200 pb-1">
                    Psychomotor Skills
                  </h3>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {PSYCHOMOTOR_SKILLS.map((t) => (
                        <tr key={t.key} className="border-b border-slate-100">
                          <td className="py-1 text-gray-700">{t.label}</td>
                          <td className="py-1 text-right font-bold text-[#0A1E3D]">
                            {behavioural.psychomotor?.[t.key] ?? '—'}
                            {behavioural.psychomotor?.[t.key] ? <span className="text-gray-400 font-normal ml-1">({RATING_LABELS[behavioural.psychomotor[t.key]]})</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {behavioural?.teacher_comment && (
              <div className="mt-5">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#0A1E3D] mb-2 border-b border-slate-200 pb-1">
                  Class Teacher's Comment
                </h3>
                <p className="text-xs italic text-gray-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  "{behavioural.teacher_comment}"
                </p>
              </div>
            )}

            <div className="mt-8 pt-6 border-t-2 border-dashed border-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
              <div className="text-center">
                <div className="border-t border-black w-48 mx-auto pt-1">Class Teacher</div>
              </div>
              <div className="text-center">
                <div className="border-t border-black w-48 mx-auto pt-1">Principal</div>
              </div>
            </div>

            <p className="text-[10px] text-center text-gray-400 mt-6 italic">
              Generated by Ibadu Rahman International School Portal · {new Date().toLocaleDateString()}
            </p>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
        <h2 className="text-sm font-bold text-[#0A1E3D]">Published Report Cards</h2>
        <p className="text-xs text-gray-500 mt-0.5">{publications.length} available</p>
      </div>
      {publications.map((p) => (
        <button
          key={p.id}
          onClick={() => setSelected(p)}
          className="w-full bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5 hover:ring-amber-300 hover:bg-amber-50/30 transition text-left flex items-center justify-between gap-3"
        >
          <div>
            <p className="text-sm font-bold text-[#0A1E3D]">{p.term} Report Card</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {p.session} · Published {new Date(p.published_at).toLocaleDateString()}
            </p>
          </div>
          <span className="text-xs font-bold text-amber-600">View →</span>
        </button>
      ))}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}:</span>
      <span className="font-bold text-[#0A1E3D] text-right">{value}</span>
    </div>
  )
}

/* ============================================================================
   TAB: EXAMS LIST
   ============================================================================ */

function ExamsListTab({
  student, subjects, showToast, onStart,
}: {
  student: Student
  subjects: SubjectRow[]
  showToast: (m: string, t?: Toast['tone']) => void
  onStart: (exam: CbtExam) => void
}) {
  const [exams, setExams] = useState<CbtExam[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  const [rulesFor, setRulesFor] = useState<CbtExam | null>(null)

  const subjectById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s.name])), [subjects])
  const attemptByExam = useMemo(() => Object.fromEntries(attempts.map((a) => [a.exam_id, a])), [attempts])

  useEffect(() => {
    if (!student.class_id) { setLoading(false); return }
    ;(async () => {
      setLoading(true)

      const [ex, att] = await Promise.all([
        supabase.from('cbt_exams').select('*')
          .eq('class_id', student.class_id)
          .eq('status', 'published')
          .order('created_at', { ascending: false }),
        supabase.from('cbt_attempts').select('*')
          .eq('student_id', student.id),
      ])

      const list = (ex.data || []) as CbtExam[]
      setExams(list)
      setAttempts((att.data || []) as Attempt[])

      if (list.length > 0) {
        const ids = list.map((e) => e.id)
        const { data: qs } = await supabase.from('cbt_questions').select('exam_id, type').in('exam_id', ids)
        const counts: Record<string, number> = {}
        ;(qs || []).forEach((q: any) => {
          if (q.type === 'objective') counts[q.exam_id] = (counts[q.exam_id] || 0) + 1
        })
        setQuestionCounts(counts)
      }

      setLoading(false)
    })()
  }, [student.class_id, student.id])

  async function beginExam(exam: CbtExam) {
    setStarting(exam.id)

    const existing = attempts.find((a) => a.exam_id === exam.id)

    if (existing && existing.status !== 'in_progress') {
      showToast('You have already taken this exam.', 'warn')
      setStarting(null)
      return
    }

    if (existing && existing.status === 'in_progress') {
      showToast('Resuming your attempt…', 'info')
      setTimeout(() => { onStart(exam); setStarting(null) }, 400)
      return
    }

    const { error } = await supabase.from('cbt_attempts').insert([{
      exam_id: exam.id,
      student_id: student.id,
      status: 'in_progress',
      answers: {},
      theory_answers: {},
      tab_switch_count: 0,
      extended_minutes: 0,
    }])

    if (error) {
      showToast(`Could not start: ${error.message}`, 'error')
      setStarting(null)
      return
    }

    setStarting(null)
    onStart(exam)
  }

  if (loading) {
    return <div className="text-center py-20 text-sm text-gray-500 italic">Loading exams…</div>
  }

  if (exams.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-12 text-center">
        <p className="text-4xl mb-3">📭</p>
        <h2 className="text-base font-bold text-[#0A1E3D]">No Exams Available</h2>
        <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
          There are no published exams for your class right now. Check back later.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <h2 className="text-sm font-bold text-[#0A1E3D]">Your Exams</h2>
          <p className="text-xs text-gray-500 mt-0.5">{exams.length} available</p>
        </div>

        {exams.map((ex) => {
          const att = attemptByExam[ex.id]
          const submitted = att && att.status !== 'in_progress'
          const inProgress = att && att.status === 'in_progress'
          const withinWindow = isWithinWindow(ex)
          const qCount = questionCounts[ex.id] || 0

          const statusLabel = submitted ? 'Submitted' : inProgress ? 'In Progress' : withinWindow ? 'Available' : 'Not Open Yet'
          const statusTone =
            submitted ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
            inProgress ? 'bg-amber-50 text-amber-700 ring-amber-200' :
            withinWindow ? 'bg-amber-50 text-amber-700 ring-amber-200' :
            'bg-slate-100 text-gray-600 ring-slate-200'

          return (
            <div key={ex.id} className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-[#0A1E3D]">{ex.title}</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {subjectById[ex.subject_id]} · {ex.term} · {ex.session}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ring-1 uppercase ${statusTone}`}>
                  {statusLabel}
                </span>
              </div>

              <div className="flex flex-wrap gap-3 text-[11px] text-gray-600">
                <span>📝 {qCount} questions</span>
                <span>⏱ {ex.duration_minutes} min</span>
                {ex.start_at && <span>🕐 Opens {new Date(ex.start_at).toLocaleString()}</span>}
                {ex.end_at && <span>🕐 Closes {new Date(ex.end_at).toLocaleString()}</span>}
              </div>

              {submitted && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[11px] text-emerald-800 font-medium">
                  ✅ Submitted on {new Date(att.submitted_at || '').toLocaleString()}. Your score will be released by the admin.
                </div>
              )}

              {!submitted && withinWindow && (
                <button
                  onClick={() => setRulesFor(ex)}
                  disabled={starting === ex.id}
                  className="w-full bg-amber-500 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-amber-600 disabled:opacity-50"
                >
                  {starting === ex.id ? 'Starting…' : inProgress ? 'Resume Exam →' : 'Start Exam →'}
                </button>
              )}

              {!submitted && !withinWindow && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-gray-500 text-center">
                  This exam is not currently open.
                </div>
              )}
            </div>
          )
        })}
      </div>

      {rulesFor && (
        <RulesModal
          exam={rulesFor}
          questionCount={questionCounts[rulesFor.id] || 0}
          onCancel={() => setRulesFor(null)}
          onBegin={() => { const e = rulesFor; setRulesFor(null); beginExam(e) }}
        />
      )}
    </>
  )
}

function RulesModal({
  exam, questionCount, onCancel, onBegin,
}: {
  exam: CbtExam
  questionCount: number
  onCancel: () => void
  onBegin: () => void
}) {
  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full my-8">
        <div className="bg-[#0A1E3D] text-white p-5 border-b-4 border-amber-500">
          <h3 className="font-black text-base">{exam.title}</h3>
          <p className="text-xs text-amber-300 mt-1">Read carefully before you begin</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase text-gray-500">Questions</p>
              <p className="text-xl font-black text-[#0A1E3D] mt-1">{questionCount}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase text-gray-500">Duration</p>
              <p className="text-xl font-black text-[#0A1E3D] mt-1">{exam.duration_minutes}m</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase text-gray-500">Attempts</p>
              <p className="text-xl font-black text-[#0A1E3D] mt-1">{exam.max_attempts}</p>
            </div>
          </div>

          {exam.instructions && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
              <p className="font-bold mb-1">Instructions:</p>
              <p className="italic">{exam.instructions}</p>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs text-gray-700">
            <p className="font-bold text-[#0A1E3D]">Please note:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                You have <strong>{exam.max_attempts} attempt{exam.max_attempts === 1 ? '' : 's'}</strong>.
                The timer starts when you click Begin.
              </li>
              <li>Your answers are <strong>saved automatically</strong> — you can safely close the tab and resume.</li>
              <li>If your time runs out, the exam submits automatically.</li>
              <li>Do not leave this page during the exam. Leaving multiple times will be logged.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button onClick={onCancel} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100">
              Cancel
            </button>
            <button onClick={onBegin} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600">
              Begin Exam →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   EXAM RUNNER (FULLSCREEN)
   ============================================================================ */

function ExamRunner({
  exam, student, onFinish, showToast, toasts,
}: {
  exam: CbtExam
  student: Student
  onFinish: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  toasts: Toast[]
}) {
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [questions, setQuestions] = useState<CbtQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState<number>(exam.duration_minutes * 60)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const tabSwitchRef = useRef(0)
  const submittedRef = useRef(false)
  const autoSubmittedRef = useRef(false)

  useEffect(() => {
    ;(async () => {
      setLoading(true)

      let { data: att } = await supabase
        .from('cbt_attempts').select('*')
        .eq('exam_id', exam.id)
        .eq('student_id', student.id)
        .maybeSingle()

      if (!att) {
        const { data: created, error } = await supabase
          .from('cbt_attempts').insert([{
            exam_id: exam.id,
            student_id: student.id,
            status: 'in_progress',
            answers: {},
            theory_answers: {},
            tab_switch_count: 0,
            extended_minutes: 0,
          }]).select().single()
        if (error) { showToast(`Could not start attempt: ${error.message}`, 'error'); setLoading(false); return }
        att = created
      }

      setAttempt(att as Attempt)
      setAnswers((att as any).answers || {})
      tabSwitchRef.current = (att as any).tab_switch_count || 0

      const { data: qs } = await supabase
        .from('cbt_questions').select('*')
        .eq('exam_id', exam.id)
        .eq('type', 'objective')
        .order('created_at')

      const rawList = (qs || []) as CbtQuestion[]
      const ordered = exam.shuffle_questions
        ? seededShuffle(rawList, `q-${exam.id}-${student.id}`)
        : rawList
      setQuestions(ordered)

      const startedAt = new Date((att as any).started_at || Date.now()).getTime()
      const totalMs = (exam.duration_minutes + ((att as any).extended_minutes || 0)) * 60 * 1000
      const elapsed = Date.now() - startedAt
      const remaining = Math.max(0, Math.floor((totalMs - elapsed) / 1000))
      setSecondsLeft(remaining)

      setLoading(false)
    })()
  }, [exam.id, student.id, exam.duration_minutes, exam.shuffle_questions, showToast])

  useEffect(() => {
    if (submittedRef.current) return
    const onVis = () => {
      if (document.hidden) {
        tabSwitchRef.current += 1
        if (attempt) {
          supabase.from('cbt_attempts').update({ tab_switch_count: tabSwitchRef.current }).eq('id', attempt.id).then(() => {})
        }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [attempt])

  useEffect(() => {
    if (submittedRef.current || loading) return
    if (secondsLeft <= 0) {
      if (!autoSubmittedRef.current) {
        autoSubmittedRef.current = true
        void doSubmit(true)
      }
      return
    }
    const i = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(i)
  }, [loading, secondsLeft])

  async function pickAnswer(questionId: string, choice: 'A' | 'B' | 'C' | 'D') {
    if (!attempt) return
    const next = { ...answers, [questionId]: choice }
    setAnswers(next)
    const { error } = await supabase.from('cbt_attempts').update({ answers: next }).eq('id', attempt.id)
    if (error) showToast('Could not save answer — check your connection.', 'error')
  }

  async function doSubmit(auto = false) {
    if (submittedRef.current || !attempt) return
    submittedRef.current = true
    setSubmitting(true)

    let score = 0
    let totalMarks = 0
    questions.forEach((q) => {
      totalMarks += q.marks || 1
      if (answers[q.id] && answers[q.id] === q.correct_answer) score += q.marks || 1
    })

    const startedAt = new Date(attempt.started_at || Date.now()).getTime()
    const duration = Math.floor((Date.now() - startedAt) / 1000)

    const { error } = await supabase.from('cbt_attempts').update({
      status: auto ? 'auto_submitted' : 'submitted',
      submitted_at: new Date().toISOString(),
      score,
      total_marks: totalMarks,
      final_score: exam.has_theory ? null : score,
      duration_spent_seconds: duration,
    }).eq('id', attempt.id)

    setSubmitting(false)

    if (error) {
      showToast(`Submit failed: ${error.message}`, 'error')
      submittedRef.current = false
      return
    }

    setSubmitted(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-gray-500 italic">Loading exam…</p>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 max-w-md w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-50 ring-1 ring-emerald-200 mx-auto flex items-center justify-center text-3xl">✅</div>
          <h1 className="text-xl font-black text-[#0A1E3D]">Submitted Successfully</h1>
          <p className="text-sm text-gray-600">
            Your answers have been recorded. Your score will be released by the admin.
          </p>
          <button
            onClick={onFinish}
            className="w-full bg-[#0A1E3D] text-white py-3 rounded-xl text-sm font-bold hover:bg-[#051228]"
          >
            Back to My Exams
          </button>
        </div>
        <div className="fixed bottom-6 right-6 space-y-3 pointer-events-none">
          {toasts.map((t) => (
            <div key={t.id} className={`pointer-events-auto px-4 py-3 rounded-xl shadow-2xl text-white text-xs font-semibold max-w-sm border-l-4 ${
              t.tone === 'success' ? 'bg-emerald-600 border-emerald-300' :
              t.tone === 'error' ? 'bg-red-600 border-red-300' :
              t.tone === 'warn' ? 'bg-amber-600 border-amber-300' :
              'bg-[#0A1E3D] border-amber-400'
            }`}>{t.msg}</div>
          ))}
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 max-w-md w-full p-8 text-center space-y-4">
          <h1 className="text-lg font-black text-[#0A1E3D]">No Questions Available</h1>
          <p className="text-sm text-gray-600">
            This exam has no objective questions yet. Please contact your school administrator.
          </p>
          <button onClick={onFinish} className="w-full bg-[#0A1E3D] text-white py-3 rounded-xl text-sm font-bold hover:bg-[#051228]">
            Back to My Exams
          </button>
        </div>
      </div>
    )
  }

  const q = questions[currentIdx]
  const answeredCount = Object.keys(answers).length
  const answeredPct = (answeredCount / questions.length) * 100
  const isLowTime = secondsLeft <= 60

  const displayOptions = (() => {
    const opts = ([
      { key: 'A', text: q.option_a },
      { key: 'B', text: q.option_b },
      { key: 'C', text: q.option_c },
      { key: 'D', text: q.option_d },
    ] as const).filter((o) => o.text)
    if (!exam.shuffle_options) return opts
    return seededShuffle(opts, `o-${exam.id}-${student.id}-${q.id}`)
  })()

  return (
    <>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className={`sticky top-0 z-30 text-white shadow-md border-b-4 ${isLowTime ? 'bg-red-700 border-red-900 animate-pulse' : 'bg-[#0A1E3D] border-amber-500'}`}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-black truncate">{exam.title}</h1>
              <p className="text-[10px] text-amber-200 truncate">
                {student.full_name} · {student.admission_number}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase opacity-80">Time Left</p>
              <p className={`text-xl sm:text-2xl font-black tabular-nums ${isLowTime ? 'text-white' : 'text-amber-300'}`}>
                {fmtTime(secondsLeft)}
              </p>
            </div>
          </div>
          <div className="h-1 bg-black/20">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${answeredPct}%` }} />
          </div>
        </header>

        <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-xs font-bold text-[#0A1E3D]">
              Question {currentIdx + 1} of {questions.length} · {answeredCount} answered
            </p>
            <div className="flex flex-wrap gap-1 max-w-full overflow-x-auto">
              {questions.map((qq, i) => {
                const isCurrent = i === currentIdx
                const isAnswered = !!answers[qq.id]
                return (
                  <button
                    key={qq.id}
                    onClick={() => setCurrentIdx(i)}
                    className={`w-7 h-7 rounded-md text-[10px] font-bold transition ${
                      isCurrent ? 'bg-[#0A1E3D] text-white' :
                      isAnswered ? 'bg-emerald-500 text-white' :
                      'bg-slate-200 text-gray-700 hover:bg-slate-300'
                    }`}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-6 sm:p-8 select-none">
            <div className="flex items-start gap-3 mb-5">
              <span className="shrink-0 w-8 h-8 rounded-lg bg-[#0A1E3D] text-white text-xs font-bold flex items-center justify-center">
                {currentIdx + 1}
              </span>
              <p className="text-sm sm:text-base font-medium text-[#0A1E3D] flex-1 leading-relaxed">{q.question_text}</p>
              <span className="text-[10px] font-bold text-gray-500 shrink-0">{q.marks} mark{q.marks === 1 ? '' : 's'}</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {displayOptions.map((opt) => {
                const chosen = answers[q.id] === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => pickAnswer(q.id, opt.key)}
                    className={`text-left px-4 py-3.5 rounded-xl border-2 transition flex items-center gap-3 ${
                      chosen
                        ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-200'
                        : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-amber-50/40'
                    }`}
                  >
                    <span className={`shrink-0 w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center ${
                      chosen ? 'bg-amber-500 text-white' : 'bg-slate-100 text-gray-700'
                    }`}>
                      {opt.key}
                    </span>
                    <span className="text-sm text-gray-800 flex-1">{opt.text}</span>
                    {chosen && <span className="text-amber-600 font-bold">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex justify-between items-center gap-3 mt-5">
            <button
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={currentIdx === 0}
              className="bg-white ring-1 ring-slate-200 text-gray-700 px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-40"
            >
              ← Previous
            </button>

            {currentIdx < questions.length - 1 ? (
              <button
                onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                className="bg-[#0A1E3D] text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-[#051228]"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={() => setConfirmSubmit(true)}
                className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-700"
              >
                Submit Exam
              </button>
            )}
          </div>

          <div className="text-center mt-4">
            <button
              onClick={() => setConfirmSubmit(true)}
              className="text-[11px] font-bold text-gray-500 hover:text-amber-600 underline"
            >
              Submit early
            </button>
          </div>
        </main>

        <div className="fixed bottom-6 right-6 z-[100] space-y-3 pointer-events-none">
          {toasts.map((t) => (
            <div key={t.id} className={`pointer-events-auto px-4 py-3 rounded-xl shadow-2xl text-white text-xs font-semibold max-w-sm border-l-4 ${
              t.tone === 'success' ? 'bg-emerald-600 border-emerald-300' :
              t.tone === 'error' ? 'bg-red-600 border-red-300' :
              t.tone === 'warn' ? 'bg-amber-600 border-amber-300' :
              'bg-[#0A1E3D] border-amber-400'
            }`}>{t.msg}</div>
          ))}
        </div>

        {confirmSubmit && (
          <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <h3 className="font-bold text-[#0A1E3D] text-base">Submit Exam?</h3>
              <p className="text-sm text-gray-600 mt-1">
                You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.
                {answeredCount < questions.length && <> Unanswered questions will be marked as blank.</>}
                {' '}This cannot be undone.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmSubmit(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setConfirmSubmit(false); void doSubmit(false) }}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit Now'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}