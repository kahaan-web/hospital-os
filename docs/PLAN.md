# Hospital OS: Product & Build Plan (approved)

Source: Grok Bot plan Page https://cursor.com/canvas/store-1df558af-9fa2-43b6-a35e-6a34c8780237/fae88310-be69-498d-bc61-a701da0f065a
Approved by Kahaan on 10 Nov 2026 ("I think it seems decent ... Go ahead and build it").

## Decisions Kahaan added on approval (these override the Page where they differ)
1. There must be a platform **App Admin** who controls which tier/plan can use which modules (and prices). All of it configurable by the app admin, not hard-coded.
2. There must be a proper **setup wizard**: a hospital owner or hospital manager comes on, goes through the wizard, enables modules and buys modules.
3. **Android apps**: wherever the module doc mentions an Android app, that app must have everything the doc lists for it. Build the website and Android apps well.
4. Build on the Dell desktop (Windows). Repo will be a private GitHub repo under kahaan-web (kahaan@veefin.com) shared with kahaankapasi; it is created later. For now: local git only, no remote, no push.
5. Use Claude Code + Claude Fable 5.2 (standard, high effort) for UI and system design. Do not use Cursor.

## Plan Page source (TSX)
The Page below is the approved plan, written as a React/TSX canvas. Read the data arrays and the JSX text: sections 1-8 are the plan.
Note: the Page's "Dev setup" line about running services on the shared Linux box is superseded: dev now runs on this Dell (Docker Postgres with small memory limits).

```tsx
import { Page, Section, Text, Table, Select, Segmented, Input, Grid, Metrics, Callout, Steps, Diagram, Properties, Rows, NumberedList, TableOfContents, Button, useState, useMemo } from "grok/canvas";

const MODS: string[] = ["Patient Registration", "Doctor Appointment / Visit", "OP Billing & Cash handling", "Admission / Discharges / Transfers", "IP Billing & Cash Handling", "Pharmacy", "LAB", "Nurse Station", "Doctor Accounting", "CPOE"];
const STAGE: number[] = [1, 1, 1, 3, 1, 3, 4, 4, 2, 1];
const ST: Record<string, string> = { C: "Change", N: "No Change", W: "New", "-": "Not set" };
const TY: Record<string, string> = { F: "Function", R: "Report", I: "Interface" };

type Raw = [number, string, string, string, string];
const RAW: Raw[] = [[0,"F","New Registration","C","YYY"],[0,"F","Edit Registration","C","YYY"],[0,"F","Attach patient documents","N","NYY"],[0,"R","Print Patient Photo ID","N","NYY"],[0,"R","Print Case paper","W","YYY"],[0,"R","Print Register by Date Range / By City / State / Gender / Age","N","YYY"],[0,"R","Print Stickers","N","YYY"],[0,"R","Patient Excel Data","W","NYY"],[0,"F","Send Mailers via email / SMS","W","NYY"],[1,"F","Take Appointment","N","YYY"],[1,"F","Phone Appointment (Without Registration","N","YYY"],[1,"F","Cancel / Reschedule Appointment","N","YYY"],[1,"F","Counter (New / Repeate Patients)","N","YYY"],[1,"F","Visit Registration","C","YYY"],[1,"R","Appointment Diary for Single Doctor / All Doctors","W","YYY"],[1,"R","Visit Satatisitcs Summary by Clinic","W","YYY"],[1,"R","Visit Detail by Doctor","W","YYY"],[1,"R","Visit Register","W","YYY"],[2,"F","Accept Deposit","N","YYY"],[2,"F","Refund Deposit","N","YYY"],[2,"F","OP Voucher Posting (Cash / Credit / Free)","N","YYY"],[2,"F","OP Refund","N","YYY"],[2,"F","OP Settlements","N","YYY"],[2,"F","Concessions","N","YYY"],[2,"R","OP Voucher (Document)","N","YYY"],[2,"R","Cash Summary / Detail","N","YYY"],[2,"R","Revenue Summary / Detail","N","YYY"],[2,"R","Doctor Sharing / Detail","N","YYY"],[2,"R","Patient Outstanding","N","YYY"],[2,"R","Deposit Register","N","YYY"],[3,"F","Admission","N","YYY"],[3,"F","Transfer","N","YYY"],[3,"F","Discharge","N","YYY"],[3,"F","Discharge Summary","N","NYY"],[3,"R","Admission Register","N","YYY"],[3,"R","Transfer Register","N","YYY"],[3,"R","Discharge Register","N","YYY"],[3,"R","Discharge Summary Report","N","YYY"],[3,"R","Patient Stickers","N","YYY"],[4,"F","Posting Charges for Services","N","YYY"],[4,"F","Accept Deposit","N","YYY"],[4,"F","Refund Deposit","N","YYY"],[4,"F","Posting Reversals","N","YYY"],[4,"F","Bill Preparation","N","YYY"],[4,"F","Concessions","N","YYY"],[4,"F","Bill Settlement","N","YYY"],[4,"R","Patient Statement of Account (Summary / Detail)","N","YYY"],[4,"R","Revenue Summary / Detail","N","YYY"],[4,"R","Bill Register","N","YYY"],[4,"R","Concession Register","N","YYY"],[4,"R","Doctor Sharing / Detail","W","YYY"],[4,"R","Deposit Register","N","YYY"],[4,"R","Patient Outstanding","N","NYY"],[4,"R","Cash Summary / Detail","N","YYY"],[5,"F","Purchase Order","C","NYY"],[5,"F","Material Receipts","C","YYY"],[5,"F","Material Returns","C","YYY"],[5,"F","Issue to IP Patients / Returns","N","YYY"],[5,"F","Issue to OP Patients","N","YYY"],[5,"F","Outside Sales","N","YYY"],[5,"F","Stock Adjustments","N","YYY"],[5,"F","Payment Approvals","W","YYY"],[5,"F","Bill Payment","W","YYY"],[5,"R","Stock Register Summary / Details","N","YYY"],[5,"R","Purchase Register","N","NYY"],[5,"R","Receipt Register","N","YYY"],[5,"R","Rejection Register","N","YYY"],[5,"R","Issue Register","N","YYY"],[5,"R","Issue Return Register","N","YYY"],[5,"R","Stock Adjustment register","N","YYY"],[5,"R","Patient Issue / Return Statement IP","N","YYY"],[5,"R","Expiry Item Report","N","YYY"],[5,"R","Supplier Outstanding","W","YYY"],[5,"R","Supplier Payment Register","W","YYY"],[6,"F","Sample Collection","N","NYY"],[6,"F","Result Entry","N","NYY"],[6,"F","Master Template","N","NYY"],[6,"F","Send Result on EMAIL","N","NNY"],[6,"R","Lab Result Report","N","NYY"],[6,"I","2 Lab Equipments","-","NNY"],[6,"F","Patient History","-","NYY"],[6,"F","Sample Status","-","NYY"],[6,"R","LAB MIS","-","NYY"],[7,"F","Lab Orders","N","NNY"],[7,"F","Medicine Orders","N","NNY"],[7,"F","View Test Results","N","NNY"],[7,"R","Investigation Prescription","-","NNY"],[7,"R","Medicine Prescription","-","NNY"],[7,"R","Doctors Notes","-","NNY"],[7,"R","Patient Vitals Table / Graph","-","NNY"],[8,"F","Setup Doctor Sharing","-","NNY"],[8,"F","Generate Doctor Payable","-","NNY"],[8,"F","Generate Excel Data","-","NNY"],[0,"R","Print Barcode","N","NNY"],[0,"F","MLC Registration","N","NNY"],[0,"R","MLC Case Register","-","NNY"],[2,"R","Visit Statistics for the period","N","NYY"],[9,"F","Chief Complaints","-","NNY"],[9,"F","Diagnostic Orders","-","NNY"],[9,"F","Medicine Orders","-","NNY"],[9,"F","Procedure Orders","-","NNY"],[9,"F","Appointment Diary","-","NNY"],[9,"F","Request Reservation / Admission","-","NNY"],[8,"R","Doctor Transaction Details","-","NNY"],[8,"R","Doctor Transaction Summary","-","NNY"],[8,"R","Doctor Invoice","-","NNY"],[8,"R","Doctor Payment Statement","-","NNY"],[9,"R","Investigation Prescription","-","NNY"],[9,"R","Medicine Prescription","-","NNY"],[9,"R","Doctors Notes","-","NNY"],[9,"R","Patient Vitals Table / Graph","-","NNY"],[9,"F","Patient Vitals","-","NNY"]];

const TIER_RANK = (t: string): number => (t[0] === "Y" ? 0 : t[1] === "Y" ? 1 : 2);
const yn = (c: string): { text: string; tone?: "success" } | string => (c === "Y" ? { text: "Yes", tone: "success" } : "—");

type SortKey = "sheet" | "module" | "tier" | "stage";
type TierFilter = "all" | "basic" | "medium" | "premium";

const MOD_COUNTS = MODS.map((m: string, i: number) => {
  const rs = RAW.filter((r: Raw) => r[0] === i);
  return { m, i, n: rs.length, b: rs.filter((r: Raw) => r[4][0] === "Y").length, me: rs.filter((r: Raw) => r[4][1] === "Y").length, p: rs.filter((r: Raw) => r[4][2] === "Y").length };
});

export default function App() {
  const [mod, setMod] = useState<string>("all");
  const [tier, setTier] = useState<TierFilter>("all");
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("sheet");

  const rows = useMemo(() => {
    let rs = RAW.map((r: Raw, idx: number) => ({ r, idx }));
    rs = rs.filter(({ r }) => (mod === "all" || String(r[0]) === mod)
      && (status === "all" || r[3] === status)
      && (tier === "all" || (tier === "basic" && r[4][0] === "Y") || (tier === "medium" && r[4][1] === "Y") || (tier === "premium" && r[4][2] === "Y"))
      && (q.trim() === "" || r[2].toLowerCase().includes(q.trim().toLowerCase())));
    const s = [...rs];
    if (sort === "module") s.sort((a, b) => a.r[0] - b.r[0] || a.idx - b.idx);
    if (sort === "tier") s.sort((a, b) => TIER_RANK(a.r[4]) - TIER_RANK(b.r[4]) || a.r[0] - b.r[0] || a.idx - b.idx);
    if (sort === "stage") s.sort((a, b) => STAGE[a.r[0]] - STAGE[b.r[0]] || a.r[0] - b.r[0] || a.idx - b.idx);
    return s.map(({ r }) => [MODS[r[0]], TY[r[1]], r[2], ST[r[3]], yn(r[4][0]), yn(r[4][1]), yn(r[4][2]), String(STAGE[r[0]])]);
  }, [mod, tier, status, q, sort]);

  const reset = (): void => { setMod("all"); setTier("all"); setStatus("all"); setQ(""); setSort("sheet"); };

  return (
    <Page width="wide" title="Hospital OS: Product & Build Plan" summary="Kahaan, this turns your two docs (the HMIS module list and the feature-by-tier sheet) into a scoped plan for a multitenant HMIS SaaS: what's in each tier, how a nursing home self-onboards and pays, how we keep tenants and health data safe, what we build first, and what I need you to decide." sources={["hmis-modules.pdf / hmis-modules.txt (Word doc, author metadata: Ajay Sheth, created 19 Oct 2026)", "hmis-features-by-tier.xlsx (Sheet1, Sheet3, Sheet4)"]}>
      <TableOfContents items={[
        { label: "Where things stand", id: "status" },
        { label: "1. Module catalogue with tiers", id: "catalogue" },
        { label: "Tier counts by module", id: "counts", depth: 1 },
        { label: "Every function, filterable", id: "table", depth: 1 },
        { label: "The 27 doc modules and Android apps", id: "map", depth: 1 },
        { label: "Where the docs disagree or are unclear", id: "ambig", depth: 1 },
        { label: "2. Self-onboarding and module purchase", id: "onboard" },
        { label: "3. Multitenant architecture", id: "arch" },
        { label: "4. Stack and hosting", id: "stack" },
        { label: "5. MVP slice", id: "mvp" },
        { label: "6. Phases for everything else", id: "phases" },
        { label: "7. UI and system design with Fable", id: "fable" },
        { label: "8. Open questions for you", id: "questions" },
      ]} />

      <Section heading="Where things stand" id="status">
        <Callout lead="Plan only, nothing built yet.">Once you approve this, I'll start the build with Claude Code and Claude Fable 5.2. Until then: no code, no real payments, and only mock or sample patient data until production go-live.</Callout>
      </Section>

      <Section heading="1. Module catalogue with tiers" id="catalogue">
        <Text>The tier sheet covers 10 modules and 112 functions and reports. Every tier is a strict superset of the one below it: nothing in Basic is missing from Medium, and nothing in Medium is missing from Premium.</Text>
        <Metrics metrics={[
          { value: "112", label: "Functions and reports", detail: "10 modules in Sheet1" },
          { value: "66", label: "In Basic" },
          { value: "82", label: "In Medium", detail: "+16 over Basic" },
          { value: "112", label: "In Premium", detail: "+30 over Medium" },
          { value: "67 / 12 / 6", label: "No Change / New / Change", detail: "27 rows have no status" },
        ]} />

        <Section heading="Tier counts by module" id="counts" caption="From Sheet1; Stage is from Sheet3">
          <Table columns={["Module (sheet name)", "Items", "Basic", "Medium", "Premium", "Stage"]} rows={MOD_COUNTS.map((c) => [c.m, String(c.n), String(c.b), String(c.me), String(c.p), String(STAGE[c.i])])} />
          <Text>Basic already covers most of the front office: registration, appointments, OPD and IPD billing, admissions and pharmacy. Lab starts at Medium; Nurse Station, Doctor Accounting and CPOE are Premium only.</Text>
        </Section>

        <Section heading="Every function, filterable" id="table">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <Select label="Module" value={mod} onChange={(v: string) => setMod(v)} options={[{ value: "all", label: "All modules" }, ...MODS.map((m: string, i: number) => ({ value: String(i), label: m }))]} />
            <Select label="Status" value={status} onChange={(v: string) => setStatus(v)} options={[{ value: "all", label: "Any status" }, { value: "C", label: "Change" }, { value: "N", label: "No Change" }, { value: "W", label: "New" }, { value: "-", label: "Not set" }]} />
            <Input label="Search" value={q} onChange={(v: string) => setQ(v)} placeholder="e.g. deposit" />
            <Button label="Reset" onClick={reset} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
            <Segmented<TierFilter> value={tier} onChange={(v: TierFilter) => setTier(v)} options={[{ value: "all", label: "All tiers" }, { value: "basic", label: "In Basic" }, { value: "medium", label: "In Medium" }, { value: "premium", label: "In Premium" }]} />
            <Segmented<SortKey> value={sort} onChange={(v: SortKey) => setSort(v)} options={[{ value: "sheet", label: "Sheet order" }, { value: "module", label: "By module" }, { value: "tier", label: "Lowest tier" }, { value: "stage", label: "By stage" }]} />
          </div>
          <Table columns={["Module", "Type", "Function / report", "Status", "Basic", "Medium", "Premium", "Stage"]} rows={rows} />
          <Text>{`Showing ${rows.length} of 112. Names are copied exactly from Sheet1, typos included.`}</Text>
        </Section>

        <Section heading="The 27 doc modules and Android apps" id="map" caption="Phase numbers refer to section 6">
          <Table columns={["#", "Module in the PDF", "Tier detail in sheet", "Phase"]} rows={[
            ["1", "Patient Registration", "Patient Registration", "1 (MVP)"],
            ["2", "Appointment Scheduling", "Doctor Appointment / Visit", "1 (MVP)"],
            ["3", "Consultation Visit Registration", "Doctor Appointment / Visit", "1 (MVP)"],
            ["4", "Outpatient Billing and Cash Handling", "OP Billing & Cash handling", "1 (MVP)"],
            ["5", "Reservations, Admission, Discharge, Transfer", "Admission / Discharges / Transfers", "2"],
            ["6", "Nurse Station", "Nurse Station", "4"],
            ["7", "In Patient Billing and Cash Handling", "IP Billing & Cash Handling", "2"],
            ["8", "OT Scheduling", "—", "4"],
            ["9", "Laboratory Information System", "LAB", "4"],
            ["10", "Radiology Reporting", "—", "4"],
            ["11", "Doctors Accounting", "Doctor Accounting", "3"],
            ["12", "Insurance", "—", "3"],
            ["13", "Pharmacy and Stores Inventory", "Pharmacy", "3"],
            ["14", "Indents & Purchase Management", "— (Pharmacy has Purchase Order)", "3"],
            ["15", "Scrolling, Certification Bill Passing", "—", "5"],
            ["16", "Blood Bank", "—", "4"],
            ["17", "Linen & Laundry", "—", "5"],
            ["18", "Equipment Maintenance", "—", "5"],
            ["19", "Maintenance Tracker", "—", "5"],
            ["20", "Payroll & Attendance", "—", "5"],
            ["21", "Users Management", "—", "0–1 (MVP)"],
            ["22", "Access Data Migration", "—", "2 (onboarding tool)"],
            ["23", "Night Audit", "—", "3"],
            ["24", "Marketing", "—", "5"],
            ["25", "Hospital MIS & Dashboards", "— (LAB MIS, revenue reports)", "2 onward"],
            ["26", "Employee Complaint Tracker", "—", "5"],
            ["27", "Medicard Management", "—", "3"],
            ["—", "CPOE (not in the PDF list)", "CPOE", "4"],
            ["A1", "Android: MIS / Dashboard (revenue, material, occupancy, doctor performance, outstanding, cost centre)", "—", "6"],
            ["A2", "Android: Equipment Maintenance (non-operational equipment, problems/solutions, master with downtime/cost)", "—", "6"],
            ["A3", "Android: Patient Portal (registration, appointments, visit medical data, accounts, feedback)", "—", "6"],
            ["A4", "Android: Doctor's Medical Portal (appointment diary, medical diary to order tests/medicines)", "—", "6"],
            ["A5", "Android: Nurses Workbench (doctor's orders, vitals, medicine administration, diet orders)", "—", "6"],
            ["A6", "Android: HR & Payroll", "—", "6"],
            ["A7", "Android: Maintenance Tracker", "—", "6"],
          ]} />
          <Text>17 of the 27 modules have no feature breakdown or tier in the sheet, so I'll scope those with you before building rather than guess at their features.</Text>
        </Section>

        <Section heading="Where the docs disagree or are unclear" id="ambig">
          <Callout tone="warning" lead="Sheet1 and Sheet3 disagree on 14 tier cells.">I've treated Sheet1 as the source of truth because it's the only flat table with Status. Sheet3 is more generous each time. Sheet4 matches Sheet1 exactly.</Callout>
          <Table columns={["Module", "Function / report", "Sheet1 lowest tier", "Sheet3 lowest tier"]} rows={[
            ["Patient Registration", "Attach patient documents", "Medium", "Basic"],
            ["Patient Registration", "Print Barcode", "Premium", "Basic"],
            ["Patient Registration", "MLC Registration", "Premium", "Basic"],
            ["Admission / Discharges / Transfers", "Discharge Summary", "Medium", "Basic"],
            ["IP Billing & Cash Handling", "Patient Outstanding", "Medium", "Basic"],
            ["OP Billing & Cash handling", "Visit Statistics for the period", "Medium", "Basic"],
            ["LAB", "Send Result on EMAIL", "Premium", "Medium"],
            ["Doctor Accounting", "All 7 functions and reports", "Premium", "Medium"],
          ]} />
          <NumberedList items={[
            "Stage (Sheet3 only) goes from 1 to 4 per module but its meaning isn't stated. I've read it as rollout order, but CPOE is Stage 1 and Premium only, and IP Billing is Stage 1 while Admissions is Stage 3, even though IP billing depends on admissions.",
            "27 of 112 rows have no Status, including all of Doctor Accounting and CPOE and the newer LAB rows. Change, No Change and New also suggest the sheet is a delta against an existing system, which one?",
            "Sheet3 lists \"LAB Statistics\" where Sheet1 has \"LAB MIS\", and Sheet3 leaves out the \"2 Lab Equipments\" interface (Premium).",
            "One Sheet1 row spells the module \"IP Billing & Cash handling\" (Cash Summary / Detail). I merged it into IP Billing & Cash Handling.",
            "The Status Count column is 1 or blank on every row, so it carries no information.",
            "The PDF title names three locations (Mumbai / Indore / Jaipur, typed \"MIUMBAI\"), which reads like one specific hospital group's requirements rather than a generic SaaS spec.",
            "Maintenance Tracker appears both as Group I module 19 and as Android item 7. The PDF also has typos (EQUIPMEMT, WORKBANCH, ENRY, VITL); the sheet has Satatisitcs, Repeate, and a missing bracket in Phone Appointment.",
            "Tiers are set per function, not per module. It isn't clear whether a customer buys one tier for everything or a tier per module.",
          ]} />
        </Section>
      </Section>

      <Section heading="2. Self-onboarding and module purchase" id="onboard">
        <Steps steps={[
          { title: "Sign up", detail: "Owner email or mobile with OTP, name, and acceptance of the terms and privacy notice (DPDP consent captured and versioned)." },
          { title: "Facility profile", detail: "Type (nursing home, clinic, hospital), legal name, GSTIN (optional), registration or licence number, bed count, specialities, logo." },
          { title: "Locations", detail: "Add one or more branches (for example Mumbai, Indore, Jaipur), each with its own address, GST state, departments, counters and bill series." },
          { title: "Pick a plan", detail: "Choose Basic, Medium or Premium and the modules to switch on. A live comparison is built from the tier matrix above, with a per-location and per-month or per-year price." },
          { title: "Pay (mock)", detail: "A realistic checkout with UPI, card and netbanking, simulated success, failure and pending, and webhooks. No real money moves until you approve a gateway." },
          { title: "Tax invoice", detail: "GST invoice: 18% split into CGST + SGST for the same state or IGST for another state, invoice number series, our GSTIN and theirs, and a SAC code to confirm with a CA. Downloadable PDF." },
          { title: "Provisioning", detail: "Create the tenant, seed masters (departments, services, tariffs, doctors), switch on entitlements for the chosen modules, and load sample data into a sandbox." },
          { title: "Admin user", detail: "The owner becomes Tenant Admin, turns on 2FA, and invites staff by role and location." },
          { title: "Go live", detail: "A checklist covers masters, bill series, printers and stickers, with an optional Access data migration import and a switch from sandbox to live." },
        ]} />
        <Text>After go-live: upgrades, downgrades and add-on modules are prorated, renewals and dunning run on the same mock gateway, and a 14-day trial is optional (your call).</Text>
      </Section>

      <Section heading="3. Multitenant architecture" id="arch">
        <Diagram direction="horizontal" nodes={[
          { id: "web", label: "Web app", detail: "Next.js" },
          { id: "and", label: "Android apps", detail: "later" },
          { id: "api", label: "API", detail: "auth, tenant context, RBAC, entitlements" },
          { id: "db", label: "Postgres", detail: "RLS on tenant_id" },
          { id: "audit", label: "Audit log", detail: "append-only" },
          { id: "obj", label: "Object storage", detail: "documents, reports" },
          { id: "q", label: "Redis + jobs", detail: "SMS, email, PDFs" },
        ]} edges={[
          { from: "web", to: "api" }, { from: "and", to: "api", dashed: true },
          { from: "api", to: "db" }, { from: "api", to: "audit" }, { from: "api", to: "obj" }, { from: "api", to: "q" },
        ]} />
        <Rows rows={[
          { title: "Tenant isolation", detail: "Shared Postgres with tenant_id on every row and row-level security enforced from a per-request session variable, so a missed WHERE clause can't leak data. Large customers can move to schema-per-tenant or a dedicated database without code changes." },
          { title: "RBAC per hospital and location", detail: "Tenant → Locations → Departments. Roles: Tenant Admin, Location Admin, Front Desk, Doctor, Nurse, Cashier/Billing, Pharmacist, Lab Tech, Accounts. Permissions are scoped to one or more locations." },
          { title: "Entitlements by tier", detail: "Each function in the matrix is a permission key, plans map to sets of keys, and checks run in the API and in the UI. Add-ons and per-tenant overrides are allowed." },
          { title: "Audit logs", detail: "Append-only, hash-chained log of who did what to which record, from which location and IP, with before and after values. Kept for the retention period and exportable for inspections." },
          { title: "Encryption", detail: "TLS 1.2+ in transit and AES-256 at rest (disk and backups), with field-level encryption for sensitive identifiers and keys in a managed KMS." },
          { title: "DPDP Act 2023", detail: "The hospital is the Data Fiduciary and we are its Data Processor under a DPA. Covers notice and consent with purpose tags, purpose limitation, data principal rights (access, correction, erasure, grievance), breach notice to the Data Protection Board and affected patients, and retention rules." },
          { title: "Data location", detail: "All data, backups and logs stay in an India region by default, which is what hospitals will expect even where the law allows transfer abroad." },
          { title: "ABDM readiness (optional)", detail: "ABHA creation and linking at registration (Scan & Share at OPD counters), HFR facility and HPR doctor IDs, and FHIR R4 records for HIP and HIU sharing. Designed in from day 1 and switched on per tenant." },
          { title: "Data rule", detail: "Mock and sample data only in dev and staging until production go-live. No real patient records on the box or the Mac." },
        ]} />
      </Section>

      <Section heading="4. Stack and hosting" id="stack">
        <Properties items={[
          { label: "Web", value: "Next.js + TypeScript, Tailwind, shadcn-style component library built from the Fable design system" },
          { label: "API", value: "NestJS (TypeScript) with OpenAPI, Prisma or Drizzle, and Zod validation" },
          { label: "Data", value: "Postgres 16 with RLS, Redis for queues and cache, S3-compatible object storage" },
          { label: "Auth", value: "OTP and password login, TOTP 2FA for admins, session or JWT with tenant and location claims" },
          { label: "Jobs and notifications", value: "BullMQ workers for PDFs, SMS and WhatsApp, and email (provider to be decided)" },
          { label: "Hosting", value: "AWS Mumbai (ap-south-1), or GCP Mumbai / Azure Central India. Supabase in its Mumbai region is a quick-start option" },
          { label: "Android", value: "React Native / Expo, sharing TypeScript types with the web app. Kotlin only if a native need shows up" },
          { label: "Dev setup", value: "Postgres, Redis and Docker run on the shared Linux box or a hosted dev environment, never on your 8 GB MacBook with low disk space" },
        ]} />
        <Table columns={["Environment", "What's in it", "Monthly (estimate)"]} rows={[
          ["Dev / staging", "Small VM or containers, small managed Postgres, storage", "₹3,000–8,000"],
          ["MVP production (first 5–20 tenants)", "2 app instances, managed Postgres with backups, Redis, storage, monitoring", "₹15,000–40,000"],
          ["Growth (100+ tenants)", "Autoscaling, read replica, larger database, WAF, log retention", "₹60,000–2,00,000"],
          ["Extras", "SMS / WhatsApp, email, domain, error tracking", "₹1,000–10,000 + usage"],
        ]} />
        <Text>All costs are rough estimates, before GST and before real vendor quotes.</Text>
      </Section>

      <Section heading="5. MVP slice" id="mvp">
        <Table columns={["MVP piece", "Doc module(s)", "Scope from the sheet"]} rows={[
          ["Onboarding + subscription billing", "Platform (not in docs)", "Section 2 flow, mock gateway, GST invoices, entitlements"],
          ["Users management", "21 Users Management", "Roles, locations, invites, 2FA, audit log (no sheet detail; designed by us)"],
          ["Patient Registration", "1 Patient Registration", "12 items: Basic 5, Medium 9, Premium 12 (MLC and barcode in Premium)"],
          ["Appointments", "2 Appointment Scheduling", "Doctor Appointment / Visit: take, phone, cancel/reschedule, counter, appointment diary"],
          ["OPD visit", "3 Consultation Visit Registration", "Visit Registration plus visit register, detail and statistics reports"],
          ["OPD billing", "4 Outpatient Billing and Cash Handling", "13 items: vouchers, deposits, refunds, settlements, concessions, cash and revenue reports"],
        ]} />
        <Text>That's 34 of the 112 sheet items across 4 sheet modules, all in Stage 1. It's enough for a small nursing home to run its OPD front desk end to end.</Text>
      </Section>

      <Section heading="6. Phases for everything else" id="phases">
        <Table columns={["Phase", "Modules", "Why this order"]} rows={[
          ["0 Foundations", "Tenancy, auth, RBAC, audit, entitlements, design system, mock billing", "Everything else sits on this"],
          ["1 MVP", "Registration, Appointments, OPD visit, OPD billing, Users", "Stage 1 in the sheet; fastest path to a paying OPD"],
          ["2 Inpatient", "ADT + reservations, IP Billing, Access data migration, first MIS dashboards", "IP billing needs admissions; migration unlocks existing hospitals"],
          ["3 Money and stock", "Pharmacy and stores, Indents & purchase, Doctors accounting, Insurance, Medicard, Night audit", "Pharmacy is Stage 3, Doctor Accounting Stage 2; they close the revenue loop"],
          ["4 Clinical", "LAB (incl. 2 equipment interfaces), Nurse Station, CPOE, Radiology, OT scheduling, Blood bank", "LAB and Nurse Station are Stage 4 and Medium or Premium; heavier clinical safety work"],
          ["5 Back office", "Payroll & attendance, Equipment maintenance, Maintenance tracker, Linen & laundry, Scrolling / bill passing, Marketing, Employee complaints", "No tier detail yet; scope with you first"],
          ["6 Android", "Patient portal, Doctor portal, Nurses workbench, MIS, Equipment maintenance, HR & payroll, Maintenance tracker", "Built on the same APIs once the web modules they depend on exist"],
        ]} />
      </Section>

      <Section heading="7. UI and system design with Fable" id="fable">
        <Steps steps={[
          { title: "Update Claude Code first", detail: "Your Mac has 2.1.231 and Fable needs 2.1.321 or later, so update before the first session." },
          { title: "Model settings", detail: "Claude Fable 5.2: standard model, high effort, never fast mode. No Cursor anywhere in this build." },
          { title: "Design system before screens", detail: "Tokens, type, colour, density for busy front desks, tables, forms, print layouts (case paper, stickers, vouchers), and English plus Hindi readiness." },
          { title: "Then screens", detail: "Onboarding and checkout, then registration, appointment diary, OPD visit, OPD billing, then admin and users." },
          { title: "System design", detail: "The same Fable sessions draft the schema, RLS policies, entitlement map and API contracts. I review each one against this plan." },
          { title: "My role", detail: "I plan each session, write the prompts, review the output, and keep this Page and the backlog current." },
        ]} />
        <Callout tone="info" lead="Claude usage is shared with Flippr.">Before each Claude Code or Fable session I send Chotu the plan and rough size (number of 5-hour windows), and afterwards what was used: tool, model, % and purpose. Other AI use goes to Chotu as an FYI. As of 10 Nov, 4:18 PM IST, the weekly limit was 21% used and resets Thu 12 Nov, 3:29 AM IST. Fable may use up to 50% of the weekly limit and is free on Pro until 17 Nov, 1:29 PM IST. The free Fable reset is kept for when the weekly bar runs out.</Callout>
      </Section>

      <Section heading="8. Open questions for you" id="questions">
        <NumberedList items={[
          "Who is the customer? Is this a client project (the PDF names Mumbai / Indore / Jaipur and was authored by Ajay Sheth), a product of your own, or both?",
          "Brand name and domain for the product.",
          "Repo: which GitHub account or org, and private or public?",
          "Hosting: AWS, GCP, Azure or Supabase in India, and a monthly budget ceiling.",
          "Payment gateway (Razorpay, Cashfree or another) and when to switch from mock to real. Who issues the GST invoices (your GSTIN)?",
          "Pricing: price per tier, per location, per bed or per user? Monthly or annual? A free trial?",
          "Do customers buy one tier for everything, or pick a tier per module?",
          "Web first (my recommendation) or Android first?",
          "Which tier sheet wins: Sheet1 (what I used) or Sheet3 where they differ? What does Stage mean?",
          "Is there an existing system that Change / No Change / New refers to, and is Access Data Migration about MS Access?",
          "Scope for the 17 modules with no tier detail, and whether CPOE (sheet only) is a separate module or part of the Doctor portal.",
          "ABDM: switch it on in the MVP or later?",
        ]} />
      </Section>
    </Page>
  );
}
```
