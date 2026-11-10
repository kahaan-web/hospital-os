// Module catalogue: the 27 HMIS Group I modules and 7 Android apps from docs/source/hmis-modules.txt,
// plus CPOE (present only in the tier sheet). This is the *seed*; the App Admin can change status,
// descriptions, add-on flags and prices at runtime, so nothing here is authoritative after seeding.

export type ModuleKind = 'hmis' | 'android';
export type ModuleStatus = 'available' | 'coming_soon' | 'hidden';
export type ModuleCategory =
  | 'front_office'
  | 'inpatient'
  | 'clinical'
  | 'finance'
  | 'inventory'
  | 'back_office'
  | 'platform'
  | 'mobile';

export interface ModuleDef {
  /** Stable key, used in entitlement keys and URLs. */
  key: string;
  /** Short code shown in the catalogue: M01–M27, CPOE, A1–A7. */
  code: string;
  /** Number in the client document (null for CPOE). */
  docNo: number | null;
  name: string;
  /** Name exactly as printed in the client document (typos included). */
  docName: string;
  kind: ModuleKind;
  category: ModuleCategory;
  description: string;
  /** lucide-react icon name. */
  icon: string;
  /** Build phase from PLAN.md §6. */
  phase: string;
  /** Sheet1 module names whose rows feed this module. */
  sheetModule: string | null;
  /** When a sheet module is split over two doc modules, the exact Sheet1 names that belong here. */
  sheetNames?: readonly string[];
  defaultStatus: ModuleStatus;
  /** Can a tenant buy this module on top of a plan that does not include it? */
  defaultAddon: boolean;
  /** Placeholder add-on price, ₹ per location per month (set by App Admin). */
  defaultAddonMonthlyRupees: number | null;
}

const APPOINTMENT_ITEMS = [
  'Take Appointment',
  'Phone Appointment (Without Registration',
  'Cancel / Reschedule Appointment',
  'Counter (New / Repeate Patients)',
  'Appointment Diary for Single Doctor / All Doctors',
] as const;

const VISIT_ITEMS = [
  'Visit Registration',
  'Visit Satatisitcs Summary by Clinic',
  'Visit Detail by Doctor',
  'Visit Register',
] as const;

type Row = [
  key: string,
  docNo: number | null,
  name: string,
  docName: string,
  category: ModuleCategory,
  icon: string,
  phase: string,
  sheetModule: string | null,
  description: string,
  addonRupees?: number,
];

const HMIS: Row[] = [
  ['patient-registration', 1, 'Patient Registration', 'PATIENT REGISTRATION', 'front_office', 'UserPlus', '1 (MVP)', 'Patient Registration', 'Register and edit patients, print case papers, ID cards and stickers, MLC cases.'],
  ['appointments', 2, 'Appointment Scheduling', 'APPOINTMENT SCHEDULING', 'front_office', 'CalendarDays', '1 (MVP)', 'Doctor Appointment / Visit', 'Book, reschedule and cancel appointments at the counter or by phone; appointment diary.'],
  ['opd-visit', 3, 'Consultation Visit Registration', 'CONSULTATION VISIT REGISTRATION', 'front_office', 'Stethoscope', '1 (MVP)', 'Doctor Appointment / Visit', 'Register OPD visits and run visit registers, doctor-wise detail and clinic statistics.'],
  ['op-billing', 4, 'Outpatient Billing & Cash Handling', 'OUTPATIENT BILLING AND CASH HANDLING', 'finance', 'ReceiptIndianRupee', '1 (MVP)', 'OP Billing & Cash handling', 'OP vouchers, deposits, refunds, settlements and concessions with cash and revenue reports.'],
  ['adt', 5, 'Reservations, Admission, Discharge, Transfer', 'RESERVATIONS, ADMISSION, DISCHARGE, TRANSFER', 'inpatient', 'BedDouble', '2', 'Admission / Discharges / Transfers', 'Admit, transfer and discharge in-patients; registers, discharge summaries and stickers.'],
  ['nurse-station', 6, 'Nurse Station', 'NURSE STATION', 'clinical', 'HeartPulse', '4', 'Nurse Station', 'Lab and medicine orders from the ward, test results, prescriptions, notes and vitals.', 1499],
  ['ip-billing', 7, 'In-Patient Billing & Cash Handling', 'IN PATIENT BILLING AND CASH HANDLING', 'finance', 'FileSpreadsheet', '2', 'IP Billing & Cash Handling', 'Post service charges, deposits and reversals; prepare and settle in-patient bills.'],
  ['ot-scheduling', 8, 'OT Scheduling', 'OT SCHEDULING', 'clinical', 'Scissors', '4', null, 'Operation theatre slots, surgical teams and theatre utilisation.'],
  ['lab', 9, 'Laboratory Information System', 'LABORATORY INFORMATION SYSTEM', 'clinical', 'FlaskConical', '4', 'LAB', 'Sample collection, result entry, report templates, lab MIS and analyser interfaces.', 1499],
  ['radiology', 10, 'Radiology Reporting', 'RADIOLOGY REPORTING', 'clinical', 'ScanLine', '4', null, 'Radiology worklists, reporting templates and report delivery.'],
  ['doctor-accounting', 11, 'Doctors Accounting', 'DOCTORS ACCOUNTING', 'finance', 'Calculator', '3', 'Doctor Accounting', 'Doctor revenue sharing rules, payables, invoices and payment statements.', 999],
  ['insurance', 12, 'Insurance', 'INSURANCE', 'finance', 'ShieldCheck', '3', null, 'TPA and insurer master, pre-authorisations, claims and receivables.'],
  ['pharmacy', 13, 'Pharmacy & Stores Inventory', 'PHARMACY AND STORES INVENTORY', 'inventory', 'Pill', '3', 'Pharmacy', 'Purchases, receipts, issues to OP/IP patients, outside sales, stock and expiry reports.'],
  ['indents-purchase', 14, 'Indents & Purchase Management', 'INDENTS & PURCHASE MANAGEMENT', 'inventory', 'ClipboardList', '3', null, 'Department indents, approvals, purchase orders and vendor follow-up.'],
  ['bill-passing', 15, 'Scrolling, Certification & Bill Passing', 'SCROLLING, CERTIFICATION BILL PASSING', 'finance', 'Stamp', '5', null, 'Supplier bill scrolling, certification and passing for payment.'],
  ['blood-bank', 16, 'Blood Bank', 'BLOOD BANK', 'clinical', 'Droplets', '4', null, 'Donor registry, component stock, cross-matching and issue.'],
  ['linen-laundry', 17, 'Linen & Laundry', 'LINEN & LAUNDRY', 'back_office', 'Shirt', '5', null, 'Linen stock, ward issue, laundry cycles and condemnation.'],
  ['equipment-maintenance', 18, 'Equipment Maintenance', 'EQUIPMENT MAINTENANCE', 'back_office', 'Wrench', '5', null, 'Equipment master, breakdowns, AMC/CMC and preventive maintenance.'],
  ['maintenance-tracker', 19, 'Maintenance Tracker', 'MAINTENANCE TRACKER', 'back_office', 'Hammer', '5', null, 'Facility maintenance requests, assignment and closure tracking.'],
  ['payroll-attendance', 20, 'Payroll & Attendance', 'PAYROLL & ATTENDANCE', 'back_office', 'Wallet', '5', null, 'Staff attendance, leave, salary processing and statutory reports.'],
  ['users', 21, 'Users Management', 'USERS MANAGEMENT', 'platform', 'Users', '0–1 (MVP)', null, 'Staff accounts, roles by location, two-factor sign-in and the audit trail.'],
  ['data-migration', 22, 'Access Data Migration', 'ACCESS DATA MIGRATION', 'platform', 'DatabaseZap', '2 (onboarding tool)', null, 'Import masters and history from an existing MS Access based system.'],
  ['night-audit', 23, 'Night Audit', 'NIGHT AUDIT', 'finance', 'Moon', '3', null, 'Day-end checks on charges, occupancy and cash before the date rolls over.'],
  ['marketing', 24, 'Marketing', 'MARKETING', 'back_office', 'Megaphone', '5', null, 'Referral tracking, camps and patient outreach campaigns.'],
  ['mis-dashboards', 25, 'Hospital MIS & Dashboards', 'HOSPITAL MIS & DASHBOARDS', 'platform', 'ChartColumn', '2 onward', null, 'Revenue, occupancy and performance dashboards across locations.'],
  ['complaint-tracker', 26, 'Employee Complaint Tracker', 'EMPLOYEE COMPLAINT TRACKER', 'back_office', 'MessageSquareWarning', '5', null, 'Log, assign and resolve employee complaints.'],
  ['medicard', 27, 'Medicard Management', 'MEDICARD MANAGEMENT', 'finance', 'IdCard', '3', null, 'Membership cards, validity and card-holder concessions.'],
  ['cpoe', null, 'CPOE (Computerised Physician Order Entry)', 'CPOE (tier sheet only)', 'clinical', 'ClipboardPen', '4', 'CPOE', 'Chief complaints, diagnostic, medicine and procedure orders, vitals and doctor notes.', 1999],
];

const ANDROID: Row[] = [
  ['android-mis', 1, 'Android: MIS / Dashboard', 'ANDROID MOBILE: MIS / DASHBOARD', 'mobile', 'Smartphone', '6', null, 'Owner’s pocket view of revenue, material, occupancy, doctor performance and outstanding.'],
  ['android-equipment', 2, 'Android: Equipment Maintenance', 'ANDROID MOBILE: EQUIPMEMT MAINTENANCE', 'mobile', 'Smartphone', '6', null, 'Track non-operational equipment and record problems and fixes on the floor.'],
  ['android-patient-portal', 3, 'Android: Patient Portal', 'ANDROID MOBILE: PATIENT PORTAL', 'mobile', 'Smartphone', '6', null, 'Patients register, book doctors, see visit records and accounts, and leave feedback.'],
  ['android-doctor-portal', 4, 'Android: Doctor’s Medical Portal', 'ANDROID MOBILE: DOCTOR’S MEDICAL PORTAL', 'mobile', 'Smartphone', '6', null, 'Doctor’s appointment diary and medical diary with test and medicine ordering.'],
  ['android-nurses-workbench', 5, 'Android: Nurses Workbench', 'ANDROID MOBILE: NURSES WORKBANCH', 'mobile', 'Smartphone', '6', null, 'Doctor’s orders, vitals, medicine administration and diet orders at the bedside.'],
  ['android-hr-payroll', 6, 'Android: HR & Payroll', 'ANDROID MOBILE: HR & PAYROLL', 'mobile', 'Smartphone', '6', null, 'Attendance, leave and payslips for staff on their phones.'],
  ['android-maintenance-tracker', 7, 'Android: Maintenance Tracker', 'MAINTENANCE TRACKER', 'mobile', 'Smartphone', '6', null, 'Raise and close maintenance requests from the ward.'],
];

function toDef(kind: ModuleKind, r: Row): ModuleDef {
  const [key, docNo, name, docName, category, icon, phase, sheetModule, description, addonRupees] = r;
  const code = kind === 'android' ? `A${docNo}` : docNo === null ? 'CPOE' : `M${String(docNo).padStart(2, '0')}`;
  const hasDetail = sheetModule !== null || key === 'users';
  return {
    key,
    code,
    docNo,
    name,
    docName,
    kind,
    category,
    description,
    icon,
    phase,
    sheetModule,
    sheetNames: key === 'appointments' ? APPOINTMENT_ITEMS : key === 'opd-visit' ? VISIT_ITEMS : undefined,
    // Modules with a feature breakdown are sellable now; the rest are "coming soon" until scoped (App Admin can change).
    defaultStatus: kind === 'hmis' && hasDetail ? 'available' : 'coming_soon',
    defaultAddon: addonRupees !== undefined,
    defaultAddonMonthlyRupees: addonRupees ?? null,
  };
}

export const MODULE_DEFS: readonly ModuleDef[] = [
  ...HMIS.map((r) => toDef('hmis', r)),
  ...ANDROID.map((r) => toDef('android', r)),
];

export const MODULE_CATEGORY_LABELS: Record<ModuleCategory, string> = {
  front_office: 'Front office',
  inpatient: 'In-patient',
  clinical: 'Clinical',
  finance: 'Billing & finance',
  inventory: 'Pharmacy & stores',
  back_office: 'Back office',
  platform: 'Administration',
  mobile: 'Android apps',
};

/** Features the client document lists for each Android app (every app must eventually ship all of these). */
export const ANDROID_FEATURES: Record<string, readonly { name: string; sourceName: string }[]> = {
  'android-mis': [
    { name: 'Revenue MIS', sourceName: 'REVENUE MIS' },
    { name: 'Material MIS', sourceName: 'MATERIAL MIS' },
    { name: 'Occupancy / Admissions MIS & Snapshots', sourceName: 'OCCUPANCY / ADMISSIONS MIS & SNAPSHOTS' },
    { name: 'Doctors Performance (Surgery / OP Consultations)', sourceName: 'DOCTORS PERFORMANCE (SURGERY / OP CONSULTATIONS)' },
    { name: 'Patient Outstanding', sourceName: 'PATIENT OUTSTANDING' },
    { name: 'Cost Center Profitability', sourceName: 'COST CENTER PROFITABILITY' },
  ],
  'android-equipment': [
    { name: 'Tracking Non-Operational Equipments', sourceName: 'TRACKING NON-OPERATIONAL EQUIPMENTS' },
    { name: 'Recording Problems / Solution Details', sourceName: 'RECORDING PROBLEMS / SOLUTION DETAILS' },
    { name: 'Equipment Master Details (Down-time / Financial Cost)', sourceName: 'EQUIPMENT MASTER DETAILS (DOWN-TIME / FINANCIAL COST)' },
  ],
  'android-patient-portal': [
    { name: 'Patient Registration', sourceName: 'PATENT REGISTRATION' },
    { name: 'Doctor’s Appointments', sourceName: 'DOCTR’S APPOINTMENTS' },
    { name: 'Medical Data for Visits to Hospital', sourceName: 'MEDICAL DATA FOR VISITS TO HOSPITAL' },
    { name: 'Accounts Details', sourceName: 'ACCOUNTS DETAILS' },
    { name: 'Feedback', sourceName: 'FEEDBACK' },
  ],
  'android-doctor-portal': [
    { name: 'Appointment Diary', sourceName: 'APPOINTMENT DIARY' },
    { name: 'Medical Diary (Facility to Order Tests / Medicines)', sourceName: 'MEDICAL DIARY (FACILITY TO ORDER TESTS / MEDICINES)' },
  ],
  'android-nurses-workbench': [
    { name: 'Doctor’s Order Entry / View for Investigation / Medicine', sourceName: "DOCTOR'S ORDER ENRY / VIEW FOR INVESTIGATION / MEDICINE" },
    { name: 'Vital Sign Entry / View', sourceName: 'VITL SIGN ENTRY / VIEW' },
    { name: 'Medicine Administration', sourceName: 'MEDICINE ADMINISTRATION' },
    { name: 'Diet Order Entry / View', sourceName: 'DIET ORDER ENTRY / VIEW' },
  ],
  'android-hr-payroll': [],
  'android-maintenance-tracker': [],
};

/** Users Management has no sheet detail; these are designed by us and included in every plan. */
export const PLATFORM_FEATURES: Record<string, readonly { name: string; type: 'function' | 'report' }[]> = {
  users: [
    { name: 'Invite Staff', type: 'function' },
    { name: 'Roles by Location', type: 'function' },
    { name: 'Two-Factor Sign-in', type: 'function' },
    { name: 'Audit Trail', type: 'report' },
  ],
};
