import { validateNoticeForm } from "../src/lib/admin/notice-form-validation.ts";

const now = new Date(2026, 9, 5, 15, 19, 0);
const today = "2026-10-05";
const yesterday = "2026-10-04";
const tomorrow = "2026-10-06";
const message = "Please select a future date and time.";

function check(name: string, ok: boolean, detail: string) {
  console.log(ok ? "PASS" : "FAIL", name, detail);
  if (!ok) process.exitCode = 1;
}

for (const kind of ["notice", "event"] as const) {
  const pastTime = validateNoticeForm(
    {
      title: "Pool hours",
      body: "The pool will be open for residents this evening.",
      category: kind === "event" ? "event" : "maintenance",
      location: "Courtyard",
      event_date: today,
      event_end_date: today,
      event_time: "09:00",
      event_time_end: "10:00",
      event_capacity: kind === "event" ? "3" : "",
    },
    { kind, publishNow: true, now },
  );
  check(`${kind} past time message`, pastTime.event_time === message, String(pastTime.event_time));
  check(`${kind} past end time message`, pastTime.event_time_end === message, String(pastTime.event_time_end));

  const future = validateNoticeForm(
    {
      title: "Pool hours",
      body: "The pool will be open for residents this evening.",
      category: kind === "event" ? "event" : "maintenance",
      location: "Courtyard",
      event_date: today,
      event_end_date: today,
      event_time: "16:00",
      event_time_end: "17:00",
      event_capacity: kind === "event" ? "3" : "",
    },
    { kind, publishNow: true, now },
  );
  check(
    `${kind} future today is clear`,
    !future.event_date && !future.event_time && !future.event_time_end,
    JSON.stringify({ date: future.event_date, time: future.event_time, end: future.event_time_end }),
  );

  const pastDate = validateNoticeForm(
    {
      title: "Pool hours",
      body: "The pool will be open for residents this evening.",
      category: kind === "event" ? "event" : "maintenance",
      location: "Courtyard",
      event_date: yesterday,
      event_end_date: yesterday,
      event_time: "18:00",
      event_time_end: "19:00",
      event_capacity: "",
    },
    { kind, publishNow: true, now },
  );
  check(`${kind} past date message`, pastDate.event_date === message && pastDate.event_end_date === message, JSON.stringify(pastDate));

  const earlyTomorrow = validateNoticeForm(
    {
      title: "Pool hours",
      body: "The pool will be open for residents this evening.",
      category: kind === "event" ? "event" : "maintenance",
      location: "Courtyard",
      event_date: tomorrow,
      event_end_date: tomorrow,
      event_time: "01:00",
      event_time_end: "02:00",
      event_capacity: "",
    },
    { kind, publishNow: true, now },
  );
  check(
    `${kind} tomorrow morning is clear`,
    !earlyTomorrow.event_date && !earlyTomorrow.event_time && !earlyTomorrow.event_time_end,
    JSON.stringify(earlyTomorrow),
  );
}
