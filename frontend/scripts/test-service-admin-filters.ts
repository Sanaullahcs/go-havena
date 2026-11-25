/**
 * Run: npx tsx scripts/test-service-admin-filters.ts
 *
 * Validates client-side filter logic for /admin/services and /admin/service-bills.
 */
import type { PropertyService, UnitServiceBill } from "../src/lib/api/property-services";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

type TypeTab = "all" | "automatic" | "optional" | "pending_verification";
type StatusFilter = "all" | "paid" | "overdue" | "pending_verification" | "rejected" | "unpaid" | "acknowledged";
type ScheduleFilter =
  | "all"
  | "automatic_monthly"
  | "automatic_yearly"
  | "one_time"
  | "optional_monthly"
  | "optional_yearly";

function billApplicationType(bill: UnitServiceBill): "automatic" | "optional" {
  return bill.application_type === "optional" ? "optional" : "automatic";
}

function filterBills(
  bills: UnitServiceBill[],
  typeTab: TypeTab,
  statusFilter: StatusFilter,
  search: string,
) {
  const scoped = typeTab === "all"
    ? bills
    : typeTab === "pending_verification"
      ? bills.filter((bill) => bill.status === "pending_verification")
      : bills.filter((bill) => billApplicationType(bill) === typeTab);
  const byStatus = statusFilter === "all" ? scoped : scoped.filter((bill) => bill.status === statusFilter);
  const query = search.trim().toLowerCase();
  if (!query) return byStatus;
  return byStatus.filter((bill) => {
    const haystack = [
      bill.title,
      bill.service_name,
      bill.unit_number,
      bill.billing_contact?.name,
      bill.status,
      bill.status_label,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function serviceFrequency(service: PropertyService) {
  if (service.billing_frequency === "yearly") return "yearly";
  if (service.billing_frequency === "one_time") return "one_time";
  return "monthly";
}

function matchesScheduleFilter(service: PropertyService, filter: ScheduleFilter) {
  if (filter === "all") return true;
  const frequency = serviceFrequency(service);
  const type = service.application_type === "optional" ? "optional" : "automatic";
  if (filter === "one_time") return frequency === "one_time";
  if (filter === "automatic_monthly") return type === "automatic" && frequency === "monthly";
  if (filter === "automatic_yearly") return type === "automatic" && frequency === "yearly";
  if (filter === "optional_monthly") return type === "optional" && frequency === "monthly";
  return type === "optional" && frequency === "yearly";
}

function filterServices(
  services: PropertyService[],
  typeFilter: TypeTab,
  scheduleFilter: ScheduleFilter,
  search: string,
) {
  const scoped = typeFilter === "all"
    ? services
    : services.filter((service) => service.application_type === typeFilter);
  const bySchedule = scoped.filter((service) => matchesScheduleFilter(service, scheduleFilter));
  const query = search.trim().toLowerCase();
  if (!query) return bySchedule;
  return bySchedule.filter((service) => {
    const haystack = [service.name, service.category, service.application_type, service.billing_frequency]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

const services: PropertyService[] = [
  { id: 1, name: "water bill", category: "water", application_type: "automatic", billing_frequency: "monthly", amount_type: "fixed", amount: 100, status: "active", require_payment_proof: true, require_acknowledgement: false, auto_generate_bills: true, send_notice: true, send_notification: true, requires_admin_approval: false, unsubscribe_mode: "end_of_period" },
  { id: 2, name: "parking dues", category: "parking", application_type: "automatic", billing_frequency: "monthly", amount_type: "variable", amount: null, status: "active", require_payment_proof: true, require_acknowledgement: false, auto_generate_bills: true, send_notice: true, send_notification: true, requires_admin_approval: false, unsubscribe_mode: "end_of_period" },
  { id: 3, name: "house cleaning", category: "house_cleaning", application_type: "optional", billing_frequency: "monthly", amount_type: "fixed", amount: 200, status: "active", require_payment_proof: true, require_acknowledgement: false, auto_generate_bills: true, send_notice: true, send_notification: true, requires_admin_approval: true, unsubscribe_mode: "end_of_period" },
  { id: 4, name: "ac", category: "ac_maintenance", application_type: "optional", billing_frequency: "one_time", amount_type: "fixed", amount: 200, status: "active", require_payment_proof: true, require_acknowledgement: false, auto_generate_bills: false, send_notice: true, send_notification: true, requires_admin_approval: true, unsubscribe_mode: "end_of_period" },
  { id: 5, name: "annual fee", category: "water", application_type: "automatic", billing_frequency: "yearly", amount_type: "fixed", amount: 500, status: "inactive", require_payment_proof: true, require_acknowledgement: false, auto_generate_bills: true, send_notice: true, send_notification: true, requires_admin_approval: false, unsubscribe_mode: "end_of_period" },
  { id: 6, name: "pool pass", category: "water", application_type: "optional", billing_frequency: "yearly", amount_type: "fixed", amount: 150, status: "active", require_payment_proof: true, require_acknowledgement: false, auto_generate_bills: true, send_notice: true, send_notification: true, requires_admin_approval: false, unsubscribe_mode: "end_of_period" },
];

const bills: UnitServiceBill[] = [
  { id: 1, service_id: 1, unit_id: 201, title: "water bill — September 2026", service_name: "water bill", application_type: "automatic", unit_number: "201", billing_period: "2026-09-01", amount: 100, due_date: "2026-09-10", status: "overdue", require_acknowledgement: false, require_payment_proof: true, billing_contact: { id: 1, name: "Muhammad Ahmad" } },
  { id: 2, service_id: 2, unit_id: 202, title: "parking dues — September 2026", service_name: "parking dues", application_type: "automatic", unit_number: "202", billing_period: "2026-09-01", amount: 10, due_date: "2026-09-10", status: "overdue", require_acknowledgement: false, require_payment_proof: true, billing_contact: { id: 2, name: "hasnat" } },
  { id: 3, service_id: 3, unit_id: 121, title: "house cleaning — September 2026", service_name: "house cleaning", application_type: "optional", unit_number: "121", billing_period: "2026-09-01", amount: 200, due_date: "2026-09-10", status: "pending_verification", require_acknowledgement: false, require_payment_proof: true },
  { id: 4, service_id: 4, unit_id: 210, title: "ac — September 2026", service_name: "ac", application_type: "optional", unit_number: "210", billing_period: "2026-09-01", amount: 200, due_date: "2026-09-10", status: "paid", require_acknowledgement: false, require_payment_proof: true },
  { id: 5, service_id: 1, unit_id: 400, title: "water bill — August 2026", service_name: "water bill", application_type: "automatic", unit_number: "400", billing_period: "2026-08-01", amount: 100, due_date: "2026-08-10", status: "rejected", require_acknowledgement: false, require_payment_proof: true },
  { id: 6, service_id: 1, unit_id: 500, title: "water bill — July 2026", service_name: "water bill", application_type: "automatic", unit_number: "500", billing_period: "2026-07-01", amount: 100, due_date: "2026-07-10", status: "acknowledged", require_acknowledgement: true, require_payment_proof: true },
  { id: 7, service_id: 3, unit_id: 500, title: "house cleaning — August 2026", service_name: "house cleaning", application_type: "optional", unit_number: "500", billing_period: "2026-08-01", amount: 200, due_date: "2026-08-10", status: "unpaid", require_acknowledgement: false, require_payment_proof: true },
];

console.log("\nService bills filters");
{
  assert(filterBills(bills, "all", "all", "").length === 7, "All tab + all statuses returns every bill");
  assert(filterBills(bills, "automatic", "all", "").length === 4, "Automatic tab returns 4 bills");
  assert(filterBills(bills, "optional", "all", "").length === 3, "Optional tab returns 3 bills");
  assert(filterBills(bills, "pending_verification", "all", "").length === 1, "Pending verification tab returns uploaded proofs");
  assert(
    filterBills(bills, "pending_verification", "all", "").every((bill) => bill.status === "pending_verification"),
    "Pending verification tab only includes proof uploads",
  );
  assert(filterBills(bills, "all", "overdue", "").length === 2, "Overdue filter returns 2 bills");
  assert(filterBills(bills, "all", "pending_verification", "").length === 1, "Pending filter returns 1 bill");
  assert(filterBills(bills, "optional", "paid", "").length === 1, "Optional + paid returns ac bill");
  assert(filterBills(bills, "automatic", "overdue", "").length === 2, "Automatic + overdue excludes optional");
  assert(filterBills(bills, "optional", "overdue", "").length === 0, "Optional + overdue returns empty");
  assert(filterBills(bills, "all", "all", "hasnat").length === 1, "Search by resident name");
  assert(filterBills(bills, "all", "all", "500").length === 2, "Search by unit number");
  assert(filterBills(bills, "automatic", "rejected", "400").length === 1, "Combined tab + status + search");
  assert(filterBills(bills, "all", "acknowledged", "").every((bill) => bill.status === "acknowledged"), "Acknowledged filter is exact");
}

console.log("\nServices filters");
{
  assert(filterServices(services, "all", "all", "").length === 6, "All tab + all schedules returns every service");
  assert(filterServices(services, "automatic", "all", "").length === 3, "Automatic tab returns 3 services");
  assert(filterServices(services, "optional", "all", "").length === 3, "Optional tab returns 3 services");
  assert(filterServices(services, "all", "automatic_monthly", "").length === 2, "Automatic monthly returns water + parking");
  assert(filterServices(services, "all", "automatic_yearly", "").length === 1, "Automatic yearly returns annual fee");
  assert(filterServices(services, "all", "one_time", "").length === 1, "One-time returns ac");
  assert(filterServices(services, "all", "optional_monthly", "").length === 1, "Optional monthly returns house cleaning");
  assert(filterServices(services, "all", "optional_yearly", "").length === 1, "Optional yearly returns pool pass");
  assert(filterServices(services, "automatic", "optional_monthly", "").length === 0, "Automatic tab + optional monthly is empty");
  assert(filterServices(services, "optional", "automatic_monthly", "").length === 0, "Optional tab + automatic monthly is empty");
  assert(filterServices(services, "all", "all", "pool").length === 1, "Search by service name");
  assert(filterServices(services, "all", "all", "inactive").length === 0, "Search does not match status text by default");
  assert(filterServices(services, "automatic", "one_time", "").length === 0, "Automatic tab excludes optional one-time");
}

console.log("\nEdge cases");
{
  assert(filterBills([], "all", "all", "").length === 0, "Empty bills list");
  assert(filterServices([], "all", "all", "").length === 0, "Empty services list");
  assert(filterBills(bills, "all", "paid", "missing-resident").length === 0, "No false positives on impossible search");
  assert(filterServices(services, "all", "optional_yearly", "pool").length === 1, "Schedule + search narrows correctly");
  assert(filterBills(bills, "all", "unpaid", "").length === 1, "Unpaid filter returns one bill");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
