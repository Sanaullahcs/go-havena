function noticeDayKey(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}
function todayDayKey() {
  return new Date().toISOString().slice(0, 10);
}
function parseClockTime(value) {
  const m = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}
function isExpired(notice) {
  const dayKey = noticeDayKey(notice?.eventDate);
  if (!dayKey) return false;
  const todayKey = todayDayKey();
  if (dayKey < todayKey) return true;
  if (dayKey === todayKey) {
    const clock = parseClockTime(notice.eventTimeEnd);
    if (clock) {
      const end = new Date();
      end.setHours(clock.hour, clock.minute, 0, 0);
      return new Date() > end;
    }
  }
  return false;
}

const future = { id: 1, isEvent: true, eventDate: "2026-12-01", eventTimeEnd: "20:00" };
const past = { id: 2, isEvent: true, eventDate: "2026-07-15", eventTimeEnd: "20:00" };
const todayPastEnd = { id: 3, isEvent: true, eventDate: todayDayKey(), eventTimeEnd: "00:01" };

let failed = 0;
function ok(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); failed++; return; }
  console.log("  ✓", msg);
}

ok(!isExpired(future), "future event not expired");
ok(isExpired(past), "past event expired");
ok(isExpired(todayPastEnd), "today past end expired");

const upcoming = [future, past, todayPastEnd].filter((n) => n.isEvent && !isExpired(n));
ok(upcoming.length === 1 && upcoming[0].id === 1, "home shows only upcoming events");

console.log(failed ? `\n${failed} failed` : "\nMobile home filter checks passed");
process.exit(failed ? 1 : 0);
