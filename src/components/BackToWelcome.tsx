'use client';

import Link from 'next/link';

export function BackToWelcome() {
  return (
    <Link
      href="/"
      className="group fixed top-5 left-5 z-[60] inline-flex items-center gap-2 text-xs font-semibold text-white/90 hover:text-white px-3.5 py-2.5 rounded-xl bg-black/50 hover:bg-black/70 ring-1 ring-white/15 hover:ring-white/30 backdrop-blur-md transition-all shadow-lg"
      aria-label="Back to welcome page"
    >
      <svg
        className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Back to Welcome
    </Link>
  );
}