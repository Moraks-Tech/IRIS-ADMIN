'use client'

/* ============================================================================
   IBADU RAHMAN INTERNATIONAL SCHOOL — ADMIN · EXAM DETAIL
   Route: /portal/admin/exams/[id]
   Handles: setup, publish, question upload, delete question
   ============================================================================ */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

/* ============================================================================
   CONFIG
   ============================================================================ */

const SESSION_KEY = 'iris.admin.session'

/* ============================================================================
   TYPES
   ============================================================================ */

type Exam = {
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
  published_at: string | null
  published_by: string | null
  created_at: string
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

type ClassRow = { id: string; name: string }
type SubjectRow = { id: string; name: string }

type Toast = { id: number; msg: string; tone: 'success' | 'error' | 'info' | 'warn' }

/* ============================================================================
   HELPERS
   ============================================================================ */

function normalizeHeader(h: string): string {
  return String(h).trim().toLowerCase().replace(/\s+/g, '_')
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
        `,
      }}
    />
  )
}

/* ============================================================================
   MAIN PAGE
   ============================================================================ */

export default function ExamDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const examId = params?.id

  const [authed, setAuthed] = useState(false)
  const [bootChecked, setBootChecked] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      try {
        const s = JSON.parse(raw)
        if (s.expiresAt > Date.now()) setAuthed(true)
        else router.replace('/login')
      } catch { router.replace('/login') }
    } else {
      router.replace('/login')
    }
    setBootChecked(true)
  }, [router])

  if (!bootChecked) return null
  if (!authed) return null

  return <ExamDetail examId={examId} onBack={() => router.push('/portal/admin')} />
}

/* ============================================================================
   EXAM DETAIL INNER COMPONENT
   ============================================================================ */

function ExamDetail({ examId, onBack }: { examId: string; onBack: () => void }) {
  const [tab, setTab] = useState<'setup' | 'questions' | 'preview'>('setup')
  const [loading, setLoading] = useState(true)

  const [exam, setExam] = useState<Exam | null>(null)
  const [cls, setCls] = useState<ClassRow | null>(null)
  const [subj, setSubj] = useState<SubjectRow | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])

  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)

  const showToast = useCallback((msg: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  const askConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    setConfirmState({ title, message, onConfirm })
  }, [])

  /* -------------------- LOAD -------------------- */
  const loadAll = useCallback(async () => {
    if (!examId) return
    setLoading(true)

    const { data: ex, error: exErr } = await supabase
      .from('cbt_exams')
      .select('*')
      .eq('id', examId)
      .maybeSingle()

    if (exErr || !ex) {
      showToast('Exam not found.', 'error')
      setLoading(false)
      return
    }
    setExam(ex as Exam)

    const [clsRes, subRes, qRes] = await Promise.all([
      supabase.from('classes').select('*').eq('id', ex.class_id).maybeSingle(),
      supabase.from('subjects').select('*').eq('id', ex.subject_id).maybeSingle(),
      supabase.from('cbt_questions').select('*').eq('exam_id', examId).order('created_at'),
    ])

    setCls(clsRes.data || null)
    setSubj(subRes.data || null)
    setQuestions((qRes.data || []) as Question[])

    setLoading(false)
  }, [examId, showToast])

  useEffect(() => { loadAll() }, [loadAll])

  /* -------------------- UPDATE EXAM -------------------- */
  async function updateExam(patch: Partial<Exam>) {
    if (!exam) return false
    const { error } = await supabase.from('cbt_exams').update(patch).eq('id', exam.id)
    if (error) {
      showToast(`Update failed: ${error.message}`, 'error')
      return false
    }
    setExam((prev) => prev ? { ...prev, ...patch } : prev)
    return true
  }

  /* -------------------- PUBLISH / UNPUBLISH -------------------- */
  async function togglePublish() {
    if (!exam) return
    if (exam.status === 'draft') {
      const { data: existing, error: chkErr } = await supabase
        .from('cbt_exams')
        .select('id, title')
        .eq('class_id', exam.class_id)
        .eq('subject_id', exam.subject_id)
        .eq('term', exam.term)
        .eq('session', exam.session)
        .eq('status', 'published')
        .neq('id', exam.id)
        .maybeSingle()

      if (chkErr) { showToast(`Check failed: ${chkErr.message}`, 'error'); return }

      if (existing) {
        showToast(
          `Another published exam already exists for ${cls?.name} · ${subj?.name} · ${exam.term}. Unpublish it first.`,
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
        `Students in ${cls?.name} will see this exam immediately (subject to the availability window). Continue?`,
        async () => {
          const ok = await updateExam({
            status: 'published',
            published_at: new Date().toISOString(),
          })
          if (ok) {
            showToast('Exam published.')
          }
        }
      )
    } else {
      askConfirm(
        'Unpublish Exam?',
        'Students will no longer see this exam. Any in-progress attempts remain.',
        async () => {
          const ok = await updateExam({ status: 'draft' })
          if (ok) showToast('Exam unpublished.', 'warn')
        }
      )
    }
  }

  /* -------------------- DELETE EXAM -------------------- */
  function deleteExam() {
    if (!exam) return
    askConfirm(
      'Delete Exam?',
      `Permanently delete "${exam.title}", all ${questions.length} questions, and any attempts. This cannot be undone.`,
      async () => {
        const { error } = await supabase.from('cbt_exams').delete().eq('id', exam.id)
        if (error) { showToast(`Delete failed: ${error.message}`, 'error'); return }
        showToast('Exam deleted.', 'warn')
        onBack()
      }
    )
  }

  /* -------------------- DELETE QUESTION -------------------- */
  function deleteQuestion(q: Question) {
    askConfirm('Delete Question?', 'This question will be permanently removed.', async () => {
      const { error } = await supabase.from('cbt_questions').delete().eq('id', q.id)
      if (error) { showToast(`Delete failed: ${error.message}`, 'error'); return }
      showToast('Question removed.', 'warn')
      await loadAll()
    })
  }

  /* -------------------- COMPUTED -------------------- */
  const totalMarks = useMemo(() => {
    return questions.reduce((sum, q) => sum + (q.marks || 0), 0)
  }, [questions])

  const objectiveCount = questions.filter((q) => q.type === 'objective').length
  const theoryCount = questions.filter((q) => q.type === 'theory').length

  /* -------------------- RENDER -------------------- */
  if (loading) {
    return (
      <>
        <GlobalStyles />
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <p className="text-sm text-gray-500 italic">Loading exam…</p>
        </div>
      </>
    )
  }

  if (!exam) {
    return (
      <>
        <GlobalStyles />
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-8 text-center max-w-md">
            <h2 className="font-bold text-[#0A1E3D] text-lg">Exam not found</h2>
            <p className="text-sm text-gray-500 mt-2">It may have been deleted.</p>
            <button onClick={onBack} className="mt-5 bg-amber-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-amber-600">
              ← Back to Exams
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-slate-50 flex flex-col">

        {/* HEADER */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
            <button onClick={onBack} className="text-xs font-bold text-gray-500 hover:text-[#0A1E3D] mb-3 inline-flex items-center gap-1">
              ← Back to Exams
            </button>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black text-[#0A1E3D] truncate">{exam.title}</h1>
                <p className="text-xs text-gray-500 mt-1">
                  {cls?.name || '—'} · {subj?.name || '—'} · {exam.term} · {exam.session}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ring-1 uppercase ${exam.status === 'published' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                    {exam.status}
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
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white transition ${exam.status === 'published' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {exam.status === 'published' ? 'Unpublish' : '🚀 Publish'}
                </button>
                <button onClick={deleteExam} className="px-4 py-2.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* TABS */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1">
            {(['setup', 'questions', 'preview'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-3 text-xs font-bold border-b-2 transition ${
                  tab === t ? 'border-amber-500 text-[#0A1E3D]' : 'border-transparent text-gray-500 hover:text-[#0A1E3D]'
                }`}
              >
                {t === 'setup' && 'Setup'}
                {t === 'questions' && `Questions (${questions.length})`}
                {t === 'preview' && 'Preview'}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT */}
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">
          {tab === 'setup' && (
            <SetupTab
              exam={exam}
              totalMarks={totalMarks}
              objectiveCount={objectiveCount}
              theoryCount={theoryCount}
              onSave={updateExam}
              showToast={showToast}
            />
          )}
          {tab === 'questions' && (
            <QuestionsTab
              examId={exam.id}
              exam={exam}
              questions={questions}
              onReload={loadAll}
              showToast={showToast}
              onDelete={deleteQuestion}
            />
          )}
          {tab === 'preview' && (
            <PreviewTab exam={exam} questions={questions} />
          )}
        </main>

        <footer className="px-6 py-4 text-center text-[11px] text-gray-500 border-t border-slate-200 bg-white/50">
          Ibadu Rahman International School · Exam Detail · {new Date().getFullYear()}
        </footer>

        {/* TOASTS */}
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

        {/* CONFIRM */}
        {confirmState && (
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <h3 className="font-bold text-[#0A1E3D] text-base">{confirmState.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{confirmState.message}</p>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setConfirmState(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-slate-100">Cancel</button>
                <button onClick={() => { confirmState.onConfirm(); setConfirmState(null) }} className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700">Confirm</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/* ============================================================================
   TAB: SETUP
   ============================================================================ */

function SetupTab({
  exam, totalMarks, objectiveCount, theoryCount, onSave, showToast,
}: {
  exam: Exam
  totalMarks: number
  objectiveCount: number
  theoryCount: number
  onSave: (patch: Partial<Exam>) => Promise<boolean>
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
    if (!draft.title.trim()) { showToast('Title is required.', 'error'); return }
    if (draft.duration_minutes <= 0) { showToast('Duration must be positive.', 'error'); return }

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
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="font-semibold text-[#0A1E3D]">Exam Setup</h2>
          <p className="text-xs text-gray-500 mt-0.5">Configure how the exam behaves for students.</p>
        </div>
        <div className="p-5 space-y-4">
          <FormField label="Exam Title" required>
            <input
              required
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Duration (minutes)" required>
              <input
                type="number"
                min={1}
                required
                value={draft.duration_minutes}
                onChange={(e) => setDraft({ ...draft, duration_minutes: Number(e.target.value) })}
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none"
              />
            </FormField>
            <FormField label="Max Attempts">
              <input
                type="number"
                min={1}
                value={draft.max_attempts}
                onChange={(e) => setDraft({ ...draft, max_attempts: Number(e.target.value) })}
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl outline-none"
              />
            </FormField>
          </div>

          <FormField label="Instructions for Students">
            <textarea
              rows={3}
              value={draft.instructions}
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
              placeholder="e.g. No calculators allowed. Read each question carefully."
              className="w-full text-sm p-3 bg-white border border-amber-200 rounded-xl outline-none resize-none"
            />
          </FormField>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="font-semibold text-[#0A1E3D]">Availability Window</h2>
          <p className="text-xs text-gray-500 mt-0.5">Students can only start the exam within this window. Leave blank = available immediately when published.</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Start (optional)">
            <input
              type="datetime-local"
              value={draft.start_at}
              onChange={(e) => setDraft({ ...draft, start_at: e.target.value })}
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none"
            />
          </FormField>
          <FormField label="End (optional)">
            <input
              type="datetime-local"
              value={draft.end_at}
              onChange={(e) => setDraft({ ...draft, end_at: e.target.value })}
              className="w-full text-sm px-3 py-2.5 bg-white border border-amber-200 rounded-xl outline-none"
            />
          </FormField>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="font-semibold text-[#0A1E3D]">Randomization</h2>
          <p className="text-xs text-gray-500 mt-0.5">Varies the exam for each student to reduce copying.</p>
        </div>
        <div className="p-5 space-y-3">
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

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-[11px] font-bold uppercase text-gray-500">Objective</p>
            <p className="text-2xl font-black text-[#0A1E3D] mt-1">{objectiveCount}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-gray-500">Theory</p>
            <p className="text-2xl font-black text-[#0A1E3D] mt-1">{theoryCount}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-gray-500">Total Marks</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{totalMarks}</p>
          </div>
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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
      />
      <span className="text-sm font-medium text-[#0A1E3D]">{label}</span>
    </label>
  )
}

/* ============================================================================
   TAB: QUESTIONS
   ============================================================================ */

function QuestionsTab({
  examId, exam, questions, onReload, showToast, onDelete,
}: {
  examId: string
  exam: Exam
  questions: Question[]
  onReload: () => void
  showToast: (m: string, t?: Toast['tone']) => void
  onDelete: (q: Question) => void
}) {
  const [preview, setPreview] = useState<{ rows: any[]; errors: string[] } | null>(null)
  const [importing, setImporting] = useState(false)

  function downloadSample() {
    const rows: any[][] = [
      ['type', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'marks', 'theory_answer_guide'],
      ['objective', 'What is 2 + 2?', '3', '4', '5', '6', 'B', 1, ''],
      ['objective', 'Capital of Nigeria?', 'Lagos', 'Abuja', 'Kano', 'Ibadan', 'B', 1, ''],
      ['theory', 'Explain the process of photosynthesis.', '', '', '', '', '', 5, 'Chlorophyll absorbs light energy, converts CO2 and H2O into glucose and oxygen...'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [
      { wch: 12 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 8 }, { wch: 44 },
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
    const iA = idx('option_a')
    const iB = idx('option_b')
    const iC = idx('option_c')
    const iD = idx('option_d')
    const iCorrect = idx('correct_answer')
    const iMarks = idx('marks')
    const iGuide = idx('theory_answer_guide')

    if (iQ === -1) { errors.push('Missing "question" column'); return { rows: parsed, errors } }

    rows.slice(1).forEach((r, i) => {
      const rowNum = i + 2
      const typeRaw = String(iType !== -1 ? r[iType] : 'objective').trim().toLowerCase()
      const type = typeRaw === 'theory' ? 'theory' : 'objective'
      const question = String(r[iQ] ?? '').trim()
      const a = iA !== -1 ? String(r[iA] ?? '').trim() : ''
      const b = iB !== -1 ? String(r[iB] ?? '').trim() : ''
      const c = iC !== -1 ? String(r[iC] ?? '').trim() : ''
      const d = iD !== -1 ? String(r[iD] ?? '').trim() : ''
      const correct = (iCorrect !== -1 ? String(r[iCorrect] ?? '').trim().toUpperCase() : '')
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
        theory_answer_guide: type === 'theory' ? (guide || null) : null,
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
        const raw = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, defval: '' })
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

    if (error) { showToast(`Insert failed: ${error.message}`, 'error'); return }

    const hasTheory = valid.some((r) => r.type === 'theory')
    if (hasTheory && !exam.has_theory) {
      await supabase.from('cbt_exams').update({ has_theory: true }).eq('id', examId)
    }

    showToast(`${valid.length} question(s) imported.`)
    setPreview(null)
    onReload()
  }

  const validCount = preview?.rows.filter((r) => r.errors.length === 0).length ?? 0
  const errorCount = preview?.errors.length ?? 0

  return (
    <div className="space-y-5">
      {/* UPLOAD CARD */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[#0A1E3D]">Bulk Question Upload</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Columns: <span className="font-mono">type, question, option_a..d, correct_answer, marks, theory_answer_guide</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadSample} className="inline-flex items-center gap-2 text-xs font-semibold bg-[#0A1E3D] text-white px-3.5 py-2 rounded-lg hover:bg-black">
              📥 Sample Excel
            </button>
            <label className="inline-flex items-center gap-2 text-xs font-semibold bg-amber-500 text-white px-3.5 py-2 rounded-lg hover:bg-amber-600 cursor-pointer">
              📤 Upload Excel
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" />
            </label>
          </div>
        </div>

        {preview && (
          <div className="p-5 bg-slate-50 border-b border-slate-100 space-y-3">
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 font-semibold">{validCount} ready</span>
              {errorCount > 0 && <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 font-semibold">{errorCount} error(s)</span>}
            </div>
            {errorCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
                {preview.errors.slice(0, 8).map((e, i) => <div key={i}>• {e}</div>)}
                {preview.errors.length > 8 && <div>• and {preview.errors.length - 8} more…</div>}
              </div>
            )}
            {validCount > 0 && (
              <div className="overflow-x-auto max-h-64 rounded-xl ring-1 ring-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-gray-700 text-[10px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Question</th>
                      <th className="px-3 py-2 text-center">Marks</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.slice(0, 60).map((r, i) => (
                      <tr key={i} className={r.errors.length ? 'bg-red-50/40' : ''}>
                        <td className="px-3 py-2 font-mono text-gray-500">{r.rowNum}</td>
                        <td className="px-3 py-2 uppercase text-[10px] font-bold">{r.type}</td>
                        <td className="px-3 py-2 max-w-md truncate">{r.question_text}</td>
                        <td className="px-3 py-2 text-center font-bold">{r.marks}</td>
                        <td className="px-3 py-2">
                          {r.errors.length === 0
                            ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Ready</span>
                            : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200">{r.errors.length} err</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setPreview(null)} className="text-xs font-semibold px-4 py-2 rounded-lg text-gray-700 hover:bg-red-50">Cancel</button>
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

      {/* EXISTING QUESTIONS */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="font-semibold text-[#0A1E3D]">Existing Questions ({questions.length})</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {questions.filter((q) => q.type === 'objective').length} objective · {questions.filter((q) => q.type === 'theory').length} theory · {questions.reduce((a, b) => a + b.marks, 0)} marks total
          </p>
        </div>
        {questions.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-400 italic">
            No questions yet. Upload a CSV/Excel above to get started.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-gray-700 text-[11px] uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Question</th>
                  <th className="px-4 py-3 text-center">Correct</th>
                  <th className="px-4 py-3 text-center">Marks</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questions.map((q, i) => (
                  <tr key={q.id} className="hover:bg-amber-50/50">
                    <td className="px-4 py-3 font-mono text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${q.type === 'theory' ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>
                        {q.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-md text-gray-800">{q.question_text}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold">{q.type === 'objective' ? q.correct_answer : '—'}</td>
                    <td className="px-4 py-3 text-center font-bold">{q.marks}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => onDelete(q)} className="text-red-700 hover:text-red-800 font-semibold text-[11px]">Delete</button>
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
   TAB: PREVIEW
   ============================================================================ */

function PreviewTab({ exam, questions }: { exam: Exam; questions: Question[] }) {
  return (
    <div className="space-y-5 max-w-3xl">
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
        <div key={q.id} className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <div className="flex items-start gap-3 mb-3">
            <span className="shrink-0 w-7 h-7 rounded-lg bg-[#0A1E3D] text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
            <p className="font-medium text-sm text-[#0A1E3D] flex-1">{q.question_text}</p>
            <span className="text-[10px] font-bold text-gray-500 shrink-0">{q.marks} mark{q.marks === 1 ? '' : 's'}</span>
          </div>
          {q.type === 'objective' ? (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-10">
              {(['A', 'B', 'C', 'D'] as const).map((k) => {
                const txt = (q as any)[`option_${k.toLowerCase()}`]
                const isCorrect = q.correct_answer === k
                return (
                  <li key={k} className={`px-3 py-2 rounded-lg text-xs ${isCorrect ? 'bg-emerald-50 ring-1 ring-emerald-200 text-emerald-800 font-semibold' : 'bg-slate-50 ring-1 ring-slate-200 text-gray-700'}`}>
                    <span className="font-bold mr-2">{k}.</span>{txt} {isCorrect && '✓'}
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="ml-10">
              <textarea
                disabled
                placeholder="Students will type their answer here."
                className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-lg resize-none"
                rows={3}
              />
              {q.theory_answer_guide && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Show answer guide (admin only)</summary>
                  <p className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 italic">{q.theory_answer_guide}</p>
                </details>
              )}
            </div>
          )}
        </div>
      ))}

      {questions.length === 0 && (
        <div className="text-center py-12 text-xs text-gray-400 italic border-2 border-dashed border-slate-200 rounded-2xl">
          No questions to preview yet.
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   SHARED
   ============================================================================ */

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-[#0A1E3D] mb-1">
        {label} {required && <span className="text-amber-600">*</span>}
      </label>
      {children}
    </div>
  )
}