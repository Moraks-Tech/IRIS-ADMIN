'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/* ============================================================
   TYPES + CONSTANTS
   ============================================================ */

type TabId =
  | 'home'
  | 'leadership'
  | 'pta'
  | 'islamic'
  | 'admission'
  | 'preschool'
  | 'primary'
  | 'junior'
  | 'senior'
  | 'contact'

const VALID_TABS: TabId[] = [
  'home', 'leadership', 'pta', 'islamic', 'admission',
  'preschool', 'primary', 'junior', 'senior', 'contact',
]

/* ------------------------------------------------------------
   IMAGES
   Replace any URL below with your own uploads later.
   Everything is driven by this single object.
   ------------------------------------------------------------ */
const IMAGES = {
  logo: 'https://github.com/Moraks-Tech/Ibadurahmaninternationalschool/blob/main/logo.jpg?raw=true',
  hero: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1600&q=80',
  preschool:
    'https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=1200&q=80',
  primary:
    'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80',
  primaryGraduation:
    'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1200&q=80',
  junior:
    'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1200&q=80',
  juniorGraduation:
    'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
  seniorClassroom:
    'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80',
  chemistryLab:
    'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80',
  physicsLab:
    'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80',
}

const CONTACT = {
  address: '57, Unity Street, Papa Ibafo, Ogun State',
  phones: ['09152625084'],
  email: 'morakstech02@gmail.com',
  website: '',
}

const NAV: { label: string; tab?: TabId; children?: { label: string; tab: TabId }[] }[] = [
  { label: 'Home', tab: 'home' },
  {
    label: 'About',
    children: [
      { label: 'School Leadership', tab: 'leadership' },
      { label: 'PTA', tab: 'pta' },
      { label: "Islamic & Qur'anic", tab: 'islamic' },
    ],
  },
  {
    label: 'Admission',
    children: [{ label: 'Compulsory Documents & Guide', tab: 'admission' }],
  },
  {
    label: 'Academics',
    children: [
      { label: 'Preschool', tab: 'preschool' },
      { label: 'Primary School', tab: 'primary' },
      { label: 'Junior High School', tab: 'junior' },
      { label: 'Senior High School', tab: 'senior' },
    ],
  },
  { label: 'Contact', tab: 'contact' },
]

/* ============================================================
   MAIN PAGE
   ============================================================ */

export default function PublicHomePage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // --- Read initial tab from URL hash on mount ---
  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as TabId
    if (VALID_TABS.includes(hash)) setActiveTab(hash)
  }, [])

  // --- Listen for browser back/forward + manual hash changes ---
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '') as TabId
      if (VALID_TABS.includes(hash)) setActiveTab(hash)
      else setActiveTab('home')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // --- Change tab: update state + URL hash + scroll top ---
  const navigate = useCallback((tab: TabId) => {
    setActiveTab(tab)
    setMobileMenuOpen(false)
    if (window.location.hash !== `#${tab}`) {
      window.history.pushState(null, '', `#${tab}`)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50">
      <div>
        <Header
          activeTab={activeTab}
          onNavigate={navigate}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
          onLogin={() => router.push('/login')}
        />

        {/* ================= MAIN CONTENT ================= */}
        {activeTab === 'home' && <HomeSection onNavigate={navigate} onLogin={() => router.push('/login')} />}
        {activeTab === 'leadership' && <LeadershipSection onNavigate={navigate} />}
        {activeTab === 'pta' && <PTASection onNavigate={navigate} />}
        {activeTab === 'islamic' && <IslamicSection onNavigate={navigate} />}
        {activeTab === 'admission' && <AdmissionSection onNavigate={navigate} onLogin={() => router.push('/login')} />}
        {activeTab === 'preschool' && <PreschoolSection onNavigate={navigate} />}
        {activeTab === 'primary' && <PrimarySection onNavigate={navigate} />}
        {activeTab === 'junior' && <JuniorSection onNavigate={navigate} />}
        {activeTab === 'senior' && <SeniorSection onNavigate={navigate} />}
        {activeTab === 'contact' && <ContactSection onNavigate={navigate} />}
      </div>

      <Footer />
    </div>
  )
}

/* ============================================================
   HEADER + NAVIGATION
   ============================================================ */

function Header({
  activeTab,
  onNavigate,
  mobileMenuOpen,
  setMobileMenuOpen,
  onLogin,
}: {
  activeTab: TabId
  onNavigate: (t: TabId) => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (v: boolean) => void
  onLogin: () => void
}) {
  return (
    <header className="bg-[#0A1E3D] text-white shadow-lg sticky top-0 z-50 border-b-2 border-amber-400">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
        {/* Logo */}
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg p-1"
        >
          <img
            src={IMAGES.logo}
            alt="Ibadu Rahman International School logo"
            className="w-12 h-12 object-contain rounded-full bg-white p-1 shadow"
          />
          <div className="text-left">
            <h1 className="text-xs md:text-sm font-black tracking-wider">
              IBADU RAHMAN INTERNATIONAL SCHOOL
            </h1>
            <p className="text-[11px] text-amber-300 italic font-bold">
              Motto: &quot;Quest for Excellence&quot;
            </p>
          </div>
        </button>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-bold">
          {NAV.map((item) =>
            item.children ? (
              <NavDropdown
                key={item.label}
                label={item.label}
                items={item.children}
                onNavigate={onNavigate}
              />
            ) : (
              <button
                key={item.label}
                onClick={() => onNavigate(item.tab!)}
                className={`hover:text-amber-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded px-1 ${
                  activeTab === item.tab ? 'text-amber-300 underline' : ''
                }`}
              >
                {item.label}
              </button>
            )
          )}
          <button
            onClick={onLogin}
            className="bg-amber-500 px-4 py-2 rounded-lg text-white text-sm font-bold hover:bg-amber-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            School Portal
          </button>
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
          className="lg:hidden text-white text-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded p-1"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && <MobileMenu onNavigate={onNavigate} onLogin={onLogin} />}
    </header>
  )
}

function NavDropdown({
  label,
  items,
  onNavigate,
}: {
  label: string
  items: { label: string; tab: TabId }[]
  onNavigate: (t: TabId) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="hover:text-amber-300 transition flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded px-1"
      >
        {label} <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 w-56 bg-white text-[#0A1E3D] shadow-xl rounded-xl py-2 border border-amber-200 z-50"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                onNavigate(it.tab)
                setOpen(false)
              }}
              className="block w-full text-left px-4 py-2 hover:bg-amber-50 text-sm font-semibold focus-visible:outline-none focus-visible:bg-amber-50"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MobileMenu({
  onNavigate,
  onLogin,
}: {
  onNavigate: (t: TabId) => void
  onLogin: () => void
}) {
  const links: { label: string; tab: TabId }[] = [
    { label: 'Home', tab: 'home' },
    { label: 'School Leadership', tab: 'leadership' },
    { label: 'PTA', tab: 'pta' },
    { label: "Islamic & Qur'anic Foundation", tab: 'islamic' },
    { label: 'Admission Requirements', tab: 'admission' },
    { label: 'Preschool', tab: 'preschool' },
    { label: 'Primary School', tab: 'primary' },
    { label: 'Junior High School', tab: 'junior' },
    { label: 'Senior High School', tab: 'senior' },
    { label: 'Contact', tab: 'contact' },
  ]
  return (
    <div className="lg:hidden bg-[#051228] text-white px-6 py-4 space-y-3 border-t border-amber-400">
      {links.map((l) => (
        <button
          key={l.label}
          onClick={() => onNavigate(l.tab)}
          className="block w-full text-left text-sm font-bold hover:text-amber-300"
        >
          {l.label}
        </button>
      ))}
      <button
        onClick={() => {
          onLogin()
        }}
        className="w-full bg-amber-500 text-center py-2 rounded-lg text-sm font-bold hover:bg-amber-400"
      >
        School Portal Login
      </button>
    </div>
  )
}

/* ============================================================
   REUSABLE BUILDING BLOCKS
   ============================================================ */

function SectionHero({
  badge,
  title,
  subtitle,
}: {
  badge: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-8">
      <span className="text-amber-700 font-black text-xs uppercase tracking-widest bg-amber-100 px-3 py-1 rounded-full">
        {badge}
      </span>
      <h2 className="text-3xl md:text-4xl font-black text-[#0A1E3D] mt-3 mb-3">{title}</h2>
      {subtitle && (
        <p className="text-sm md:text-base text-gray-700 font-medium max-w-2xl">{subtitle}</p>
      )}
    </div>
  )
}

function InfoCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-white p-6 md:p-8 rounded-3xl shadow-xl border-2 border-amber-200 space-y-4 transition hover:shadow-2xl ${className}`}
    >
      {children}
    </div>
  )
}

function ContactBlock() {
  return (
    <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl border-2 border-amber-200 text-center space-y-4">
      <h4 className="text-lg font-extrabold text-[#0A1E3D]">Contact Our Admissions Office</h4>
      <p className="text-sm text-gray-700 font-medium">Address: {CONTACT.address}</p>
      <div className="flex justify-center gap-3 flex-wrap text-xs font-extrabold text-amber-700">
        {CONTACT.phones.map((p) => (
          <span key={p} className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg">
            Phone: {p}
          </span>
        ))}
      </div>
      <p className="text-sm font-bold text-gray-700">Email: {CONTACT.email}</p>
    </div>
  )
}

function DepartmentCard({
  name,
  blurb,
  subjects,
}: {
  name: string
  blurb: string
  subjects: string
}) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-amber-200 space-y-3">
      <h4 className="font-extrabold text-[#0A1E3D] text-base border-b pb-2 border-amber-100">
        {name}
      </h4>
      <p className="text-sm text-gray-600">{blurb}</p>
      <ul className="text-sm text-gray-700 space-y-1.5 list-disc pl-4 font-medium">
        {subjects}
      </ul>
    </div>
  )
}

function BackToHome({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  return (
    <div className="pt-6">
      <button
        onClick={() => onNavigate('home')}
        className="bg-amber-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-amber-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        ← Back to Home
      </button>
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className="py-16 md:py-20 px-6">
      <div className="max-w-4xl mx-auto">{children}</div>
    </section>
  )
}

/* ============================================================
   1. HOME
   ============================================================ */

function HomeSection({
  onNavigate,
  onLogin,
}: {
  onNavigate: (t: TabId) => void
  onLogin: () => void
}) {
  return (
    <div>
      {/* HERO */}
      <section
        className="relative text-white py-24 md:py-32 px-6 text-center border-b-4 border-amber-500 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(rgba(10,30,61,0.55), rgba(6,26,51,0.85)), url('${IMAGES.hero}')`,
        }}
      >
        <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center">
          <img
            src={IMAGES.logo}
            alt="Ibadu Rahman International School Logo"
            className="w-28 h-28 md:w-36 md:h-36 object-contain bg-white rounded-full p-2 shadow-2xl mb-6 border-4 border-amber-400"
          />
          <span className="bg-amber-500 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow mb-3">
            Motto: &quot;Quest for Excellence&quot;
          </span>
          <h2 className="text-3xl md:text-5xl font-black mt-2 mb-6 tracking-tight leading-tight drop-shadow-md">
            Welcome to Ibadu Rahman International School
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => onNavigate('admission')}
              className="bg-amber-500 text-white px-8 py-3 rounded-xl font-black text-sm shadow-xl hover:bg-amber-400 transition"
            >
              Explore Admissions
            </button>
            <button
              onClick={onLogin}
              className="bg-white text-[#0A1E3D] px-8 py-3 rounded-xl font-black text-sm shadow-xl hover:bg-amber-100 transition"
            >
              Portal Login
            </button>
          </div>
        </div>
      </section>

      {/* WELCOME */}
      <Section>
        <InfoCard>
          <h3 className="text-amber-700 font-extrabold text-base uppercase tracking-wide text-center">
            Warm Welcome Address
          </h3>
          <p className="text-sm md:text-base text-gray-800 font-medium leading-relaxed">
            Assalamu Alaikum Warahmatullah Wabarakaatuh. You are warmly welcomed to Ibadu Rahman
            International School. We take immense pride in grooming young minds to achieve academic
            brilliance fused with solid moral, spiritual uprightness, and modern technological
            skills. Explore our comprehensive sections to discover how we build tomorrow&apos;s
            leaders today!
          </p>
        </InfoCard>
      </Section>

      {/* WHY US */}
      <Section>
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-amber-700 font-black text-xs uppercase tracking-widest bg-amber-100 px-3 py-1 rounded-full">
            Why Choose Us
          </span>
          <h3 className="text-2xl md:text-4xl font-black text-[#0A1E3D] mt-3 mb-4">
            Our Foundational Pillars &amp; Modern Innovation
          </h3>
          <p className="text-sm md:text-base text-gray-700 font-medium">
            We combine uncompromised Western academic standards, spiritual piety, and advanced
            digital vocational training under one roof.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
          <PillarCard
            num="01"
            title="Our Vision"
            body="To build a world-class institution that raises a generation of God-fearing intellectuals equipped with modern technical and academic competencies to transform society."
          />
          <PillarCard
            num="02"
            title="Our Mission"
            body="To deliver robust Western education seamlessly blended with pristine Islamic teachings, dedicated teaching staff, modern e-learning facilities, and practical vocational training."
          />
          <PillarCard
            num="03"
            title="Core Values"
            body="Piety (Taqwa), Integrity, Academic Rigor, Discipline, Diligence, and Timely Technological Adaptability for every student under our care."
          />
        </div>

        {/* CBT + Vocational highlight */}
        <div className="bg-gradient-to-r from-[#0A1E3D] to-[#061A33] rounded-3xl p-8 md:p-12 text-white shadow-2xl border-2 border-amber-400 space-y-6 mb-14">
          <span className="bg-amber-500 text-white px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest">
            State-of-the-Art Training
          </span>
          <h3 className="text-2xl md:text-3xl font-black">
            Advanced Computer-Based Testing (CBT) &amp; Vocational Skills
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-amber-100 font-medium leading-relaxed">
            <div className="bg-white/10 p-6 rounded-2xl border border-amber-300/30 space-y-2">
              <h4 className="font-extrabold text-amber-300 text-base">
                CBT Exams &amp; Digital Literacy
              </h4>
              <p>
                Our students are fully trained using computers and digital tools. They regularly
                write Computer-Based Testing (CBT) examinations, ensuring complete readiness for
                modern external exams like BECE, WASSCE, and UTME without computer anxiety.
              </p>
            </div>
            <div className="bg-white/10 p-6 rounded-2xl border border-amber-300/30 space-y-2">
              <h4 className="font-extrabold text-amber-300 text-base">
                Vocational &amp; Hardware Training
              </h4>
              <p>
                Beyond regular classes, we equip our students with practical technical skills. We
                teach phone repair, phone installation, and computer hardware repairs, ensuring they
                graduate with both certificates and hands-on empowerment.
              </p>
            </div>
          </div>
        </div>

        <ContactBlock />
      </Section>
    </div>
  )
}

function PillarCard({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="bg-white p-8 rounded-3xl shadow-xl border-2 border-amber-200 space-y-3 transition hover:-translate-y-1">
      <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center font-bold text-sm">
        {num}
      </div>
      <h4 className="font-extrabold text-[#0A1E3D] text-base">{title}</h4>
      <p className="text-sm text-gray-700 leading-relaxed font-medium">{body}</p>
    </div>
  )
}

/* ============================================================
   2. LEADERSHIP
   ============================================================ */

function LeadershipSection({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  return (
    <Section>
      <SectionHero badge="About Us" title="School Leadership" />
      <InfoCard>
        <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
          The leadership team at <strong>Ibadu Rahman International School</strong> comprises
          seasoned educational administrators, disciplined mentors, and dedicated scholars
          committed to raising standards of excellence.
        </p>
        <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
          We ensure that every policy, curriculum choice, and extracurricular activity directly
          aligns with our core mission: combining uncompromised Western academic rigor with sound
          Islamic moral upbringing.
        </p>
      </InfoCard>
      <BackToHome onNavigate={onNavigate} />
    </Section>
  )
}

/* ============================================================
   3. PTA
   ============================================================ */

function PTASection({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  return (
    <Section>
      <SectionHero badge="About Us" title="Parents-Teachers Association (PTA)" />
      <InfoCard>
        <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
          Our PTA is an active, collaborative body uniting parents and teachers. We believe that a
          child&apos;s success is a shared responsibility between the home and the classroom.
        </p>
        <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
          Regular meetings and joint initiatives help us maintain open communication channels,
          address developmental milestones, and organize wholesome school community events.
        </p>
      </InfoCard>
      <BackToHome onNavigate={onNavigate} />
    </Section>
  )
}

/* ============================================================
   4. ISLAMIC
   ============================================================ */

function IslamicSection({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  return (
    <Section>
      <SectionHero badge="Spiritual Foundation" title="Islamic & Qur'anic Foundation" />
      <InfoCard>
        <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
          At Ibadu Rahman International School, moral integrity is paramount. Our Islamic studies
          curriculum is integrated into the daily routine.
        </p>
        <ul className="list-disc pl-5 space-y-2 text-sm md:text-base text-gray-700 font-medium">
          <li>Quranic Recitation and Hifz (Memorization) with proper Tajweed rules.</li>
          <li>Hadith teachings and noble Prophetic manners (Akhlaq).</li>
          <li>Arabic language proficiency for complete spiritual and cultural grounding.</li>
        </ul>
      </InfoCard>
      <BackToHome onNavigate={onNavigate} />
    </Section>
  )
}

/* ============================================================
   5. ADMISSION
   ============================================================ */

function AdmissionSection({
  onNavigate,
  onLogin,
}: {
  onNavigate: (t: TabId) => void
  onLogin: () => void
}) {
  const docs = [
    <>
      Original and photocopies of the applicant&apos;s <strong>Birth Certificate</strong> or
      Declaration of Age.
    </>,
    <>
      Four (4) recent colored <strong>passport photographs</strong> with clear background.
    </>,
    <>
      Previous terminal report card or transfer certificate from the immediate past school
      attended.
    </>,
    <>Medical fitness report or vaccination history card.</>,
    <>
      <strong>Learner Identification Number (LIN)</strong> — if the applicant already has one.
      This is optional; only a few students currently have it.
    </>,
  ]
  return (
    <Section>
      <SectionHero
        badge="Admissions"
        title="Admission & Compulsory Documents"
        subtitle="When visiting the school for physical admission processing, please ensure you come along with the following compulsory documents for submission:"
      />
      <InfoCard>
        <div className="space-y-3">
          {docs.map((d, i) => (
            <div
              key={i}
              className="flex items-start gap-3 bg-amber-50 p-4 rounded-xl border border-amber-200 text-sm md:text-base text-gray-700"
            >
              <span className="text-amber-700 font-bold text-xs bg-white px-2 py-1 rounded shadow-sm shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span>{d}</span>
            </div>
          ))}
        </div>
        <div className="pt-4 flex gap-3 flex-wrap">
          <button
            onClick={onLogin}
            className="bg-amber-500 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-amber-400 transition"
          >
            Apply or Login via Portal
          </button>
          <button
            onClick={() => onNavigate('home')}
            className="bg-gray-200 text-gray-800 px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-300 transition"
          >
            ← Back to Home
          </button>
        </div>
      </InfoCard>
    </Section>
  )
}

/* ============================================================
   6. PRESCHOOL
   ============================================================ */

function PreschoolSection({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  return (
    <Section>
      <SectionHero
        badge="Academics"
        title="Preschool Section"
        subtitle="Our preschool section provides a warm, stimulating environment where young learners engage in joyful early learning."
      />
      <InfoCard>
        <div className="rounded-2xl overflow-hidden shadow-md h-72 bg-gray-100">
          <img
            src={IMAGES.preschool}
            alt="Preschool students learning"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <h3 className="text-lg font-extrabold text-[#0A1E3D]">
          Classroom Activities, CBT Prep &amp; Engaging Games
        </h3>
        <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
          In our preschool classes, children experience a perfect blend of structured learning and
          interactive play. We offer a series of stimulating classroom games such as alphabet
          matching puzzles, counting blocks, shape sorters, and introductory computer/tablet
          learning games. Our outdoor activities include sensory garden walks, playground motor
          skill games, and swing sets that encourage sharing, discipline, and modest Islamic values
          right from early childhood.
        </p>
      </InfoCard>
      <BackToHome onNavigate={onNavigate} />
    </Section>
  )
}

/* ============================================================
   7. PRIMARY
   ============================================================ */

function PrimarySection({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  return (
    <Section>
      <SectionHero
        badge="Academics"
        title="Primary School Section"
        subtitle="Why parents choose Ibadu Rahman International School for their children's primary education."
      />
      <InfoCard>
        <div className="rounded-2xl overflow-hidden shadow-md h-72 bg-gray-100">
          <img
            src={IMAGES.primary}
            alt="Primary school classroom"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
          At <strong>Ibadu Rahman International School</strong> primary section (Primary 1 to 6),
          students experience an intensive and rewarding academic journey. We combine rigorous
          Western curricula (Mathematics, English Language, Basic Science, Social Studies, and
          Information Technology) with robust Islamic instruction, Arabic literacy, and
          Qur&apos;anic memorization.
        </p>
        <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
          Pupils are trained with computers and participate in foundational Computer-Based Testing
          (CBT) exams, spelling bees, mathematics quizzes, and debate clubs that build total
          confidence and academic excellence.
        </p>

        <div className="pt-6 border-t border-amber-200 space-y-4">
          <h3 className="text-lg font-extrabold text-[#0A1E3D]">
            Primary 6 Graduating Set Celebration
          </h3>
          <p className="text-sm text-gray-600 font-medium">
            Celebrating our primary 6 students graduating into Junior High School with outstanding
            results and exceptional moral character:
          </p>
          <div className="rounded-2xl overflow-hidden shadow-xl h-80 bg-gray-100 border-2 border-amber-300">
            <img
              src={IMAGES.primaryGraduation}
              alt="Primary 6 students graduating"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </InfoCard>
      <BackToHome onNavigate={onNavigate} />
    </Section>
  )
}

/* ============================================================
   8. JUNIOR
   ============================================================ */

function JuniorSection({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  return (
    <Section>
      <SectionHero
        badge="Academics"
        title="Junior High School & BECE Preparation"
        subtitle="Preparing pre-teens for advanced analytical thinking, computer training, and external examinations."
      />
      <InfoCard>
        <div className="rounded-2xl overflow-hidden shadow-md h-72 bg-gray-100">
          <img
            src={IMAGES.junior}
            alt="Junior High School students"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
          Junior High School (JSS 1 – 3) at Ibadu Rahman International School marks a vital
          transition into specialized subject instruction and technological advancement. Our
          students undergo rigorous training in key subjects including{' '}
          <strong>
            Mathematics, English Language, Basic Science &amp; Technology, Business Studies,
            National Values Education, Computer Studies, Islamic Studies, and Arabic Language
          </strong>
          .
        </p>
        <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
          Students actively prepare for the{' '}
          <strong>Basic Education Certificate Examination (BECE)</strong> through continuous
          assessment tests, automated Computer-Based Testing (CBT) practice sessions, and
          introductory technical training like phone installation and basic computer hardware
          maintenance.
        </p>

        <div className="pt-6 border-t border-amber-200 space-y-4">
          <h3 className="text-lg font-extrabold text-[#0A1E3D]">
            JSS 3 Graduating Students Excellence Showcase
          </h3>
          <p className="text-sm text-gray-600 font-medium">
            Our JSS 3 students celebrating their successful completion of Junior High and readiness
            for Senior School:
          </p>
          <div className="rounded-2xl overflow-hidden shadow-xl h-80 bg-gray-100 border-2 border-amber-300">
            <img
              src={IMAGES.juniorGraduation}
              alt="JSS 3 students graduating"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </InfoCard>
      <BackToHome onNavigate={onNavigate} />
    </Section>
  )
}

/* ============================================================
   9. SENIOR
   ============================================================ */

function SeniorSection({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  return (
    <Section>
      <SectionHero
        badge="Senior School & Specialized Labs"
        title="Senior High Departments & Laboratory Facilities"
        subtitle="Equipping students for WASSCE, NECO, UTME, CBT exams, and technical empowerment through structured laboratories and dedicated academic tracks."
      />

      <div className="space-y-6">
        <InfoCard>
          <h3 className="text-lg font-extrabold text-[#0A1E3D]">
            Senior School Classroom Learning
          </h3>
          <div className="rounded-2xl overflow-hidden shadow-md h-64 bg-gray-100">
            <img
              src={IMAGES.seniorClassroom}
              alt="Senior school classroom learning"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
            Our senior students experience focused, interactive lectures delivered by seasoned
            subject experts in a conducive environment that respects modest Islamic dress codes and
            headscarves.
          </p>
        </InfoCard>

        <InfoCard>
          <h3 className="text-lg font-extrabold text-[#0A1E3D]">
            Chemistry &amp; Biology Laboratory
          </h3>
          <div className="rounded-2xl overflow-hidden shadow-md h-64 bg-gray-100">
            <img
              src={IMAGES.chemistryLab}
              alt="Chemistry and Biology laboratory"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
            Our structured indoor Chemistry and Biology laboratory features fully equipped work
            stations, wall shelves, and cabinets neatly storing chemical apparatus, beakers, and
            test tubes for safe, professional practical sessions.
          </p>
        </InfoCard>

        <InfoCard>
          <h3 className="text-lg font-extrabold text-[#0A1E3D]">
            Physics Laboratory / SS2 Student Learning
          </h3>
          <div className="rounded-2xl overflow-hidden shadow-md h-64 bg-gray-100">
            <img
              src={IMAGES.physicsLab}
              alt="Physics laboratory session"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
            SS2 students actively learning and conducting scientific inquiry in our classroom
            environment, combining practical physics principles with focused academic mentorship.
          </p>
        </InfoCard>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DepartmentCard
            name="Science Department"
            blurb="For aspiring doctors, engineers, and tech innovators."
            subjects="Mathematics, Further Mathematics, Physics, Chemistry, Biology, Agricultural Science, Computer Studies, English Language, Civic Education, Islamic Studies."
          />
          <DepartmentCard
            name="Commercial Department"
            blurb="Tailored for future accountants and entrepreneurs."
            subjects="Financial Accounting, Commerce, Economics, Marketing, Data Processing, Business Management, Mathematics, English Language, Civic Education."
          />
          <DepartmentCard
            name="Arts Department"
            blurb="Built for future lawyers, diplomats, and writers."
            subjects="Literature-in-English, Government, History, Islamic Religious Studies, Arabic Language, French, Economics, Civic Education, English Language."
          />
        </div>

        <div className="bg-amber-50 p-6 md:p-8 rounded-3xl border border-amber-200 space-y-3">
          <h4 className="font-extrabold text-[#0A1E3D] text-base">
            Senior Vocational &amp; Technical Empowerment
          </h4>
          <p className="text-sm md:text-base text-gray-700 leading-relaxed font-medium">
            In addition to regular senior secondary subjects, senior students undergo practical
            training in{' '}
            <strong>phone repair, phone installation, and computer hardware repair</strong>, giving
            them a competitive technical edge before graduation.
          </p>
        </div>
      </div>

      <BackToHome onNavigate={onNavigate} />
    </Section>
  )
}

/* ============================================================
   10. CONTACT
   ============================================================ */

function ContactSection({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  return (
    <Section>
      <div className="text-center mb-8">
        <span className="text-amber-700 font-black text-xs uppercase tracking-widest bg-amber-100 px-3 py-1 rounded-full">
          Reach Us
        </span>
        <h2 className="text-3xl md:text-4xl font-black text-[#0A1E3D] mt-3">
          Get in Touch With Us
        </h2>
      </div>
      <ContactBlock />
      <BackToHome onNavigate={onNavigate} />
    </Section>
  )
}

/* ============================================================
   FOOTER
   ============================================================ */

function Footer() {
  return (
    <footer className="bg-[#061A33] text-white py-8 px-6 text-center text-xs border-t border-amber-500/30">
      <div className="max-w-6xl mx-auto space-y-2">
        <p className="font-extrabold text-amber-300 text-sm">
          {CONTACT.website || CONTACT.email}
        </p>
        <p>© 2026 Ibadu Rahman International School. All rights reserved. Quest for Excellence.</p>
      </div>
    </footer>
  )
}