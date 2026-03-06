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
}: HorarioDisplayProps) {
  const { t } = useTranslation();

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
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          24H
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
    if (horario) return <p className="text-sm text-gray-700">{horario}</p>;
    return <p className="text-sm text-gray-400">{t('horario.noData')}</p>;
  }

  if (horario_parsed.siempre_abierto) {
    return (
      <div className="flex items-center">
        <span className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-green-100 text-green-700 font-bold text-base shadow-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          {t('horario.open24h')}
        </span>
      </div>
    );
  }

  const today = getTodayISO();

  // Build per-day mapping
  const daySchedule: Record<number, { apertura: string; cierre: string } | null> = {};
  for (let d = 1; d <= 7; d++) {
    const seg = getSegmentForDay(horario_parsed.segmentos, d);
    daySchedule[d] = seg ? { apertura: seg.apertura, cierre: seg.cierre } : null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {([1, 2, 3, 4, 5, 6, 7] as const).map(d => {
        const sched = daySchedule[d];
        const isToday = d === today;
        const open = sched ? isOpenNow(sched.apertura, sched.cierre) : false;

        return (
          <div
            key={d}
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all ${
              isToday
                ? open
                  ? 'border-green-300 bg-green-50 shadow-sm'
                  : 'border-[#000C74]/30 bg-[#F8F9FF] shadow-sm'
                : 'border-gray-100 bg-white'
            }`}
          >
            {/* Day label */}
            <div className="flex items-center gap-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  isToday
                    ? 'bg-[#000C74] text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {DAY_ABBR[d]}
              </span>
              <span
                className={`text-sm ${
                  isToday ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
                }`}
              >
                {t(`horario.day${d}`)}
              </span>
            </div>

            {/* Hours / status */}
            {sched ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800 font-mono tabular-nums">
                  {sched.apertura}&nbsp;–&nbsp;{sched.cierre}
                </span>
                {isToday && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      open
                        ? 'bg-green-100 text-green-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {t(open ? 'horario.open' : 'horario.closed')}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm text-gray-400">{t('horario.closed')}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
