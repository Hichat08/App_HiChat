const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";

export const toVietnamDateKey = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
};

export const getVietnamYesterdayKey = (baseDate = new Date()) => {
  const prev = new Date(new Date(baseDate).getTime() - 24 * 60 * 60 * 1000);
  return toVietnamDateKey(prev);
};

export const getVietnamDayEndISO = (baseDate = new Date()) => {
  const key = toVietnamDateKey(baseDate); // YYYY-MM-DD in VN
  return new Date(`${key}T23:59:59.999+07:00`).toISOString();
};

const toUtcMidnightMsFromDateKey = (dateKey) => {
  if (!dateKey) return null;
  return new Date(`${dateKey}T00:00:00.000+07:00`).getTime();
};

export const diffVietnamDateKeys = (fromDateKey, toDateKey) => {
  const fromMs = toUtcMidnightMsFromDateKey(fromDateKey);
  const toMs = toUtcMidnightMsFromDateKey(toDateKey);
  if (fromMs === null || toMs === null) return null;
  return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000));
};

export const reconcileMissLevel = (streak, todayKey) => {
  const current = streak || {};
  const count = current.count || 0;
  const lastCountedDay = current.lastCountedDay || null;
  const storedMissLevel = current.missLevel || 0;

  if (!count || !lastCountedDay) {
    return { missLevel: 0, streakLost: false };
  }

  const dayDiff = diffVietnamDateKeys(lastCountedDay, todayKey);
  if (dayDiff === null || dayDiff <= 1) {
    return { missLevel: storedMissLevel, streakLost: false };
  }

  const missedDays = dayDiff - 1;
  const nextMissLevel = storedMissLevel + missedDays;

  if (nextMissLevel >= 3) {
    return { missLevel: 0, streakLost: true };
  }

  return { missLevel: nextMissLevel, streakLost: false };
};
