'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

/* ═══════════════════════════════════════════════════════════════
   SUPABASE
   ═══════════════════════════════════════════════════════════════ */
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const VENDOR_SESSION_KEY = 'moraks.vendor.session';
const VENDOR_SESSION_HOURS = 8;

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */
type School = {
  id: number;
  name: string;
  slug: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  portal_locked: boolean;
  subscription_end_date: string | null;
  subscription_plan: string | null;
  created_at: string;
};

type Payment = {
  id: string;
  school_id: number;
  amount: number;
  term: string;
  session: string;
  reference: string | null;
  proof_url: string | null;
  status: string;
  submitted_at: string;
  submitted_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason?: string | null;
  notes?: string | null;
};

type BankAccount = {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  display_order: number;
  is_active: boolean;
};

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════ */
function escapeHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c: string) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as any)[c]);
}
function fmtNaira(n: any): string {
  return '₦' + Number(n || 0).toLocaleString('en-NG');
}
function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysUntil(d?: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d + 'T23:59:59').getTime() - Date.now()) / 86400000);
}
function timeAgo(ts?: string | null): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ═══════════════════════════════════════════════════════════════
   TOAST + CONFIRM HELPERS
   ═══════════════════════════════════════════════════════════════ */
type ToastTone = 'success' | 'error' | 'info' | 'warn';
function showToast(msg: string, tone: ToastTone = 'success') {
  const tones: Record<ToastTone, string> = { success: 'border-emerald-500', error: 'border-red-500', info: 'border-indigo-500', warn: 'border-amber-500' };
  let container = document.getElementById('moraks-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'moraks-toast-container';
    container.className = 'fixed bottom-6 right-6 z-[200] space-y-3 pointer-events-none';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-pop border-l-4 bg-slate-900 text-white ${tones[tone]} fade-in text-xs font-medium max-w-sm`;
  el.innerHTML = `<span class="w-4 h-4 shrink-0 mt-0.5 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px]">${tone === 'success' ? '✓' : tone === 'warn' ? '!' : 'i'}</span><div class="flex-1">${msg}</div>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 300);
  }, 3400);
}
function openConfirm(title: string, message: string, onConfirm: () => void) {
  const existing = document.getElementById('moraks-confirm-modal');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'moraks-confirm-modal';
  overlay.className = 'fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4';
  overlay.innerHTML = `
    <div class="bg-slate-900 rounded-2xl shadow-pop ring-1 ring-white/10 max-w-sm w-full p-6 fade-in">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-xl bg-red-500/20 ring-1 ring-red-500/40 flex items-center justify-center shrink-0">
          <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"/></svg>
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-white">${escapeHtml(title)}</h3>
          <p class="text-xs text-slate-400 mt-1">${escapeHtml(message)}</p>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button id="moraks-confirm-cancel" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition">Cancel</button>
        <button id="moraks-confirm-ok" class="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#moraks-confirm-cancel')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#moraks-confirm-ok')?.addEventListener('click', () => { overlay.remove(); onConfirm(); });
}

/* ═══════════════════════════════════════════════════════════════
   ICON
   ═══════════════════════════════════════════════════════════════ */
function Icon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    bolt: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
    dashboard: (<><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></>),
    school: (<><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01"/></>),
    card: (<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>),
    lock: (<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>),
    unlock: (<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></>),
    logout: <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />,
    settings: (<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></>),
    plus: <path d="M12 4v16m8-8H4" />,
    x: <path d="M6 6l12 12M6 18L18 6" />,
    check: <path d="M5 13l4 4L19 7" />,
    clock: (<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>),
    refresh: <path d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 00-14.9-4M4 16a8 8 0 0014.9 4" />,
    warning: <path d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />,
    arrow: <path d="M9 5l7 7-7 7" />,
    copy: (<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>),
    mail: (<><path d="M4 4h16v16H4z"/><path d="M4 4l8 7 8-7"/></>),
    phone: <path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 012.08 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />,
    trendUp: <path d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6" />,
    key: (<><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/></>),
  };
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">{paths[name] || paths.dashboard}</svg>;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function VendorPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [schools, setSchools] = useState<School[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});

  const [historyFilter, setHistoryFilter] = useState('');
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [reviewingPayment, setReviewingPayment] = useState<Payment | null>(null);
  const [extendingSchool, setExtendingSchool] = useState<School | null>(null);
  const [clock, setClock] = useState('');

  const realtimeRef = useRef<any>(null);

  /* ── BOOT ── */
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(VENDOR_SESSION_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.verified && s.expiresAt > Date.now()) {
            const { data } = await supabase.auth.getSession();
            if (!data.session) await supabase.auth.signInAnonymously();
            setLoggedIn(true);
            await loadAll();
            subscribeRealtime();
          } else {
            localStorage.removeItem(VENDOR_SESSION_KEY);
          }
        }
      } catch (e) {
        console.warn('Vendor session restore failed', e);
      }
      setAuthChecked(true);
    })();
    return () => { if (realtimeRef.current) supabase.removeChannel(realtimeRef.current); };
  }, []);

  /* ── CLOCK ── */
  useEffect(() => {
    if (!loggedIn) return;
    const update = () => setClock(new Date().toLocaleString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [loggedIn]);

  /* ── LOADERS ── */
  const loadAll = async () => {
    const [schoolsRes, paymentsRes, banksRes, settingsRes] = await Promise.all([
      supabase.from('schools').select('*').order('created_at', { ascending: false }),
      supabase.from('subscription_payments').select('*').order('submitted_at', { ascending: false }),
      supabase.from('payment_accounts').select('*').order('display_order'),
      supabase.from('platform_settings').select('*'),
    ]);
    setSchools((schoolsRes.data as School[]) || []);
    setPayments((paymentsRes.data as Payment[]) || []);
    setBankAccounts((banksRes.data as BankAccount[]) || []);
    const s: Record<string, string> = {};
    (settingsRes.data || []).forEach((r: any) => { s[r.key] = r.value; });
    setSettings(s);
  };

  const subscribeRealtime = () => {
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    realtimeRef.current = supabase
      .channel('moraks-vendor-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schools' }, () => {
        clearTimeout((window as any).__vReload);
        (window as any).__vReload = setTimeout(loadAll, 400);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_payments' }, () => {
        clearTimeout((window as any).__vReload2);
        (window as any).__vReload2 = setTimeout(loadAll, 400);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_settings' }, () => {
        clearTimeout((window as any).__vReload3);
        (window as any).__vReload3 = setTimeout(loadAll, 400);
      })
      .subscribe();
  };

  /* ── LOGIN ── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const form = e.target as HTMLFormElement;
    const pass = (form.elements.namedItem('password') as HTMLInputElement).value;
    const btn = form.querySelector('button[type=submit]') as HTMLButtonElement;
    if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }

    const { data, error } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'vendor_password')
      .maybeSingle();

    if (error || !data) {
      setLoginError('Could not verify password. Check database.');
      if (btn) { btn.disabled = false; btn.textContent = 'Unlock Console'; }
      return;
    }
    if (pass !== (data.value || '')) {
      setLoginError('Incorrect password.');
      if (btn) { btn.disabled = false; btn.textContent = 'Unlock Console'; }
      return;
    }

    const { error: authErr } = await supabase.auth.signInAnonymously();
    if (authErr) {
      setLoginError('Session error: ' + authErr.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Unlock Console'; }
      return;
    }

    localStorage.setItem(VENDOR_SESSION_KEY, JSON.stringify({
      verified: true,
      expiresAt: Date.now() + VENDOR_SESSION_HOURS * 3600 * 1000,
    }));

    setLoggedIn(true);
    await loadAll();
    subscribeRealtime();
    showToast('Console unlocked.');
    if (btn) { btn.disabled = false; btn.textContent = 'Unlock Console'; }
  };

  const handleLogout = async () => {
    localStorage.removeItem(VENDOR_SESSION_KEY);
    try { await supabase.auth.signOut(); } catch {}
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    setLoggedIn(false);
    router.refresh();
  };

  /* ── GLOBAL LOCK ── */
  const executeGlobalLock = async (message: string) => {
    const now = new Date().toISOString();
    const updates: Record<string, string | null> = {
      global_lock: 'true',
      global_lock_message: message || 'System Under Maintenance — Please check back shortly',
      global_lock_started_at: now,
      global_lock_by: 'Moraks Tech Hub',
    };
    for (const [key, value] of Object.entries(updates)) {
      const { error } = await supabase.from('platform_settings').upsert({ key, value, updated_at: now }, { onConflict: 'key' });
      if (error) { showToast('Lock failed: ' + error.message, 'error'); return; }
    }
    showToast('🔒 System locked. All schools blocked.', 'warn');
    await loadAll();
  };

  const executeGlobalUnlock = async () => {
    const now = new Date().toISOString();
    const updates: Record<string, string | null> = {
      global_lock: 'false',
      global_lock_started_at: null,
      global_lock_by: null,
    };
    for (const [key, value] of Object.entries(updates)) {
      const { error } = await supabase.from('platform_settings').upsert({ key, value, updated_at: now }, { onConflict: 'key' });
      if (error) { showToast('Unlock failed: ' + error.message, 'error'); return; }
    }
    showToast('✅ System restored.', 'success');
    await loadAll();
  };

  /* ── SCHOOL ACTIONS ── */
  const lockSchoolPortal = (school: School) => {
    openConfirm('Lock Portal?', `Lock ${school.name} entirely? Students, teachers, and admin will be blocked.`, async () => {
      const { error } = await supabase.from('schools').update({ portal_locked: true }).eq('id', school.id);
      if (error) return showToast('Failed: ' + error.message, 'error');
      showToast(`${school.name} portal locked.`, 'warn');
      await loadAll();
    });
  };

  const unlockSchoolPortal = async (school: School) => {
    const { error } = await supabase.from('schools').update({ portal_locked: false }).eq('id', school.id);
    if (error) return showToast('Failed: ' + error.message, 'error');
    showToast(`${school.name} portal unlocked.`);
    await loadAll();
  };

  const suspendSchool = (school: School) => {
    openConfirm('Suspend CBT?', `Suspend ${school.name}'s CBT access? Reports still work, no new exams.`, async () => {
      const { error } = await supabase.from('schools').update({ status: 'suspended' }).eq('id', school.id);
      if (error) return showToast('Failed: ' + error.message, 'error');
      showToast(`${school.name} CBT suspended.`, 'warn');
      await loadAll();
    });
  };

  const unsuspendSchool = async (school: School) => {
    const { error } = await supabase.from('schools').update({ status: 'active' }).eq('id', school.id);
    if (error) return showToast('Failed: ' + error.message, 'error');
    showToast(`${school.name} reactivated.`);
    await loadAll();
  };

  /* ── PAYMENT ACTIONS ── */
  const approvePayment = (payment: Payment) => {
    const school = schools.find((s) => s.id === payment.school_id);
    if (!school) return;
    const now = new Date();
    const currentEnd = school.subscription_end_date ? new Date(school.subscription_end_date + 'T23:59:59') : null;
    const startFrom = currentEnd && currentEnd > now ? currentEnd : now;
    const newEnd = new Date(startFrom);
    newEnd.setDate(newEnd.getDate() + 90);
    const newEndStr = newEnd.toISOString().slice(0, 10);

    openConfirm(
      'Approve Payment?',
      `Confirm you've verified ${fmtNaira(payment.amount)} from ${school.name}. Subscription will extend to ${fmtDate(newEndStr)}.`,
      async () => {
        const { error: pErr } = await supabase.from('subscription_payments').update({
          status: 'approved',
          approved_by: 'Moraks Tech Hub',
          approved_at: new Date().toISOString(),
        }).eq('id', payment.id);
        if (pErr) return showToast('Failed: ' + pErr.message, 'error');

        const { error: sErr } = await supabase.from('schools').update({
          subscription_end_date: newEndStr,
          subscription_plan: payment.term,
          status: 'active',
        }).eq('id', school.id);
        if (sErr) return showToast('Failed: ' + sErr.message, 'error');

        showToast(`✅ Approved. ${school.name} extended to ${fmtDate(newEndStr)}.`);
        setReviewingPayment(null);
        await loadAll();
      }
    );
  };

  const rejectPayment = (payment: Payment) => {
    const reason = prompt('Reason for rejection (school will see this):');
    if (reason === null) return;
    if (!reason.trim()) return showToast('Please provide a reason.', 'warn');
    (async () => {
      const { error } = await supabase.from('subscription_payments').update({
        status: 'rejected',
        approved_by: 'Moraks Tech Hub',
        approved_at: new Date().toISOString(),
        rejection_reason: reason.trim(),
      }).eq('id', payment.id);
      if (error) return showToast('Failed: ' + error.message, 'error');
      showToast('Payment rejected.', 'warn');
      setReviewingPayment(null);
      await loadAll();
    })();
  };

  /* ── EXTEND ── */
  const confirmExtend = async (school: School, days: number, note: string) => {
    const now = new Date();
    const currentEnd = school.subscription_end_date ? new Date(school.subscription_end_date + 'T23:59:59') : null;
    const startFrom = currentEnd && currentEnd > now ? currentEnd : now;
    const newEnd = new Date(startFrom);
    newEnd.setDate(newEnd.getDate() + days);
    const newEndStr = newEnd.toISOString().slice(0, 10);

    const { error } = await supabase.from('schools').update({
      subscription_end_date: newEndStr,
      status: 'active',
    }).eq('id', school.id);
    if (error) return showToast('Failed: ' + error.message, 'error');
    showToast(`Extended ${school.name} to ${fmtDate(newEndStr)}.`);
    setExtendingSchool(null);
    await loadAll();
  };

  /* ── CREATE SCHOOL ── */
  const createSchool = async (name: string, slug: string, email: string, phone: string) => {
    if (!name || !slug) return showToast('Name and slug are required.', 'warn');
    if (!/^[a-z0-9-]+$/.test(slug)) return showToast('Slug: lowercase letters, numbers, hyphens only.', 'warn');
    if (schools.some((s) => s.slug === slug)) return showToast('Slug already in use.', 'warn');

    const { error } = await supabase.from('schools').insert({
      name, slug,
      contact_email: email || null,
      contact_phone: phone || null,
      status: 'pending',
    });
    if (error) return showToast('Failed: ' + error.message, 'error');
    showToast(`School "${name}" created.`);
    setActiveModal(null);
    await loadAll();
  };

  /* ── SAVE SETTINGS ── */
  const saveSettings = async (payload: Record<string, string>) => {
    for (const [key, value] of Object.entries(payload)) {
      await supabase.from('platform_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    }
    showToast('Settings saved.');
    setActiveModal(null);
    await loadAll();
  };

  /* ── SAVE BANKS ── */
  const saveBanks = async (rows: Array<{ bank_name: string; account_number: string; account_name: string }>) => {
    const clean = rows.filter((r) => r.bank_name && r.account_number && r.account_name);
    if (!clean.length) return showToast('Add at least one complete account.', 'warn');

    const { error: delErr } = await supabase.from('payment_accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) return showToast('Failed: ' + delErr.message, 'error');

    const { error: insErr } = await supabase.from('payment_accounts').insert(
      clean.map((r, i) => ({ ...r, display_order: i + 1, is_active: true }))
    );
    if (insErr) return showToast('Failed: ' + insErr.message, 'error');

    showToast('Bank accounts saved.');
    setActiveModal(null);
    await loadAll();
  };

  /* ── LOADING ── */
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A1A]">
        <p className="text-sm text-slate-400">Loading Vendor Console…</p>
      </div>
    );
  }

  /* ── LOGIN SCREEN ── */
  if (!loggedIn) {
    return <LoginScreen onLogin={handleLogin} error={loginError} />;
  }

  /* ── DASHBOARD ── */
  return (
    <Dashboard
      schools={schools}
      payments={payments}
      bankAccounts={bankAccounts}
      settings={settings}
      clock={clock}
      historyFilter={historyFilter}
      setHistoryFilter={setHistoryFilter}
      activeModal={activeModal}
      setActiveModal={setActiveModal}
      reviewingPayment={reviewingPayment}
      setReviewingPayment={setReviewingPayment}
      extendingSchool={extendingSchool}
      setExtendingSchool={setExtendingSchool}
      onLogout={handleLogout}
      onGlobalLock={executeGlobalLock}
      onGlobalUnlock={executeGlobalUnlock}
      onLockSchool={lockSchoolPortal}
      onUnlockSchool={unlockSchoolPortal}
      onSuspendSchool={suspendSchool}
      onUnsuspendSchool={unsuspendSchool}
      onApprovePayment={approvePayment}
      onRejectPayment={rejectPayment}
      onExtend={confirmExtend}
      onCreateSchool={createSchool}
      onSaveSettings={saveSettings}
      onSaveBanks={saveBanks}
      onRefresh={loadAll}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   LOGIN SCREEN
   ═══════════════════════════════════════════════════════════════ */
function LoginScreen({
  onLogin,
  error,
}: {
  onLogin: (e: React.FormEvent) => void;
  error: string;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto bg-gradient-to-br from-[#0A0A1A] via-[#1E1B4B] to-[#0A0A1A]">
      {/* Aurora glow */}
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <div
          className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[140px] bg-indigo-600/40 animate-pulse"
          style={{ animationDuration: '8s' }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[140px] bg-emerald-500/25 animate-pulse"
          style={{ animationDuration: '10s', animationDelay: '2s' }}
        />
      </div>

      {/* Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative w-full max-w-md fade-in">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div
              className="absolute inset-0 rounded-3xl opacity-60 blur-xl animate-pulse"
              style={{ background: 'linear-gradient(135deg, #6366F1, #10B981)' }}
            />
            <div
              className="relative w-full h-full rounded-3xl flex items-center justify-center shadow-2xl"
              style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #10B981 100%)' }}
            >
              <Icon name="bolt" className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="font-serif text-3xl tracking-tight text-white">
            MORAKS{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(135deg, #6366F1 0%, #34D399 100%)',
                WebkitBackgroundClip: 'text',
              }}
            >
              TECH HUB
            </span>
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.32em] text-emerald-400/80 font-semibold">
            Smart Systems. Real Results.
          </p>
          <div className="my-5 h-px w-24 mx-auto bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
          <p className="text-xs text-slate-500">Vendor Console · Restricted access</p>
        </div>

        {/* Card */}
        <div className="backdrop-blur-2xl bg-slate-900/80 border border-white/10 rounded-2xl shadow-pop p-8">
          <form onSubmit={onLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Master Password
              </label>
              <div className="relative">
                <Icon
                  name="lock"
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••••"
                  autoComplete="off"
                  className="w-full pl-9 pr-3 py-3 bg-slate-950/70 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-600 focus:bg-slate-950/90 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 outline-none transition"
                />
              </div>
              {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            </div>
            <button
              type="submit"
              className="w-full text-white font-bold py-3 rounded-xl text-sm tracking-wider uppercase transition disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
                boxShadow: '0 4px 14px -2px rgba(99,102,241,.4)',
              }}
            >
              Unlock Console
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-slate-500 mt-6">
          © {new Date().getFullYear()} MORAKS TECH HUB · All rights reserved
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════════ */
function Dashboard({
  schools,
  payments,
  bankAccounts,
  settings,
  clock,
  historyFilter,
  setHistoryFilter,
  activeModal,
  setActiveModal,
  reviewingPayment,
  setReviewingPayment,
  extendingSchool,
  setExtendingSchool,
  onLogout,
  onGlobalLock,
  onGlobalUnlock,
  onLockSchool,
  onUnlockSchool,
  onSuspendSchool,
  onUnsuspendSchool,
  onApprovePayment,
  onRejectPayment,
  onExtend,
  onCreateSchool,
  onSaveSettings,
  onSaveBanks,
  onRefresh,
}: {
  schools: School[];
  payments: Payment[];
  bankAccounts: BankAccount[];
  settings: Record<string, string>;
  clock: string;
  historyFilter: string;
  setHistoryFilter: (v: string) => void;
  activeModal: string | null;
  setActiveModal: (v: string | null) => void;
  reviewingPayment: Payment | null;
  setReviewingPayment: (p: Payment | null) => void;
  extendingSchool: School | null;
  setExtendingSchool: (s: School | null) => void;
  onLogout: () => void;
  onGlobalLock: (msg: string) => Promise<void>;
  onGlobalUnlock: () => Promise<void>;
  onLockSchool: (s: School) => void;
  onUnlockSchool: (s: School) => Promise<void>;
  onSuspendSchool: (s: School) => void;
  onUnsuspendSchool: (s: School) => Promise<void>;
  onApprovePayment: (p: Payment) => void;
  onRejectPayment: (p: Payment) => void;
  onExtend: (s: School, days: number, note: string) => Promise<void>;
  onCreateSchool: (name: string, slug: string, email: string, phone: string) => Promise<void>;
  onSaveSettings: (payload: Record<string, string>) => Promise<void>;
  onSaveBanks: (rows: Array<{ bank_name: string; account_number: string; account_name: string }>) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const isLocked = settings.global_lock === 'true';

  const activeSchools = schools.filter((s) => {
    const d = daysUntil(s.subscription_end_date);
    return d !== null && d >= 0 && s.status === 'active';
  }).length;
  const pendingPayments = payments.filter((p) => p.status === 'pending').length;
  const revenue = payments.filter((p) => p.status === 'approved').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const graceSchools = schools.filter((s) => {
    const d = daysUntil(s.subscription_end_date);
    return d !== null && d < 0 && d >= -20 && s.status === 'active';
  }).length;

  return (
    <div className="min-h-screen bg-[#0A0A1A] text-slate-100 antialiased">
      {/* Fixed background */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(10,10,26,.94) 0%, rgba(30,27,75,.92) 50%, rgba(10,10,26,.95) 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 800px 600px at top left, rgba(99,102,241,.18) 0%, transparent 60%), radial-gradient(ellipse 800px 600px at bottom right, rgba(16,185,129,.15) 0%, transparent 60%)',
          }}
        />
      </div>

      <div className="relative">
        {/* HEADER */}
        <header className="sticky top-0 z-30 backdrop-blur-2xl bg-slate-950/60 border-b border-white/5">
          <div className="max-w-[1500px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #10B981 100%)',
                  boxShadow: '0 4px 20px -4px rgba(99,102,241,.5)',
                }}
              >
                <Icon name="bolt" className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-400">
                  MORAKS TECH HUB
                </p>
                <p className="text-sm font-bold text-white -mt-0.5">Vendor Console</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveModal('settings')}
                className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition flex items-center gap-2"
              >
                <Icon name="settings" className="w-4 h-4" />
                Settings
              </button>
              <button
                onClick={onLogout}
                className="text-xs font-semibold text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-500/10 transition flex items-center gap-2"
              >
                <Icon name="logout" className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* MAIN */}
        <main className="max-w-[1500px] mx-auto px-6 lg:px-10 py-8 space-y-6">
          {/* HERO */}
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-serif text-3xl tracking-tight text-white">
                Welcome back,{' '}
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage: 'linear-gradient(135deg, #6366F1 0%, #34D399 100%)',
                    WebkitBackgroundClip: 'text',
                  }}
                >
                  Moraks
                </span>
                .
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Here&apos;s what&apos;s happening across your schools today.
              </p>
            </div>
            <p className="text-xs text-slate-500 font-mono">{clock}</p>
          </div>

          {/* GLOBAL CONTROL */}
          <GlobalControlCard
            isLocked={isLocked}
            message={settings.global_lock_message || 'System Under Maintenance'}
            lockedAt={settings.global_lock_started_at}
            lockedBy={settings.global_lock_by}
            onLock={() => setActiveModal('global-lock')}
            onUnlock={() => setActiveModal('global-unlock')}
          />

          {/* STATS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Active Schools"
              value={activeSchools}
              icon="school"
              tone="emerald"
              live
            />
            <StatCard
              label="Pending Payments"
              value={pendingPayments}
              icon="card"
              tone={pendingPayments > 0 ? 'amber' : 'slate'}
              live={pendingPayments > 0}
            />
            <StatCard
              label="Total Revenue"
              value={fmtNaira(revenue)}
              icon="trendUp"
              tone="emerald"
              mono
            />
            <StatCard
              label="In Grace Period"
              value={graceSchools}
              icon="clock"
              tone={graceSchools > 0 ? 'orange' : 'slate'}
            />
          </div>

          {/* MAIN GRID */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <SchoolsList
                schools={schools}
                onAdd={() => setActiveModal('add-school')}
                onExtend={setExtendingSchool}
                onLock={onLockSchool}
                onUnlock={onUnlockSchool}
                onSuspend={onSuspendSchool}
                onUnsuspend={onUnsuspendSchool}
              />

              <PaymentHistory
                payments={payments}
                schools={schools}
                filter={historyFilter}
                setFilter={setHistoryFilter}
                onReview={setReviewingPayment}
              />
            </div>

            <div className="space-y-5">
              <PendingList
                payments={payments}
                schools={schools}
                onReview={setReviewingPayment}
              />

              <BankAccountCard
                banks={bankAccounts}
                onEdit={() => setActiveModal('bank')}
              />

              <QuickActions
                onRefresh={onRefresh}
                onSettings={() => setActiveModal('settings')}
              />

              <SupportCard />
            </div>
          </div>
        </main>

        {/* FOOTER */}
        <footer className="text-center py-8 text-[10px] text-slate-500">
          <p>
            <span
              className="font-semibold bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #6366F1 0%, #34D399 100%)' }}
            >
              MORAKS TECH HUB
            </span>{' '}
            · Smart Systems. Real Results.
          </p>
          <p className="mt-1">© {new Date().getFullYear()} · Vendor Console v2.0</p>
        </footer>
      </div>

      {/* MODALS */}
      {activeModal === 'global-lock' && (
        <GlobalLockModal
          onClose={() => setActiveModal(null)}
          onConfirm={async (msg) => {
            await onGlobalLock(msg);
            setActiveModal(null);
          }}
        />
      )}
      {activeModal === 'global-unlock' && (
        <GlobalUnlockModal
          onClose={() => setActiveModal(null)}
          onConfirm={async () => {
            await onGlobalUnlock();
            setActiveModal(null);
          }}
        />
      )}
      {activeModal === 'add-school' && (
        <AddSchoolModal
          onClose={() => setActiveModal(null)}
          onSave={onCreateSchool}
        />
      )}
      {activeModal === 'bank' && (
        <BankModal
          banks={bankAccounts}
          onClose={() => setActiveModal(null)}
          onSave={onSaveBanks}
        />
      )}
      {activeModal === 'settings' && (
        <SettingsModal
          settings={settings}
          onClose={() => setActiveModal(null)}
          onSave={onSaveSettings}
        />
      )}

      {reviewingPayment && (
        <ReviewPaymentModal
          payment={reviewingPayment}
          school={schools.find((s) => s.id === reviewingPayment.school_id)}
          onClose={() => setReviewingPayment(null)}
          onApprove={() => onApprovePayment(reviewingPayment)}
          onReject={() => onRejectPayment(reviewingPayment)}
        />
      )}

      {extendingSchool && (
        <ExtendModal
          school={extendingSchool}
          onClose={() => setExtendingSchool(null)}
          onSave={async (days, note) => {
            await onExtend(extendingSchool, days, note);
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GLOBAL CONTROL CARD
   ═══════════════════════════════════════════════════════════════ */
function GlobalControlCard({
  isLocked,
  message,
  lockedAt,
  lockedBy,
  onLock,
  onUnlock,
}: {
  isLocked: boolean;
  message: string;
  lockedAt?: string;
  lockedBy?: string;
  onLock: () => void;
  onUnlock: () => void;
}) {
  if (isLocked) {
    return (
      <div className="backdrop-blur-2xl bg-slate-900/70 border border-red-500/40 rounded-2xl overflow-hidden ring-2 ring-red-500/30">
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 ring-1 ring-red-500/40 flex items-center justify-center shrink-0 animate-pulse">
              <Icon name="lock" className="w-6 h-6 text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-base font-bold text-white">Global System Control</h3>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ring-1 bg-red-500/15 text-red-300 ring-red-500/30 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  System Locked
                </span>
              </div>
              <p className="text-xs text-slate-400">{message}</p>
              {lockedAt && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Locked {timeAgo(lockedAt)} by {lockedBy || 'vendor'}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onUnlock}
            className="inline-flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 rounded-xl transition-all shadow-lg shrink-0"
          >
            <Icon name="unlock" className="w-4 h-4" />
            Restore System Access
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="backdrop-blur-2xl bg-slate-900/70 border border-white/10 rounded-2xl overflow-hidden">
      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
            <Icon name="clock" className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-base font-bold text-white">Global System Control</h3>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ring-1 bg-emerald-500/15 text-emerald-300 ring-emerald-500/30 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                System Online
              </span>
            </div>
            <p className="text-xs text-slate-400">
              All schools can access their portals. CBT engine is fully operational.
            </p>
          </div>
        </div>
        <button
          onClick={onLock}
          className="inline-flex items-center gap-2 text-xs font-bold text-red-400 hover:text-white hover:bg-red-600/90 px-4 py-2.5 rounded-xl ring-1 ring-red-500/40 hover:ring-red-600 transition-all shrink-0"
        >
          <Icon name="lock" className="w-4 h-4" />
          EMERGENCY: Lock Entire System
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════════════════════════ */
function StatCard({
  label,
  value,
  icon,
  tone = 'slate',
  live = false,
  mono = false,
}: {
  label: string;
  value: string | number;
  icon: string;
  tone?: 'emerald' | 'amber' | 'orange' | 'red' | 'slate';
  live?: boolean;
  mono?: boolean;
}) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
    slate: 'text-slate-300',
  };
  const dots: Record<string, string> = {
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    orange: 'bg-orange-400',
    red: 'bg-red-400',
    slate: 'bg-slate-500',
  };
  return (
    <div className="backdrop-blur-2xl bg-slate-900/70 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.04] transition">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        {live ? (
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${dots[tone]} opacity-75 animate-ping`}
            />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${dots[tone]}`} />
          </span>
        ) : (
          <Icon name={icon} className={`w-4 h-4 ${tones[tone]}`} />
        )}
      </div>
      <p className={`text-2xl lg:text-3xl font-bold mt-2 ${tones[tone]} ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCHOOLS LIST
   ═══════════════════════════════════════════════════════════════ */
function SchoolsList({
  schools,
  onAdd,
  onExtend,
  onLock,
  onUnlock,
  onSuspend,
  onUnsuspend,
}: {
  schools: School[];
  onAdd: () => void;
  onExtend: (s: School) => void;
  onLock: (s: School) => void;
  onUnlock: (s: School) => Promise<void>;
  onSuspend: (s: School) => void;
  onUnsuspend: (s: School) => Promise<void>;
}) {
  return (
    <div className="backdrop-blur-2xl bg-slate-900/70 border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Schools</h2>
          <p className="text-xs text-slate-400 mt-0.5">Active subscriptions and their status.</p>
        </div>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition"
          style={{
            background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
            boxShadow: '0 4px 14px -2px rgba(99,102,241,.4)',
          }}
        >
          <Icon name="plus" className="w-3.5 h-3.5" />
          Add School
        </button>
      </div>

      {!schools.length ? (
        <div className="p-12 text-center">
          <p className="text-sm text-slate-400 italic">No schools yet.</p>
          <button
            onClick={onAdd}
            className="mt-3 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
          >
            + Add your first school
          </button>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {schools.map((s) => {
            const days = daysUntil(s.subscription_end_date);
            const computedStatus = !s.subscription_end_date
              ? 'pending'
              : days !== null && days < 0 && days >= -20
              ? 'grace'
              : days !== null && days < -20
              ? 'expired'
              : s.status === 'suspended'
              ? 'suspended'
              : 'active';
            const daysLabel =
              days === null
                ? 'No active subscription'
                : days < 0
                ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago · grace`
                : days === 0
                ? 'Expires today'
                : `${days} day${days === 1 ? '' : 's'} remaining`;
            const daysTone =
              days === null
                ? 'text-slate-400'
                : days < 0
                ? 'text-orange-400'
                : days <= 7
                ? 'text-orange-400'
                : days <= 14
                ? 'text-amber-400'
                : 'text-emerald-400';

            return (
              <div
                key={s.id}
                className={`p-5 hover:bg-white/[0.03] transition ${s.portal_locked ? 'bg-red-950/20' : ''}`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <h3 className="text-base font-semibold text-white truncate">{s.name}</h3>
                      <StatusPill status={computedStatus} />
                      {s.portal_locked && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ring-1 bg-red-500/20 text-red-300 ring-red-500/40 uppercase tracking-wider">
                          <Icon name="lock" className="w-3 h-3" />
                          Portal Locked
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                      <span className="font-mono">{s.slug}</span>
                      {s.contact_email && <span>{s.contact_email}</span>}
                    </div>
                    <div className="mt-3 flex items-center gap-4 flex-wrap text-xs">
                      <div>
                        <span className="text-slate-500">Expires: </span>
                        <span className="font-medium text-slate-200">
                          {fmtDate(s.subscription_end_date)}
                        </span>
                      </div>
                      <div className={`${daysTone} font-semibold`}>{daysLabel}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    <button
                      onClick={() => onExtend(s)}
                      className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 transition"
                    >
                      Extend
                    </button>
                    {s.portal_locked ? (
                      <button
                        onClick={() => onUnlock(s)}
                        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 transition inline-flex items-center gap-1"
                      >
                        <Icon name="unlock" className="w-3.5 h-3.5" />
                        Unlock
                      </button>
                    ) : (
                      <button
                        onClick={() => onLock(s)}
                        className="text-xs font-semibold text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition inline-flex items-center gap-1"
                      >
                        <Icon name="lock" className="w-3.5 h-3.5" />
                        Lock
                      </button>
                    )}
                    {s.status !== 'suspended' ? (
                      <button
                        onClick={() => onSuspend(s)}
                        className="text-xs font-semibold text-orange-400 hover:text-orange-300 px-3 py-1.5 rounded-lg hover:bg-orange-500/10 transition"
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        onClick={() => onUnsuspend(s)}
                        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 transition"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STATUS PILL
   ═══════════════════════════════════════════════════════════════ */
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string; dot: string }> = {
    active: { label: 'Active', tone: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30', dot: 'bg-emerald-400' },
    pending: { label: 'Pending', tone: 'bg-amber-500/15 text-amber-300 ring-amber-500/30', dot: 'bg-amber-400' },
    expired: { label: 'Expired', tone: 'bg-red-500/15 text-red-300 ring-red-500/30', dot: 'bg-red-400' },
    suspended: { label: 'Suspended', tone: 'bg-slate-500/15 text-slate-300 ring-slate-500/30', dot: 'bg-slate-400' },
    grace: { label: 'Grace', tone: 'bg-orange-500/15 text-orange-300 ring-orange-500/30', dot: 'bg-orange-400' },
  };
  const s = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1 ${s.tone} uppercase tracking-wider`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PENDING LIST
   ═══════════════════════════════════════════════════════════════ */
function PendingList({
  payments,
  schools,
  onReview,
}: {
  payments: Payment[];
  schools: School[];
  onReview: (p: Payment) => void;
}) {
  const pending = payments.filter((p) => p.status === 'pending');
  return (
    <div className="backdrop-blur-2xl bg-slate-900/70 border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-white/5 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
        </span>
        <h2 className="text-base font-semibold text-white">Pending Approvals</h2>
        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
          {pending.length}
        </span>
      </div>
      <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
        {!pending.length ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-xl bg-slate-800/60 flex items-center justify-center mb-3">
              <Icon name="check" className="w-5 h-5 text-slate-500" />
            </div>
            <p className="text-xs text-slate-400 italic">No pending payments.</p>
          </div>
        ) : (
          pending.map((p) => {
            const school = schools.find((s) => s.id === p.school_id);
            return (
              <div
                key={p.id}
                onClick={() => onReview(p)}
                className="p-4 rounded-xl bg-slate-900/70 border border-amber-500/20 hover:border-amber-500/50 transition cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-xs font-semibold text-white truncate">
                    {school?.name || 'Unknown School'}
                  </p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30">
                    PENDING
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">
                    {p.term} Term · {p.session}
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {fmtNaira(p.amount)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Submitted {fmtDate(p.submitted_at)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAYMENT HISTORY
   ═══════════════════════════════════════════════════════════════ */
function PaymentHistory({
  payments,
  schools,
  filter,
  setFilter,
  onReview,
}: {
  payments: Payment[];
  schools: School[];
  filter: string;
  setFilter: (v: string) => void;
  onReview: (p: Payment) => void;
}) {
  const data = filter ? payments.filter((p) => p.status === filter) : payments;

  return (
    <div className="backdrop-blur-2xl bg-slate-900/70 border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Payment History</h2>
          <p className="text-xs text-slate-400 mt-0.5">Every subscription payment received.</p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-xs px-3 py-2 bg-slate-950/70 border border-white/10 rounded-xl text-white outline-none"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/50 text-slate-400 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3 font-semibold">Date</th>
              <th className="px-5 py-3 font-semibold">School</th>
              <th className="px-5 py-3 font-semibold">Term</th>
              <th className="px-5 py-3 font-semibold text-right">Amount</th>
              <th className="px-5 py-3 font-semibold">Reference</th>
              <th className="px-5 py-3 font-semibold text-center">Status</th>
              <th className="px-5 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {!data.length && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-xs text-slate-500 italic">
                  No payments yet.
                </td>
              </tr>
            )}
            {data.map((p) => {
              const school = schools.find((s) => s.id === p.school_id);
              const tone =
                p.status === 'approved'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                  : p.status === 'rejected'
                  ? 'bg-red-500/15 text-red-300 ring-red-500/30'
                  : 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
              return (
                <tr
                  key={p.id}
                  onClick={() => onReview(p)}
                  className="hover:bg-white/[0.04] transition cursor-pointer"
                >
                  <td className="px-5 py-3 text-slate-400 text-[11px] whitespace-nowrap">
                    {fmtDate(p.submitted_at)}
                  </td>
                  <td className="px-5 py-3 text-slate-200 font-medium">
                    {school?.name || '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-[11px]">
                    {p.term} · {p.session}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-emerald-400">
                    {fmtNaira(p.amount)}
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-[11px] font-mono truncate max-w-[160px]">
                    {p.reference || '—'}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1 ${tone} uppercase tracking-wider`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReview(p);
                      }}
                      className="text-emerald-400 hover:text-emerald-300 font-semibold text-[11px]"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BANK ACCOUNT CARD
   ═══════════════════════════════════════════════════════════════ */
function BankAccountCard({
  banks,
  onEdit,
}: {
  banks: BankAccount[];
  onEdit: () => void;
}) {
  return (
    <div className="backdrop-blur-2xl bg-slate-900/70 border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Bank Account</h2>
        <button
          onClick={onEdit}
          className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition"
        >
          Edit
        </button>
      </div>
      <div className="p-5 space-y-3">
        {!banks.length ? (
          <p className="text-xs text-slate-500 italic">No bank accounts configured.</p>
        ) : (
          banks
            .filter((a) => a.is_active)
            .map((a) => (
              <div key={a.id} className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  {a.bank_name}
                </p>
                <p className="text-base font-mono font-bold text-white mt-1">
                  {a.account_number}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">{a.account_name}</p>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   QUICK ACTIONS
   ═══════════════════════════════════════════════════════════════ */
function QuickActions({
  onRefresh,
  onSettings,
}: {
  onRefresh: () => Promise<void>;
  onSettings: () => void;
}) {
  return (
    <div className="backdrop-blur-2xl bg-slate-900/70 border border-white/10 rounded-2xl p-5 space-y-2">
      <h2 className="text-base font-semibold text-white mb-3">Quick Actions</h2>
      <button
        onClick={async () => {
          showToast('Refreshing…', 'info');
          await onRefresh();
          showToast('Data refreshed.');
        }}
        className="w-full text-left px-4 py-2.5 rounded-xl hover:bg-white/5 transition text-xs font-semibold text-slate-200 flex items-center gap-3"
      >
        <Icon name="refresh" className="w-4 h-4 text-emerald-400" />
        Refresh Data
      </button>
      <button
        onClick={onSettings}
        className="w-full text-left px-4 py-2.5 rounded-xl hover:bg-white/5 transition text-xs font-semibold text-slate-200 flex items-center gap-3"
      >
        <Icon name="settings" className="w-4 h-4 text-emerald-400" />
        Platform Settings
      </button>
      <button
        onClick={() => {
          const text = 'MORAKS TECH HUB — Support\nEmail: morakstech02@gmail.com\nPhone: 09152625084 / 08022231742';
          navigator.clipboard.writeText(text).then(() => showToast('Support info copied.'));
        }}
        className="w-full text-left px-4 py-2.5 rounded-xl hover:bg-white/5 transition text-xs font-semibold text-slate-200 flex items-center gap-3"
      >
        <Icon name="copy" className="w-4 h-4 text-emerald-400" />
        Copy Support Info
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUPPORT CARD
   ═══════════════════════════════════════════════════════════════ */
function SupportCard() {
  return (
    <div className="backdrop-blur-2xl bg-slate-900/70 border border-white/10 rounded-2xl p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">
        Support Contact
      </h3>
      <div className="space-y-2 text-xs text-slate-300">
        <p className="flex items-center gap-2">
          <Icon name="mail" className="w-3.5 h-3.5 text-slate-500" />
          morakstech02@gmail.com
        </p>
        <p className="flex items-center gap-2">
          <Icon name="phone" className="w-3.5 h-3.5 text-slate-500" />
          09152625084
        </p>
        <p className="flex items-center gap-2">
          <Icon name="phone" className="w-3.5 h-3.5 text-slate-500" />
          08022231742
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GLOBAL LOCK MODAL
   ═══════════════════════════════════════════════════════════════ */
function GlobalLockModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (message: string) => Promise<void>;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const canConfirm = confirmText.trim().toUpperCase() === 'LOCK';

  return (
    <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900/95 border border-red-500/30 rounded-2xl shadow-pop max-w-lg w-full fade-in my-8 overflow-hidden">
        <div className="px-6 py-5 border-b border-red-500/20 bg-red-950/40">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 ring-1 ring-red-500/40 flex items-center justify-center shrink-0">
              <Icon name="warning" className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Emergency System Lock</h3>
              <p className="text-xs text-red-300 mt-0.5">This will block EVERY school immediately.</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
            <p className="text-xs font-semibold text-red-300 mb-2">⚠ This action will:</p>
            <ul className="text-xs text-red-200/90 space-y-1.5 ml-4 list-disc">
              <li>Block <strong>all schools</strong> from accessing their portals</li>
              <li>Force-stop <strong>every active CBT exam</strong> in progress</li>
              <li>Display a maintenance screen to everyone</li>
            </ul>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Type <span className="font-mono text-red-400 font-bold">LOCK</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type LOCK here"
              autoComplete="off"
              className="w-full text-sm px-4 py-3 bg-slate-950/80 border border-red-500/30 rounded-xl text-white placeholder:text-slate-600 font-mono uppercase tracking-widest text-center outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/60 transition"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Custom Message (optional)
            </label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={120}
              placeholder="System Under Maintenance — Please check back shortly"
              className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white placeholder:text-slate-600 outline-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-2 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!canConfirm || busy) return;
              setBusy(true);
              await onConfirm(message);
              setBusy(false);
            }}
            disabled={!canConfirm || busy}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <Icon name="lock" className="w-3.5 h-3.5" />
            {busy ? 'Locking…' : 'Lock Entire System Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GLOBAL UNLOCK MODAL
   ═══════════════════════════════════════════════════════════════ */
function GlobalUnlockModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900/95 border border-emerald-500/20 rounded-2xl shadow-pop max-w-md w-full fade-in overflow-hidden">
        <div className="px-6 py-5 border-b border-emerald-500/20 bg-emerald-950/30">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-500/40 flex items-center justify-center shrink-0">
              <Icon name="unlock" className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Restore System Access</h3>
              <p className="text-xs text-emerald-300 mt-0.5">All schools regain access immediately.</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-300">
            Are you sure you want to <strong className="text-emerald-400">restore access</strong> for all schools?
          </p>
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-2 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition disabled:opacity-50 inline-flex items-center gap-2"
            style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}
          >
            <Icon name="check" className="w-3.5 h-3.5" />
            {busy ? 'Restoring…' : 'Restore System Access'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ADD SCHOOL MODAL
   ═══════════════════════════════════════════════════════════════ */
function AddSchoolModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string, slug: string, email: string, phone: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900/95 border border-white/10 rounded-2xl shadow-pop max-w-md w-full fade-in my-8 overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Add New School</h3>
            <p className="text-xs text-slate-400 mt-0.5">Register a new school for onboarding.</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-400"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              School Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ibadu Rahman International School"
              className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white placeholder:text-slate-600 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              URL Slug
            </label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="iris"
              className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-mono outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Lowercase letters, numbers, hyphens only.</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Contact Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="admin@school.edu.ng"
              className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white placeholder:text-slate-600 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Contact Phone
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234-XXX-XXX-XXXX"
              className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white placeholder:text-slate-600 outline-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-2 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              await onSave(name, slug, email, phone);
              setBusy(false);
            }}
            disabled={busy}
            className="text-white font-bold px-5 py-2 rounded-xl text-xs transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)' }}
          >
            {busy ? 'Creating…' : 'Create School'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EXTEND MODAL
   ═══════════════════════════════════════════════════════════════ */
function ExtendModal({
  school,
  onClose,
  onSave,
}: {
  school: School;
  onClose: () => void;
  onSave: (days: number, note: string) => Promise<void>;
}) {
  const [days, setDays] = useState(90);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900/95 border border-white/10 rounded-2xl shadow-pop max-w-md w-full fade-in overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Extend Subscription</h3>
            <p className="text-xs text-slate-400 mt-0.5">{school.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-400"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Extend By
            </label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white outline-none"
            >
              <option value={30}>30 days (1 month)</option>
              <option value={90}>90 days (1 term)</option>
              <option value={180}>180 days (2 terms)</option>
              <option value={365}>365 days (1 year)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Extended manually via bank transfer"
              className="w-full text-sm p-3 bg-slate-950/70 border border-white/10 rounded-xl text-white placeholder:text-slate-600 outline-none resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-2 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              await onSave(days, note);
              setBusy(false);
            }}
            disabled={busy}
            className="text-white font-bold px-5 py-2 rounded-xl text-xs transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}
          >
            {busy ? 'Extending…' : 'Extend Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   REVIEW PAYMENT MODAL
   ═══════════════════════════════════════════════════════════════ */
function ReviewPaymentModal({
  payment,
  school,
  onClose,
  onApprove,
  onReject,
}: {
  payment: Payment;
  school?: School;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900/95 border border-white/10 rounded-2xl shadow-pop max-w-2xl w-full fade-in my-8 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-white text-lg">Review Payment</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {school?.name || 'School'} · {payment.term} Term · {payment.session}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-400"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                School
              </p>
              <p className="text-sm font-semibold text-white mt-0.5">{school?.name || '—'}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Amount
              </p>
              <p className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
                {fmtNaira(payment.amount)}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Term
              </p>
              <p className="text-sm font-semibold text-white mt-0.5">{payment.term}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Session
              </p>
              <p className="text-sm font-semibold text-white mt-0.5">{payment.session}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 col-span-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Reference
              </p>
              <p className="text-sm font-mono text-slate-200 mt-0.5 break-all">
                {payment.reference || '—'}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 col-span-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Submitted
              </p>
              <p className="text-sm text-slate-200 mt-0.5">
                {new Date(payment.submitted_at).toLocaleString()} · by{' '}
                {payment.submitted_by || '—'}
              </p>
            </div>
            {payment.notes && (
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 col-span-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  Notes from school
                </p>
                <p className="text-sm text-slate-200 mt-0.5 italic">&quot;{payment.notes}&quot;</p>
              </div>
            )}
            {payment.proof_url ? (
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 col-span-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                  Proof of Payment
                </p>
                <a href={payment.proof_url} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={payment.proof_url}
                    alt="Payment proof"
                    className="w-full max-h-[350px] object-contain rounded-lg bg-slate-950 ring-1 ring-white/10"
                  />
                </a>
                <p className="text-[10px] text-slate-500 mt-2">Click image to open in new tab</p>
              </div>
            ) : (
              <div className="col-span-2 p-3.5 rounded-xl bg-red-500/5 border border-red-500/20 text-xs text-red-300">
                ⚠ No proof uploaded
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/5 flex justify-between items-center gap-2 shrink-0 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
          >
            Close
          </button>
          <div className="flex gap-2">
            {payment.status === 'pending' && (
              <>
                <button
                  onClick={onReject}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 ring-1 ring-red-500/30 transition"
                >
                  ✗ Reject
                </button>
                <button
                  onClick={onApprove}
                  className="text-white font-bold px-5 py-2 rounded-xl text-xs transition"
                  style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}
                >
                  ✓ Approve
                </button>
              </>
            )}
            {payment.status === 'approved' && (
              <span className="text-xs text-emerald-400 font-semibold">
                ✓ Approved on {fmtDate(payment.approved_at)} by {payment.approved_by || 'vendor'}
              </span>
            )}
            {payment.status === 'rejected' && (
              <span className="text-xs text-red-400 font-semibold">
                ✗ Rejected
                {payment.rejection_reason ? `: ${payment.rejection_reason}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BANK MODAL
   ═══════════════════════════════════════════════════════════════ */
function BankModal({
  banks,
  onClose,
  onSave,
}: {
  banks: BankAccount[];
  onClose: () => void;
  onSave: (rows: Array<{ bank_name: string; account_number: string; account_name: string }>) => Promise<void>;
}) {
  const [rows, setRows] = useState(() =>
    banks.length
      ? banks.map((b) => ({ bank_name: b.bank_name, account_number: b.account_number, account_name: b.account_name }))
      : [{ bank_name: '', account_number: '', account_name: '' }]
  );
  const [busy, setBusy] = useState(false);

  const update = (i: number, key: 'bank_name' | 'account_number' | 'account_name', val: string) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  };
  const add = () => setRows((p) => [...p, { bank_name: '', account_number: '', account_name: '' }]);
  const remove = (i: number) => setRows((p) => p.filter((_, idx) => idx !== i));

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900/95 border border-white/10 rounded-2xl shadow-pop max-w-md w-full fade-in my-8 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-white">Bank Accounts</h3>
            <p className="text-xs text-slate-400 mt-0.5">Shown to schools when they pay.</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-400"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {rows.map((r, i) => (
            <div key={i} className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  Account {i + 1}
                </p>
                {rows.length > 1 && (
                  <button onClick={() => remove(i)} className="text-[10px] text-red-400 hover:text-red-300">
                    Remove
                  </button>
                )}
              </div>
              <input
                value={r.bank_name}
                onChange={(e) => update(i, 'bank_name', e.target.value)}
                placeholder="Bank name"
                className="w-full text-sm px-3 py-2 bg-slate-950/60 border border-white/10 rounded-lg text-white placeholder:text-slate-600 outline-none"
              />
              <input
                value={r.account_number}
                onChange={(e) => update(i, 'account_number', e.target.value)}
                placeholder="Account number"
                className="w-full text-sm px-3 py-2 bg-slate-950/60 border border-white/10 rounded-lg text-white placeholder:text-slate-600 font-mono outline-none"
              />
              <input
                value={r.account_name}
                onChange={(e) => update(i, 'account_name', e.target.value)}
                placeholder="Account name"
                className="w-full text-sm px-3 py-2 bg-slate-950/60 border border-white/10 rounded-lg text-white placeholder:text-slate-600 outline-none"
              />
            </div>
          ))}
          <button
            onClick={add}
            className="w-full text-xs font-semibold text-emerald-400 hover:text-emerald-300 py-2.5 rounded-xl border border-dashed border-emerald-500/30 hover:bg-emerald-500/5 transition"
          >
            + Add Another Account
          </button>
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-2 bg-slate-950/60 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              await onSave(rows);
              setBusy(false);
            }}
            disabled={busy}
            className="text-white font-bold px-5 py-2 rounded-xl text-xs transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}
          >
            {busy ? 'Saving…' : 'Save Accounts'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS MODAL
   ═══════════════════════════════════════════════════════════════ */
function SettingsModal({
  settings,
  onClose,
  onSave,
}: {
  settings: Record<string, string>;
  onClose: () => void;
  onSave: (payload: Record<string, string>) => Promise<void>;
}) {
  const [price1, setPrice1] = useState(settings.price_1st_term || '250000');
  const [price2, setPrice2] = useState(settings.price_2nd_term || '250000');
  const [price3, setPrice3] = useState(settings.price_3rd_term || '250000');
  const [session, setSession] = useState(settings.current_session || '2025/2026');
  const [graceDays, setGraceDays] = useState(settings.grace_days || '20');
  const [vendorPass, setVendorPass] = useState(settings.vendor_password || '');
  const [autoLock, setAutoLock] = useState(settings.auto_lock !== 'false');
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900/95 border border-white/10 rounded-2xl shadow-pop max-w-lg w-full fade-in my-8 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-white">Platform Settings</h3>
            <p className="text-xs text-slate-400 mt-0.5">Global pricing and contact info.</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-400"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                1st Term Price (₦)
              </label>
              <input
                type="number"
                value={price1}
                onChange={(e) => setPrice1(e.target.value)}
                className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                2nd Term Price (₦)
              </label>
              <input
                type="number"
                value={price2}
                onChange={(e) => setPrice2(e.target.value)}
                className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                3rd Term Price (₦)
              </label>
              <input
                type="number"
                value={price3}
                onChange={(e) => setPrice3(e.target.value)}
                className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Current Session
              </label>
              <input
                value={session}
                onChange={(e) => setSession(e.target.value)}
                placeholder="2025/2026"
                className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white font-mono outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Grace Period (days)
            </label>
            <input
              type="number"
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value)}
              className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white font-mono outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              CBT still works during grace period, then locks automatically.
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Vendor Password
            </label>
            <input
              value={vendorPass}
              onChange={(e) => setVendorPass(e.target.value)}
              className="w-full text-sm px-3.5 py-2.5 bg-slate-950/70 border border-white/10 rounded-xl text-white font-mono outline-none"
            />
            <p className="text-[10px] text-amber-400 mt-1">
              ⚠ Changing this requires re-login. Save it somewhere safe.
            </p>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoLock}
                onChange={(e) => setAutoLock(e.target.checked)}
                className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-xs font-medium text-slate-300">
                Auto-lock CBT when subscription + grace period expires
              </span>
            </label>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-2 bg-slate-950/60 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              await onSave({
                price_1st_term: price1,
                price_2nd_term: price2,
                price_3rd_term: price3,
                current_session: session,
                grace_days: graceDays,
                vendor_password: vendorPass,
                auto_lock: autoLock ? 'true' : 'false',
              });
              setBusy(false);
            }}
            disabled={busy}
            className="text-white font-bold px-5 py-2 rounded-xl text-xs transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}
          >
            {busy ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </div>
    </div>
  );
}