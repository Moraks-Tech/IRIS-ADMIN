'use client'

/* ============================================================================
   IBADU RAHMAN INTERNATIONAL SCHOOL — TEACHER PORTAL
   v1.0 — Attendance, Score Entry, Behavioural Ratings, CBT Results, News
   ============================================================================ */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

/* ============================================================================
   TYPES
   ============================================================================ */

type Teacher = {
  id: string
  staff_id: string
  full_name: string
  email: string
  role_type: 'subject' | 'class' | 'both'
  assigned_class_id: string | null
  assigned_subjects: string | null
}

type ClassRow = { id: string; name: string }
type SubjectRow = { id: string; name: string }

type Student = {
  id: string
  admission_number: string
  full_name: string
  class_id: string | null
  gender: 'Male' | 'Female' | null
  date_of_birth: string | null
  passport_url?: string | null
}

type AttendanceStatus = 'Present' | 'Absent' | 'Late'

type CbtExam = {
  id: string
  title: string
  class_id: string
  subject_id: string
  duration_minutes: number
  session: string
  term: string
  status: 'draft' | 'published'
  has_theory: boolean
}

type Attempt = {
  id: string
  exam_id: string
  student_id: string
  status: string
  score: number | null
  total_marks: number | null
  final_score: number | null
  duration_spent_seconds: number | null
  tab_switch_count: number
  submitted_at: string | null
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

const TERMS = ['First Term', 'Second Term', 'Third Term'] as const
type Term = typeof TERMS[number]

const SCORE_MAX = { ca: 40, exam: 60 }

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

/* ============================================================================
   HELPERS
   ============================================================================ */

function gradeFromTotal(total: number): string {
  if (total >= 70) return 'A1'
  if (total >= 65) return 'B2'
  if (total >= 60) return 'B3'
  if (total >= 55) return 'C4'
  if (total >= 50) return 'C5'
  if (total >= 45) return 'C6'
  if (total >= 40) return 'D7'
  if (total >= 35) return 'E8'
  return 'F9'
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

function normalizeName(s: string): string {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeHeader(h: string): string {
  return String(h).trim().toLowerCase().replace(/\s+/g, '_')
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function StudentAvatar({ student, size = 'md' }: { student: Student; size?: 'sm' | 'md' }) {
  const cls = size === 'sm'
    ? 'w-8 h-10 rounded ring-1 ring-slate-200 object-cover'
    : 'w-10 h-12 rounded-lg ring-1 ring-slate-200 object-cover'
  if (student.passport_url) {
    return <img src={student.passport_url} alt={student.full_name} className={cls} />
  }
  return <div className={`${cls} bg-slate-100 flex items-center justify-center text-[9px] text-gray-400`}>—</div>
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
        `,
      }}
    />
  )
}

/* ============================================================================
   MAIN
   ============================================================================ */

export default function TeacherPortal() {
  const router = useRouter()

  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [booting, setBooting] = useState(true)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [myClassIds, setMyClassIds] = useState<string[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [activeTab, setActiveTab] = useState<'attendance' | 'scores' | 'behavioural' | 'cbt' | 'news'>('attendance')

  const [currentTerm, setCurrentTerm] = useState<Term>('First Term')
  const [currentSession, setCurrentSession] = useState('2025/2026')

  const [toasts, setToasts] = useState<Toast[]>([])
  const showToast = useCallback((msg: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('loggedInTeacher')
    if (!stored) { router.push('/login'); return }
    try {
      const parsed = JSON.parse(stored) as Teacher
      setTeacher(parsed)
    } catch {
      router.push('/login')
      return
    }
    setBooting(false)
  }, [router])

  useEffect(() => {
    if (!teacher) return
    ;(async () => {
      setLoadingMeta(true)
      const [c, s, tc] = await Promise.all([
        supabase.from('classes').select('*').order('name'),
        supabase.from('subjects').select('*').order('name'),
        supabase.from('teacher_classes').select('class_id').eq('teacher_id', teacher.id),
      ])
      if (c.error) showToast('Failed to load classes.', 'error')
      if (s.error) showToast('Failed to load subjects.', 'error')
      setClasses(c.data || [])
      setSubjects(s.data || [])

      const ids = (tc.data || []).map((row: any) => row.class_id)
      if (ids.length === 0 && teacher.assigned_class_id) ids.push(teacher.assigned_class_id)
      setMyClassIds(ids)

      setLoadingMeta(false)
    })()
  }, [teacher, showToast])

  const teacherSubjectIds = useMemo(() => {
    if (!teacher?.assigned_subjects || !subjects.length) return [] as string[]
    const names = teacher.assigned_subjects
      .split(',')
      .map((s) => normalizeName(s))
      .filter(Boolean)
    const map = new Map<string, string>()
    subjects.forEach((s) => map.set(normalizeName(s.name), s.id))
    const ids: string[] = []
    names.forEach((n) => {
      const id = map.get(n)
      if (id) ids.push(id)
    })
    return ids
  }, [teacher, subjects])

  const teacherSubjects = useMemo(
    () => subjects.filter((s) => teacherSubjectIds.includes(s.id)),
    [subjects, teacherSubjectIds]
  )

  // ─── SCORE ENTRY CLASSES ─────────────────────────────────────────────────
  // Any teacher with subjects can enter scores for ANY class.
  const scoreEntryClasses = useMemo(() => {
    if (!teacher) return [] as ClassRow[]
    if (teacherSubjects.length === 0) return [] as ClassRow[]
    return classes
  }, [teacher, classes, teacherSubjects])

  // ─── CLASS-TEACHER OVERSIGHT CLASSES ─────────────────────────────────────
  // Only used for behavioural ratings.
  const classTeacherClasses = useMemo(() => {
    if (!teacher) return [] as ClassRow[]
    if (teacher.role_type === 'subject') return [] as ClassRow[]
    return classes.filter((c) => myClassIds.includes(c.id))
  }, [teacher, classes, myClassIds])

  const isClassTeacher = useMemo(() => {
    if (!teacher) return false
    return teacher.role_type === 'class' || teacher.role_type === 'both'
  }, [teacher])

  function handleLogout() {
    localStorage.removeItem('loggedInTeacher')
    router.push('/login')
  }

  if (booting) return null
  if (!teacher) return null

  if (!teacher.assigned_class_id && !teacher.assigned_subjects && myClassIds.length === 0) {
    return (
      <>
        <GlobalStyles />
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-xl border-2 border-amber-200 p-8 max-w-md text-center space-y-4">
            <h2 className="text-lg font-black text-[#0A1E3D]">Setup Incomplete</h2>
            <p className="text-sm text-gray-600">
              Your account has no class or subject assignment yet. Please contact the school administrator.
            </p>
            <button onClick={handleLogout} className="bg-[#0A1E3D] text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-[#051228]">
              Log Out
            </button>
          </div>
        </div>
      </>
    )
  }

  const classChips = myClassIds
    .map((id) => classes.find((c) => c.id === id)?.name)
    .filter(Boolean)

  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-slate-50 text-gray-800 flex flex-col">
        <header className="bg-[#0A1E3D] text-white shadow-md border-b-2 border-amber-500 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="bg-amber-500 text-white font-black px-2.5 py-1 rounded text-[10px] uppercase tracking-wider shrink-0">
                {isClassTeacher ? 'Class Teacher' : 'Subject Teacher'}
              </span>
              <div className="min-w-0">
                <h2 className="font-extrabold text-sm truncate">{teacher.full_name}</h2>
                <p className="text-[10px] text-amber-300 truncate">
                  {teacher.assigned_subjects || 'General'}
                  {classChips.length > 0 ? ` · ${classChips.join(', ')}` : ''}
                </p>
              </div>
            </div>
            <button onClick={handleLogout} className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500 shrink-0">
              Log Out
            </button>
          </div>
        </header>

        <div className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">Term</label>
                <select
                  value={currentTerm}
                  onChange={(e) => setCurrentTerm(e.target.value as Term)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-200 bg-white"
                >
                  {TERMS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">Session</label>
                <input
                  value={currentSession}
                  onChange={(e) => setCurrentSession(e.target.value)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-200 bg-white w-28"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {teacherSubjects.map((s) => (
                <span key={s.id} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                  {s.name}
                </span>
              ))}
              {classChips.length > 0 && teacherSubjects.length > 0 && (
                <span className="text-[10px] text-gray-400">·</span>
              )}
              {classChips.map((name) => (
                <span key={name} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex gap-1 overflow-x-auto">
              <TabBtn id="attendance" current={activeTab} onClick={setActiveTab} label="Daily Attendance" />
              <TabBtn id="scores" current={activeTab} onClick={setActiveTab} label="Score Entry" />
              {isClassTeacher && (
                <TabBtn id="behavioural" current={activeTab} onClick={setActiveTab} label="Behavioural Ratings" />
              )}
              <TabBtn id="cbt" current={activeTab} onClick={setActiveTab} label="CBT Results" />
              <TabBtn id="news" current={activeTab} onClick={setActiveTab} label="📢 News" />
            </div>
          </div>
        </div>

        <main className="flex-1">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            {loadingMeta ? (
              <div className="text-center py-20 text-sm text-gray-500 italic">Loading…</div>
            ) : (
              <>
                {activeTab === 'attendance' && (
                  <AttendanceTab classes={scoreEntryClasses} showToast={showToast} />
                )}
                {activeTab === 'scores' && (
                  <ScoresTab
                    classes={scoreEntryClasses}
                    teacherSubjects={teacherSubjects}
                    currentTerm={currentTerm}
                    currentSession={currentSession}
                    showToast={showToast}
                  />
                )}
                {activeTab === 'behavioural' && isClassTeacher && (
                  <BehaviouralTab
                    classes={classTeacherClasses}
                    currentTerm={currentTerm}
                    currentSession={currentSession}
                    teacherId={teacher.id}
                    showToast={showToast}
                  />
                )}
                {activeTab === 'cbt' && (
                  <CbtResultsTab
                    classes={scoreEntryClasses}
                    teacherSubjectIds={teacherSubjectIds}
                    showToast={showToast}
                  />
                )}
                {activeTab === 'news' && (
                  <NewsTab teacher={teacher} showToast={showToast} />
                )}
              </>
            )}
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

        <footer className="bg-[#061A33] text-white py-4 px-6 text-center text-[11px] border-t border-amber-500/30">
          Ibadu Rahman International School · Teacher Portal · {new Date().getFullYear()}
        </footer>
      </div>
    </>
  )
}

function TabBtn({
  id, current, onClick, label,
}: {
  id: 'attendance' | 'scores' | 'behavioural' | 'cbt' | 'news'
  current: string
  onClick: (v: 'attendance' | 'scores' | 'behavioural' | 'cbt' | 'news') => void
  label: string
}) {
  const active = current === id
  return (
    <button
      onClick={() => onClick(id)}
      className={`whitespace-nowrap px-4 py-3 text-xs font-bold border-b-2 transition ${
        active ? 'border-amber-500 text-[#0A1E3D]' : 'border-transparent text-gray-500 hover:text-[#0A1E3D]'
      }`}
    >
      {label}
    </button>
  )
}

/* ============================================================================
   TAB: NEWS
   ============================================================================ */

function NewsTab({
  teacher, showToast,
}: {
  teacher: Teacher
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
        .in('audience', ['all', 'teachers'])
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false })

      if (error) { showToast('Could not load news.', 'error'); setLoading(false); return }
      if (cancelled) return

      const now = Date.now()
      const filtered = (data || []).filter((a: any) => {
        if (a.expires_at && new Date(a.expires_at).getTime() < now) return false
        return true
      })
      setAnnouncements(filtered as Announcement[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [teacher.id, showToast])

  if (loading) return <div className="text-center py-20 text-sm text-gray-500 italic">Loading news…</div>

  if (announcements.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-12 text-center">
        <p className="text-4xl mb-3">📭</p>
        <h2 className="text-base font-bold text-[#0A1E3D]">No News Yet</h2>
        <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
          There are no announcements for teachers right now. Check back later.
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
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 uppercase">
                {a.audience === 'teachers' ? 'Teachers' : 'General'}
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
   TAB: ATTENDANCE
   ============================================================================ */

function AttendanceTab({
  classes, showToast,
}: {
  classes: ClassRow[]
  showToast: (m: string, t?: Toast['tone']) => void
}) {
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [students, setStudents] = useState<Student[]>([])
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [bulkPreview, setBulkPreview] = useState<{
    valid: { student_id: string; admission_no: string; name: string; status: AttendanceStatus }[]
    errors: string[]
    unmatched: string[]
  } | null>(null)

  useEffect(() => {
    if (!classId && classes.length === 1) setClassId(classes[0].id)
  }, [classes, classId])

  useEffect(() => {
    if (!classId) { setStudents([]); setRecords({}); return }
    load()
  }, [classId, date])

  async function load() {
    setLoading(true)
    const { data: stds, error: stErr } = await supabase
      .from('students').select('*')
      .eq('class_id', classId)
      .order('full_name')

    if (stErr) { showToast('Failed to load students.', 'error'); setLoading(false); return }
    setStudents((stds || []) as Student[])

    const { data: atts } = await supabase
      .from('attendance').select('*')
      .eq('class_id', classId)
      .eq('date', date)

    const map: Record<string, AttendanceStatus> = {}
    ;(stds || []).forEach((s: Student) => {
      const found = atts?.find((a: any) => a.student_id === s.id)
      map[s.id] = (found?.status as AttendanceStatus) || 'Present'
    })
    setRecords(map)
    setLoading(false)
  }

  function setStatus(id: string, status: AttendanceStatus) {
    setRecords((prev) => ({ ...prev, [id]: status }))
  }

  function markAll(status: AttendanceStatus) {
    const next: Record<string, AttendanceStatus> = {}
    students.forEach((s) => { next[s.id] = status })
    setRecords(next)
  }

  async function saveAttendance() {
    if (!classId || students.length === 0) return
    setSaving(true)
    const rows = students.map((s) => ({
      student_id: s.id,
      class_id: classId,
      date,
      status: records[s.id] || 'Present',
    }))
    const { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'student_id,date' })
    setSaving(false)
    if (error) { showToast(`Save failed: ${error.message}`, 'error'); return }
    setLastSaved(new Date())
    showToast(`Attendance saved for ${rows.length} students.`)
  }

  function downloadSample() {
    if (students.length === 0) { showToast('Pick a class first.', 'warn'); return }
    const cls = classes.find((c) => c.id === classId)?.name || 'Class'
    const rows: any[][] = [
      ['Admission No', 'Student Name', 'Status (Present/Absent/Late)'],
      ...students.map((s) => [s.admission_number, s.full_name, records[s.id] || 'Present']),
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 28 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, `IRIS_Attendance_${cls}_${date}.xlsx`.replace(/\s+/g, '_'))
    showToast('Attendance sample downloaded.', 'info')
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!classId) { showToast('Pick a class first.', 'warn'); return }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, defval: '' })
        if (rows.length < 2) { showToast('File is empty.', 'error'); return }

        const header = (rows[0] as string[]).map(normalizeHeader)
        const idx = (name: string) => header.indexOf(name)
        const iAdm = idx('admission_no')
        const iName = idx('student_name')
        let iStatus = idx('status')
        if (iStatus === -1) iStatus = idx('status_(present/absent/late)')

        const byAdm = new Map<string, Student>()
        const byName = new Map<string, Student>()
        students.forEach((s) => {
          if (s.admission_number) byAdm.set(s.admission_number.toLowerCase(), s)
          byName.set(s.full_name.toLowerCase(), s)
        })

        const valid: { student_id: string; admission_no: string; name: string; status: AttendanceStatus }[] = []
        const errors: string[] = []
        const unmatched: string[] = []

        rows.slice(1).forEach((r, i) => {
          const rowNum = i + 2
          const adm = String(r[iAdm] ?? '').trim()
          const name = String(r[iName] ?? '').trim()
          const statusRaw = String(r[iStatus] ?? '').trim().toLowerCase()
          if (!adm && !name) return

          const status = (statusRaw === 'present' || statusRaw === 'absent' || statusRaw === 'late')
            ? (statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1)) as AttendanceStatus
            : null

          if (!status) { errors.push(`Row ${rowNum}: Status must be Present, Absent, or Late`); return }

          const student = (adm && byAdm.get(adm.toLowerCase())) || (name && byName.get(name.toLowerCase()))
          if (!student) { unmatched.push(adm || name); return }

          valid.push({ student_id: student.id, admission_no: student.admission_number, name: student.full_name, status })
        })

        setBulkPreview({ valid, errors, unmatched })
      } catch { showToast('Could not read the Excel file.', 'error') }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  function applyBulk() {
    if (!bulkPreview) return
    const next = { ...records }
    bulkPreview.valid.forEach((v) => { next[v.student_id] = v.status })
    setRecords(next)
    showToast(`Applied ${bulkPreview.valid.length} record(s).`)
    setBulkPreview(null)
  }

  const stats = useMemo(() => {
    const s = { Present: 0, Absent: 0, Late: 0 }
    students.forEach((st) => {
      const v = records[st.id] || 'Present'
      s[v]++
    })
    return s
  }, [students, records])

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#0A1E3D] mb-1">Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none">
              <option value="">-- Choose Class --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#0A1E3D] mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none" />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={downloadSample} className="text-xs font-bold bg-[#0A1E3D] text-white px-3.5 py-2.5 rounded-xl hover:bg-black">📥 Sample</button>
            <label className="text-xs font-bold bg-amber-500 text-white px-3.5 py-2.5 rounded-xl hover:bg-amber-600 cursor-pointer">
              📤 Upload
              <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {bulkPreview && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 font-semibold">{bulkPreview.valid.length} ready</span>
            {bulkPreview.errors.length > 0 && <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 font-semibold">{bulkPreview.errors.length} error(s)</span>}
            {bulkPreview.unmatched.length > 0 && <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 font-semibold">{bulkPreview.unmatched.length} not matched</span>}
          </div>
          {bulkPreview.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1">
              {bulkPreview.errors.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}
          {bulkPreview.unmatched.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              Not in this class: {bulkPreview.unmatched.slice(0, 10).join(', ')}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setBulkPreview(null)} className="text-xs font-bold px-4 py-2 rounded-lg text-gray-700 hover:bg-red-50">Cancel</button>
            <button onClick={applyBulk} disabled={bulkPreview.valid.length === 0} className="text-xs font-bold px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">Apply to Table</button>
          </div>
        </div>
      )}

      {classId && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Present: {stats.Present}</span>
              <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200">Absent: {stats.Absent}</span>
              <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">Late: {stats.Late}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => markAll('Present')} className="text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-200">All Present</button>
              <button onClick={() => markAll('Absent')} className="text-xs font-bold bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200">All Absent</button>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-gray-400 italic">Loading students…</div>
          ) : students.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-400 italic">No students in this class.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-gray-700 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-3 w-14">Photo</th>
                    <th className="px-4 py-3 font-semibold">Adm No</th>
                    <th className="px-4 py-3 font-semibold">Student Name</th>
                    <th className="px-4 py-3 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => {
                    const current = records[s.id] || 'Present'
                    return (
                      <tr key={s.id} className="hover:bg-amber-50/50">
                        <td className="px-3 py-2"><StudentAvatar student={s} /></td>
                        <td className="px-4 py-3 font-mono text-amber-700">{s.admission_number}</td>
                        <td className="px-4 py-3 font-medium text-[#0A1E3D]">{s.full_name}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1.5">
                            {(['Present', 'Absent', 'Late'] as AttendanceStatus[]).map((st) => (
                              <button
                                key={st}
                                onClick={() => setStatus(s.id, st)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                                  current === st
                                    ? st === 'Present' ? 'bg-emerald-600 text-white'
                                    : st === 'Absent' ? 'bg-red-600 text-white'
                                    : 'bg-amber-500 text-white'
                                    : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {lastSaved && `Last saved: ${lastSaved.toLocaleTimeString()}`}
            </p>
            <button
              onClick={saveAttendance}
              disabled={saving || students.length === 0}
              className="bg-[#0A1E3D] text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-[#051228] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Attendance'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   TAB: SCORES
   ============================================================================ */

function ScoresTab({
  classes, teacherSubjects, currentTerm, currentSession, showToast,
}: {
  classes: ClassRow[]
  teacherSubjects: SubjectRow[]
  currentTerm: Term
  currentSession: string
  showToast: (m: string, t?: Toast['tone']) => void
}) {
  const [classId, setClassId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [scores, setScores] = useState<Record<string, { ca: string; exam: string }>>({})
  const [originalScores, setOriginalScores] = useState<Record<string, { ca: string; exam: string }>>({})
  const [editMode, setEditMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [adminLocked, setAdminLocked] = useState(false)
  const [bulkPreview, setBulkPreview] = useState<{
    valid: { student_id: string; admission_no: string; name: string; ca: number; exam: number }[]
    errors: string[]
    unmatched: string[]
  } | null>(null)

  useEffect(() => {
    if (!classId && classes.length === 1) setClassId(classes[0].id)
  }, [classes, classId])
  useEffect(() => {
    if (!subjectId && teacherSubjects.length > 0) setSubjectId(teacherSubjects[0].id)
  }, [teacherSubjects, subjectId])

  useEffect(() => {
    if (!classId || !subjectId) { setStudents([]); setScores({}); setAdminLocked(false); return }
    load()
  }, [classId, subjectId, currentTerm, currentSession])

  async function load() {
    setLoading(true)
    setEditMode(false)

    const { data: lockRow } = await supabase
      .from('broadsheet_locks')
      .select('*')
      .eq('class_id', classId)
      .eq('term', currentTerm)
      .eq('session', currentSession)
      .maybeSingle()

    const locked = !!(lockRow && lockRow.locked)
    setAdminLocked(locked)

    const { data: stds, error: stErr } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', classId)
      .order('full_name')

    if (stErr) { showToast('Failed to load students.', 'error'); setLoading(false); return }
    setStudents((stds || []) as Student[])

    const { data: scs } = await supabase
      .from('scores')
      .select('*')
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .eq('session', currentSession)
      .eq('term', currentTerm)

    const map: Record<string, { ca: string; exam: string }> = {}
    ;(stds || []).forEach((s: Student) => {
      const found = scs?.find((x: any) => x.student_id === s.id)
      map[s.id] = {
        ca: found?.test_score?.toString() ?? '',
        exam: found?.exam_score?.toString() ?? '',
      }
    })
    setScores(map)
    setOriginalScores(JSON.parse(JSON.stringify(map)))
    setLoading(false)
  }

  function setScore(id: string, field: 'ca' | 'exam', value: string) {
    if (!editMode || adminLocked) return
    setScores((prev) => ({
      ...prev,
      [id]: {
        ca: prev[id]?.ca ?? '',
        exam: prev[id]?.exam ?? '',
        [field]: value,
      },
    }))
  }

  function cancelEdit() {
    setScores(JSON.parse(JSON.stringify(originalScores)))
    setEditMode(false)
    showToast('Changes discarded.', 'info')
  }

  async function save() {
    if (!classId || !subjectId || students.length === 0) return
    if (adminLocked) { showToast('Scores are locked by admin. Contact the administrator.', 'error'); return }
    setSaving(true)

    const rows: any[] = []
    for (const s of students) {
      const entry = scores[s.id] || { ca: '', exam: '' }
      const caNum = entry.ca === '' ? 0 : Number(entry.ca)
      const examNum = entry.exam === '' ? 0 : Number(entry.exam)

      if (isNaN(caNum) || caNum < 0 || caNum > SCORE_MAX.ca) {
        showToast(`Invalid CA for ${s.full_name}. Must be 0–${SCORE_MAX.ca}.`, 'error')
        setSaving(false); return
      }
      if (isNaN(examNum) || examNum < 0 || examNum > SCORE_MAX.exam) {
        showToast(`Invalid Exam for ${s.full_name}. Must be 0–${SCORE_MAX.exam}.`, 'error')
        setSaving(false); return
      }

      rows.push({
        student_id: s.id,
        subject_id: subjectId,
        class_id: classId,
        session: currentSession,
        term: currentTerm,
        test_score: caNum,
        exam_score: examNum,
      })
    }

    const { error } = await supabase
      .from('scores')
      .upsert(rows, { onConflict: 'student_id,subject_id,term,session' })

    setSaving(false)
    if (error) { showToast(`Save failed: ${error.message}`, 'error'); return }
    setOriginalScores(JSON.parse(JSON.stringify(scores)))
    setEditMode(false)
    setLastSaved(new Date())
    showToast(`Scores saved for ${rows.length} students.`)
  }

  async function clearAllScores() {
    if (!classId || !subjectId) return
    if (adminLocked) { showToast('Scores are locked by admin.', 'error'); return }
    const subjName = teacherSubjects.find((s) => s.id === subjectId)?.name || 'Subject'
    const clsName = classes.find((c) => c.id === classId)?.name || 'Class'

    if (!window.confirm(
      `Clear ALL scores for ${clsName} · ${subjName} · ${currentTerm} · ${currentSession}?\n\nThis will delete all entries. Cannot be undone.`
    )) return

    setClearing(true)
    const { error } = await supabase
      .from('scores')
      .delete()
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .eq('term', currentTerm)
      .eq('session', currentSession)

    setClearing(false)
    if (error) { showToast(`Clear failed: ${error.message}`, 'error'); return }

    const empty: Record<string, { ca: string; exam: string }> = {}
    students.forEach((s) => { empty[s.id] = { ca: '', exam: '' } })
    setScores(empty)
    setOriginalScores(JSON.parse(JSON.stringify(empty)))
    setEditMode(false)
    showToast('All scores cleared. You can now re-enter.', 'warn')
  }

  function downloadSample() {
    if (!classId || students.length === 0) { showToast('Pick a class first.', 'warn'); return }
    const cls = classes.find((c) => c.id === classId)?.name || 'Class'
    const subj = teacherSubjects.find((s) => s.id === subjectId)?.name || 'Subject'
    const rows: any[][] = [
      ['Admission No', 'Student Name', `CA (Max ${SCORE_MAX.ca})`, `Exam (Max ${SCORE_MAX.exam})`],
      ...students.map((s) => [
        s.admission_number,
        s.full_name,
        scores[s.id]?.ca ?? '',
        scores[s.id]?.exam ?? '',
      ]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, subj.slice(0, 28))
    XLSX.writeFile(wb, `IRIS_Scores_${cls}_${subj}_${currentTerm}.xlsx`.replace(/\s+/g, '_'))
    showToast('Scores sample downloaded.', 'info')
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!classId || !subjectId) { showToast('Pick class and subject first.', 'warn'); return }
    if (adminLocked) { showToast('Scores are locked by admin.', 'error'); e.target.value = ''; return }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, defval: '' })
        if (rows.length < 2) { showToast('File is empty.', 'error'); return }

        const header = (rows[0] as string[]).map(normalizeHeader)
        const idx = (name: string) => header.indexOf(name)
        const iAdm = idx('admission_no')
        const iName = idx('student_name')
        const iCa = header.findIndex((h) => h.startsWith('ca'))
        const iExam = header.findIndex((h) => h.startsWith('exam'))

        if (iCa === -1 || iExam === -1) { showToast('Missing CA or Exam columns.', 'error'); return }

        const byAdm = new Map<string, Student>()
        const byName = new Map<string, Student>()
        students.forEach((s) => {
          if (s.admission_number) byAdm.set(s.admission_number.toLowerCase(), s)
          byName.set(s.full_name.toLowerCase(), s)
        })

        const valid: { student_id: string; admission_no: string; name: string; ca: number; exam: number }[] = []
        const errors: string[] = []
        const unmatched: string[] = []

        rows.slice(1).forEach((r, i) => {
          const rowNum = i + 2
          const adm = String(r[iAdm] ?? '').trim()
          const name = String(r[iName] ?? '').trim()
          if (!adm && !name) return

          const caRaw = r[iCa]
          const examRaw = r[iExam]
          const ca = caRaw === '' || caRaw == null ? 0 : Number(caRaw)
          const exam = examRaw === '' || examRaw == null ? 0 : Number(examRaw)

          if (isNaN(ca) || ca < 0 || ca > SCORE_MAX.ca) { errors.push(`Row ${rowNum}: CA must be 0–${SCORE_MAX.ca}`); return }
          if (isNaN(exam) || exam < 0 || exam > SCORE_MAX.exam) { errors.push(`Row ${rowNum}: Exam must be 0–${SCORE_MAX.exam}`); return }

          const student = (adm && byAdm.get(adm.toLowerCase())) || (name && byName.get(name.toLowerCase()))
          if (!student) { unmatched.push(adm || name); return }

          valid.push({ student_id: student.id, admission_no: student.admission_number, name: student.full_name, ca, exam })
        })

        setBulkPreview({ valid, errors, unmatched })
      } catch { showToast('Could not read the Excel file.', 'error') }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  function applyBulk() {
    if (!bulkPreview) return
    const next = { ...scores }
    bulkPreview.valid.forEach((v) => {
      next[v.student_id] = { ca: String(v.ca), exam: String(v.exam) }
    })
    setScores(next)
    setEditMode(true)
    showToast(`Applied ${bulkPreview.valid.length} record(s). Review and click Save.`)
    setBulkPreview(null)
  }

  const hasScores = useMemo(() => {
    return Object.values(scores).some((s) => s.ca !== '' || s.exam !== '')
  }, [scores])

  const hasChanges = useMemo(() => {
    return JSON.stringify(scores) !== JSON.stringify(originalScores)
  }, [scores, originalScores])

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#0A1E3D] mb-1">Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none">
              <option value="">-- Choose Class --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#0A1E3D] mb-1">Subject</label>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none">
              {teacherSubjects.length === 0 && <option value="">No subjects assigned</option>}
              {teacherSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={downloadSample} className="text-xs font-bold bg-[#0A1E3D] text-white px-3.5 py-2.5 rounded-xl hover:bg-black">📥 Sample</button>
            <label className={`text-xs font-bold px-3.5 py-2.5 rounded-xl cursor-pointer ${adminLocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
              📤 Upload
              <input type="file" accept=".xlsx,.xls" onChange={handleUpload} disabled={adminLocked} className="hidden" />
            </label>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          Term: <strong className="text-[#0A1E3D]">{currentTerm}</strong> · Session: <strong className="text-[#0A1E3D]">{currentSession}</strong> · CA max {SCORE_MAX.ca}, Exam max {SCORE_MAX.exam}
        </p>

        {adminLocked && (
          <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 font-bold">
            🔒 Scores for this class + term are <strong>locked by the admin</strong>. You cannot add or edit scores. Contact the school administrator if a change is needed.
          </div>
        )}
      </div>

      {bulkPreview && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 font-semibold">{bulkPreview.valid.length} ready</span>
            {bulkPreview.errors.length > 0 && <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 font-semibold">{bulkPreview.errors.length} error(s)</span>}
            {bulkPreview.unmatched.length > 0 && <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 font-semibold">{bulkPreview.unmatched.length} unmatched</span>}
          </div>
          {bulkPreview.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1">
              {bulkPreview.errors.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}
          {bulkPreview.unmatched.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              Not in this class: {bulkPreview.unmatched.slice(0, 10).join(', ')}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setBulkPreview(null)} className="text-xs font-bold px-4 py-2 rounded-lg text-gray-700 hover:bg-red-50">Cancel</button>
            <button onClick={applyBulk} disabled={bulkPreview.valid.length === 0} className="text-xs font-bold px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">Apply to Table</button>
          </div>
        </div>
      )}

      {classId && subjectId && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-sm font-bold text-[#0A1E3D]">
                {teacherSubjects.find((s) => s.id === subjectId)?.name} — CA ({SCORE_MAX.ca}) + Exam ({SCORE_MAX.exam})
              </h3>
              {adminLocked ? (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200 uppercase">
                  🔒 Locked by Admin
                </span>
              ) : editMode ? (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 uppercase">
                  ✏️ Editing
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-gray-700 ring-1 ring-slate-200 uppercase">
                  🔒 Locked
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500">Total &amp; grade calculated by the broadsheet.</p>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-gray-400 italic">Loading…</div>
          ) : students.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-400 italic">No students in this class.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-gray-700 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-3 w-14">Photo</th>
                    <th className="px-4 py-3 font-semibold">Adm No</th>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold text-center">CA / {SCORE_MAX.ca}</th>
                    <th className="px-4 py-3 font-semibold text-center">Exam / {SCORE_MAX.exam}</th>
                    <th className="px-4 py-3 font-semibold text-center">Total / 100</th>
                    <th className="px-4 py-3 font-semibold text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => {
                    const entry = scores[s.id] || { ca: '', exam: '' }
                    const caN = Number(entry.ca) || 0
                    const exN = Number(entry.exam) || 0
                    const total = caN + exN
                    const caBad = entry.ca !== '' && (caN < 0 || caN > SCORE_MAX.ca)
                    const exBad = entry.exam !== '' && (exN < 0 || exN > SCORE_MAX.exam)
                    const disabled = !editMode || adminLocked
                    return (
                      <tr key={s.id} className="hover:bg-amber-50/50">
                        <td className="px-3 py-2"><StudentAvatar student={s} /></td>
                        <td className="px-4 py-3 font-mono text-amber-700">{s.admission_number}</td>
                        <td className="px-4 py-3 font-medium text-[#0A1E3D]">{s.full_name}</td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number" min={0} max={SCORE_MAX.ca}
                            value={entry.ca}
                            disabled={disabled}
                            onChange={(e) => setScore(s.id, 'ca', e.target.value)}
                            className={`w-20 border rounded-lg p-2 text-center text-sm ${
                              disabled ? 'bg-slate-100 text-gray-600 cursor-not-allowed' :
                              caBad ? 'border-red-400 bg-red-50' :
                              'border-amber-200'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number" min={0} max={SCORE_MAX.exam}
                            value={entry.exam}
                            disabled={disabled}
                            onChange={(e) => setScore(s.id, 'exam', e.target.value)}
                            className={`w-20 border rounded-lg p-2 text-center text-sm ${
                              disabled ? 'bg-slate-100 text-gray-600 cursor-not-allowed' :
                              exBad ? 'border-red-400 bg-red-50' :
                              'border-amber-200'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3 text-center font-black text-[#0A1E3D]">{total}</td>
                        <td className="px-4 py-3 text-center font-bold text-emerald-700">{gradeFromTotal(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {lastSaved && `Last saved: ${lastSaved.toLocaleTimeString()}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {adminLocked ? (
                <span className="text-xs font-bold text-rose-700">Locked by Admin — contact the school office.</span>
              ) : editMode ? (
                <>
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="bg-slate-200 text-gray-800 px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || students.length === 0 || !hasChanges}
                    className="bg-[#0A1E3D] text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-[#051228] disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Scores'}
                  </button>
                </>
              ) : (
                <>
                  {hasScores && (
                    <button
                      onClick={clearAllScores}
                      disabled={clearing}
                      className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      🗑️ {clearing ? 'Clearing…' : 'Clear Scores'}
                    </button>
                  )}
                  <button
                    onClick={() => setEditMode(true)}
                    disabled={students.length === 0}
                    className="bg-amber-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-amber-600 disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    🔓 {hasScores ? 'Edit Scores' : 'Enter Scores'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   TAB: BEHAVIOURAL RATINGS
   ============================================================================ */

function BehaviouralTab({
  classes, currentTerm, currentSession, teacherId, showToast,
}: {
  classes: ClassRow[]
  currentTerm: Term
  currentSession: string
  teacherId: string
  showToast: (m: string, t?: Toast['tone']) => void
}) {
  const [classId, setClassId] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [ratings, setRatings] = useState<Record<string, { affective: Record<string, number>; psychomotor: Record<string, number>; comment: string }>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useEffect(() => {
    if (!classId && classes.length === 1) setClassId(classes[0].id)
  }, [classes, classId])

  useEffect(() => {
    if (!classId) { setStudents([]); setRatings({}); return }
    load()
  }, [classId, currentTerm, currentSession])

  async function load() {
    setLoading(true)
    const { data: stds } = await supabase
      .from('students').select('*')
      .eq('class_id', classId).order('full_name')
    setStudents((stds || []) as Student[])

    const { data: rs } = await supabase
      .from('behavioural_ratings').select('*')
      .eq('class_id', classId)
      .eq('term', currentTerm)
      .eq('session', currentSession)

    const map: typeof ratings = {}
    ;(stds || []).forEach((s: Student) => {
      const found = rs?.find((x: any) => x.student_id === s.id)
      map[s.id] = {
        affective: found?.affective || {},
        psychomotor: found?.psychomotor || {},
        comment: found?.teacher_comment || '',
      }
    })
    setRatings(map)
    setLoading(false)
  }

  function setRating(studentId: string, group: 'affective' | 'psychomotor', key: string, value: number) {
    setRatings((prev) => {
      const cur = prev[studentId] || { affective: {}, psychomotor: {}, comment: '' }
      return { ...prev, [studentId]: { ...cur, [group]: { ...cur[group], [key]: value } } }
    })
  }

  function setComment(studentId: string, value: string) {
    setRatings((prev) => {
      const cur = prev[studentId] || { affective: {}, psychomotor: {}, comment: '' }
      return { ...prev, [studentId]: { ...cur, comment: value } }
    })
  }

  async function save() {
    if (!classId || students.length === 0) return
    setSaving(true)
    const rows = students.map((s) => {
      const r = ratings[s.id] || { affective: {}, psychomotor: {}, comment: '' }
      return {
        student_id: s.id,
        class_id: classId,
        term: currentTerm,
        session: currentSession,
        rated_by: teacherId,
        affective: r.affective,
        psychomotor: r.psychomotor,
        teacher_comment: r.comment || null,
        updated_at: new Date().toISOString(),
      }
    })
    const { error } = await supabase
      .from('behavioural_ratings')
      .upsert(rows, { onConflict: 'student_id,term,session' })
    setSaving(false)
    if (error) { showToast(`Save failed: ${error.message}`, 'error'); return }
    setLastSaved(new Date())
    showToast(`Ratings saved for ${rows.length} students.`)
  }

  function isComplete(studentId: string): boolean {
    const r = ratings[studentId]
    if (!r) return false
    return Object.keys(r.affective || {}).length === AFFECTIVE_TRAITS.length
      && Object.keys(r.psychomotor || {}).length === PSYCHOMOTOR_SKILLS.length
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#0A1E3D] mb-1">Class (you are class teacher of)</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none">
              <option value="">-- Choose Class --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <p className="text-[11px] text-gray-500">
              Rate each student on a 1–5 scale.<br />
              Term: <strong className="text-[#0A1E3D]">{currentTerm}</strong> · Session: <strong className="text-[#0A1E3D]">{currentSession}</strong>
            </p>
          </div>
        </div>
      </div>

      {classId && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-gray-400 italic">Loading…</div>
          ) : students.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-400 italic">No students in this class.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {students.map((s) => {
                const r = ratings[s.id] || { affective: {}, psychomotor: {}, comment: '' }
                const open = expandedId === s.id
                const done = isComplete(s.id)
                return (
                  <div key={s.id}>
                    <button
                      onClick={() => setExpandedId(open ? null : s.id)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-amber-50/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <StudentAvatar student={s} />
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-[#0A1E3D] truncate">{s.full_name}</p>
                          <p className="text-[10px] text-gray-500 font-mono">{s.admission_number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {done && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Complete</span>}
                        <span className="text-xs text-gray-500">{open ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {open && (
                      <div className="px-5 pb-6 space-y-5 bg-slate-50">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-amber-700 mb-2 mt-2">Affective Traits</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {AFFECTIVE_TRAITS.map((t) => (
                              <div key={t.key} className="bg-white rounded-xl border border-slate-200 p-3">
                                <p className="text-xs font-bold text-[#0A1E3D] mb-2">{t.label}</p>
                                <div className="flex gap-1">
                                  {[5, 4, 3, 2, 1].map((v) => (
                                    <button
                                      key={v}
                                      onClick={() => setRating(s.id, 'affective', t.key, v)}
                                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition ${
                                        r.affective[t.key] === v ? 'bg-amber-500 text-white' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {v}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-amber-700 mb-2">Psychomotor Skills</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {PSYCHOMOTOR_SKILLS.map((t) => (
                              <div key={t.key} className="bg-white rounded-xl border border-slate-200 p-3">
                                <p className="text-xs font-bold text-[#0A1E3D] mb-2">{t.label}</p>
                                <div className="flex gap-1">
                                  {[5, 4, 3, 2, 1].map((v) => (
                                    <button
                                      key={v}
                                      onClick={() => setRating(s.id, 'psychomotor', t.key, v)}
                                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition ${
                                        r.psychomotor[t.key] === v ? 'bg-amber-500 text-white' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {v}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-amber-700 mb-2">Teacher's Comment</h4>
                          <textarea
                            rows={3}
                            value={r.comment}
                            onChange={(e) => setComment(s.id, e.target.value)}
                            placeholder="e.g. A hardworking and well-behaved student."
                            className="w-full text-sm p-3 bg-white border border-slate-200 rounded-xl outline-none resize-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">{lastSaved && `Last saved: ${lastSaved.toLocaleTimeString()}`}</p>
            <button
              onClick={save}
              disabled={saving || students.length === 0}
              className="bg-[#0A1E3D] text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-[#051228] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Ratings'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   TAB: CBT RESULTS (READ-ONLY)
   ============================================================================ */

function CbtResultsTab({
  classes, teacherSubjectIds, showToast,
}: {
  classes: ClassRow[]
  teacherSubjectIds: string[]
  showToast: (m: string, t?: Toast['tone']) => void
}) {
  const [classId, setClassId] = useState('')
  const [exams, setExams] = useState<CbtExam[]>([])
  const [expandedExam, setExpandedExam] = useState<string | null>(null)
  const [attempts, setAttempts] = useState<Record<string, Attempt[]>>({})
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!classId && classes.length === 1) setClassId(classes[0].id)
  }, [classes, classId])

  useEffect(() => {
    if (!classId) { setExams([]); setAttempts({}); return }
    load()
  }, [classId])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('cbt_exams')
      .select('*')
      .eq('class_id', classId)
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    if (teacherSubjectIds.length > 0) {
      query = query.in('subject_id', teacherSubjectIds)
    }

    const [ex, stu] = await Promise.all([
      query,
      supabase.from('students').select('*').eq('class_id', classId).order('full_name'),
    ])

    if (ex.error) showToast('Could not load exams.', 'error')
    setExams((ex.data || []) as CbtExam[])
    setStudents((stu.data || []) as Student[])
    setLoading(false)
  }

  async function toggleExam(examId: string) {
    if (expandedExam === examId) { setExpandedExam(null); return }
    setExpandedExam(examId)
    if (attempts[examId]) return
    const { data } = await supabase.from('cbt_attempts').select('*').eq('exam_id', examId)
    setAttempts((prev) => ({ ...prev, [examId]: (data || []) as Attempt[] }))
  }

  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students])

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#0A1E3D] mb-1">Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none">
              <option value="">-- Choose Class --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <p className="text-[11px] text-gray-500">
              Only <strong>published</strong> exams for <strong>your subjects</strong> appear here.<br />
              Questions and exam editing are managed by the admin.
            </p>
          </div>
        </div>
      </div>

      {classId && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-gray-400 italic">Loading…</div>
          ) : exams.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-400 italic">No published exams for this class yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {exams.map((ex) => {
                const open = expandedExam === ex.id
                const list = attempts[ex.id] || []
                const submitted = list.filter((a) => a.status !== 'in_progress').length
                const avg = submitted > 0
                  ? Math.round(list.filter((a) => a.status !== 'in_progress').reduce((acc, a) => acc + (a.score || 0), 0) / submitted)
                  : 0
                return (
                  <div key={ex.id}>
                    <button
                      onClick={() => toggleExam(ex.id)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-amber-50/40"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[#0A1E3D] truncate">{ex.title}</p>
                        <p className="text-[10px] text-gray-500">
                          {ex.duration_minutes} min · {ex.session} · {ex.term}
                          {ex.has_theory && <span className="ml-2 text-purple-700 font-bold">· Theory</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{submitted} submitted</span>
                        {submitted > 0 && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">Avg {avg}</span>}
                        <span className="text-xs text-gray-500">{open ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {open && (
                      <div className="bg-slate-50 px-5 pb-5">
                        {list.length === 0 ? (
                          <p className="text-xs text-gray-400 italic py-4">No submissions yet.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200 bg-white mt-3">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 text-gray-700 text-[10px] uppercase tracking-wider">
                                <tr>
                                  <th className="px-3 py-2 w-12"></th>
                                  <th className="px-3 py-2">Adm No</th>
                                  <th className="px-3 py-2">Student</th>
                                  <th className="px-3 py-2 text-center">Status</th>
                                  <th className="px-3 py-2 text-center">Score</th>
                                  <th className="px-3 py-2 text-center">Time</th>
                                  <th className="px-3 py-2 text-center">Switches</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {list.map((a) => {
                                  const s = studentById[a.student_id]
                                  return (
                                    <tr key={a.id}>
                                      <td className="px-3 py-2">
                                        {s ? <StudentAvatar student={s} size="sm" /> : <div className="w-8 h-10 rounded bg-slate-100" />}
                                      </td>
                                      <td className="px-3 py-2 font-mono text-amber-700">{s?.admission_number || '—'}</td>
                                      <td className="px-3 py-2 font-medium text-[#0A1E3D]">{s?.full_name || '—'}</td>
                                      <td className="px-3 py-2 text-center">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 uppercase ${
                                          a.status === 'submitted' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                                          a.status === 'in_progress' ? 'bg-blue-50 text-blue-700 ring-blue-200' :
                                          a.status === 'graded' ? 'bg-purple-50 text-purple-700 ring-purple-200' :
                                          'bg-amber-50 text-amber-700 ring-amber-200'
                                        }`}>{a.status.replace(/_/g, ' ')}</span>
                                      </td>
                                      <td className="px-3 py-2 text-center font-bold">{a.score ?? '—'} / {a.total_marks ?? '—'}</td>
                                      <td className="px-3 py-2 text-center text-gray-600">{formatDuration(a.duration_spent_seconds)}</td>
                                      <td className="px-3 py-2 text-center">
                                        <span className={`font-bold ${a.tab_switch_count > 0 ? 'text-red-600' : 'text-gray-500'}`}>{a.tab_switch_count}</span>
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
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}