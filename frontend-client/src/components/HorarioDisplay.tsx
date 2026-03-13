import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface HorarioParsed {
  texto: string;
  siempre_abierto: boolean;
  segmentos: {
    dias: number[];
    apertura: string;
    cierre: string;
  }[];
}

interface HorarioDisplayProps {
  horario?: string;
  horario_parsed?: HorarioParsed;
  mode: 'compact' | 'full';
}

// Day abbreviations (ISO: 1=Monday … 7=Sunday)
const DAY_ABBR = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

function getTodayISO(): number {
  const d = new Date().getDay(); // 0=Sunday
  return d === 0 ? 7 : d;
}

function getSegmentForDay(
  segmentos: HorarioParsed['segmentos'],
  day: number
) {
  return segmentos.find(s => s.dias.includes(day)) ?? null;
}

function isOpenNow(apertura: string, cierre: string): boolean {
  const now = new Date();
  const [ah, am] = apertura.split(':').map(Number);
  const [ch, cm] = cierre.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const openMin = ah * 60 + am;
  const closeMin = ch * 60 + cm;
  return nowMin >= openMin && nowMin < closeMin;
}

function ClockIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export default function HorarioDisplay({
  horario,
  horario_parsed,
  mode,
}: Readonly<HorarioDisplayProps>) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  /* ─── COMPACT MODE ─── */
  if (mode === 'compact') {
    // No parsed data — fall back to raw text or dash
    if (!horario_parsed) {
      if (horario) {
        return (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <ClockIcon />
            <span className="truncate max-w-25">{horario}</span>
          </span>
        );
      }
      return <span className="text-gray-300 text-xs select-none">—</span>;
    }

    // 24h
    if (horario_parsed.siempre_abierto) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />{' '}24H
        </span>
      );
    }

    const today = getTodayISO();
    const seg = getSegmentForDay(horario_parsed.segmentos, today);

    if (!seg) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs">
          {t('horario.closedToday')}
        </span>
      );
    }

    const open = isOpenNow(seg.apertura, seg.cierre);

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          open ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}
      >
        <ClockIcon />
        {seg.apertura}–{seg.cierre}
      </span>
    );
  }

  /* ─── FULL MODE ─── */
  if (!horario_parsed) {
    if (horario) return <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{horario}</p>;
    return <p className="text-sm text-gray-400 italic">{t('horario.noData')}</p>;
  }

  if (horario_parsed.siempre_abierto) {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
        <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse shrink-0" />
        <p className="font-bold text-green-700 text-base">{t('horario.open24h')}</p>
      </div>
    );
  }

  const today = getTodayISO();
  const todaySeg = getSegmentForDay(horario_parsed.segmentos, today);
  const todayOpen = todaySeg ? isOpenNow(todaySeg.apertura, todaySeg.cierre) : false;

  const bannerBg = todayOpen
    ? 'bg-green-50 border-green-200'
    : (todaySeg ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200');
  const dotColor = todayOpen
    ? 'bg-green-500 animate-pulse'
    : (todaySeg ? 'bg-orange-400' : 'bg-gray-400');
  const labelColor = todayOpen
    ? 'text-green-700'
    : (todaySeg ? 'text-orange-700' : 'text-gray-500');

  // Build per-day mapping
  const daySchedule: Record<number, { apertura: string; cierre: string } | null> = {};
  for (let d = 1; d <= 7; d++) {
    const seg = getSegmentForDay(horario_parsed.segmentos, d);
    daySchedule[d] = seg ? { apertura: seg.apertura, cierre: seg.cierre } : null;
  }

  return (
    <div className="space-y-3">
      {/* Banner estado actual */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${bannerBg}`}>
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
          <span className={`font-semibold text-sm ${labelColor}`}>
            {todayOpen ? t('horario.open') : t('horario.closed')}
          </span>
        </div>
        {todaySeg && (
          <span className="text-sm font-mono text-gray-700 font-medium tabular-nums">
            {todaySeg.apertura} – {todaySeg.cierre}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        {expanded ? t('common.seeLess') : t('common.seeMore')}
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {/* Tabla semanal */}
      <div className={`rounded-xl overflow-hidden border border-gray-100 divide-y divide-gray-100 transition-all ${expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 border-transparent divide-transparent'}`}>
        {([1, 2, 3, 4, 5, 6, 7] as const).map(d => {
          const sched = daySchedule[d];
          const isToday = d === today;
          const open = sched ? isOpenNow(sched.apertura, sched.cierre) : false;

          return (
            <div
              key={d}
              className={`flex items-center justify-between px-4 py-2.5 ${
                isToday ? 'bg-[#F0F3FF]' : 'bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  isToday ? 'bg-[#000C74] text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  {DAY_ABBR[d]}
                </span>
                <span className={`text-sm ${isToday ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                  {t(`horario.day${d}`)}
                </span>
                {isToday && (
                  <span className="hidden sm:inline text-[10px] font-bold text-[#000C74] bg-[#E4E7FF] px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                    {t('horario.today')}
                  </span>
                )}
              </div>

              {sched ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-800 font-mono tabular-nums">
                    {sched.apertura}–{sched.cierre}
                  </span>
                  {isToday && (
                    <span className={`w-2 h-2 rounded-full shrink-0 ${open ? 'bg-green-500' : 'bg-orange-400'}`} />
                  )}
                </div>
              ) : (
                <span className="text-sm text-gray-400">{t('horario.closed')}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
