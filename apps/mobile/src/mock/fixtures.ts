import type { Me, TenantMe } from '@hos/shared';
import type {
  Appointment,
  Bill,
  DoctorDirectoryItem,
  DoctorSlot,
  Feedback,
  Order,
  PatientProfile,
  Visit,
} from '@hos/shared';

export const TENANT_ID = 'ten_sunrise_demo';
export const LOC_MUMBAI = 'loc_mumbai';
export const LOC_NAME = 'Mumbai — Andheri';

export const DOC_ARJUN = 'doc_arjun';
export const DOC_MEERA = 'doc_meera';
export const DOC_VIKRAM = 'doc_vikram';
export const PAT_PRIYA = 'pat_priya';
export const PAT_ANITA = 'pat_anita';
export const PAT_ROHAN = 'pat_rohan';
export const PAT_SUNITA = 'pat_sunita';

const createdAt = '2026-10-01T04:30:00.000Z';

export const doctors: DoctorDirectoryItem[] = [
  {
    id: DOC_ARJUN,
    name: 'Dr. Arjun Fictional',
    speciality: 'General Medicine',
    locationId: LOC_MUMBAI,
    locationName: LOC_NAME,
    consultingDays: 'Mon–Sat',
  },
  {
    id: DOC_MEERA,
    name: 'Dr. Meera Placeholder',
    speciality: 'Paediatrics',
    locationId: LOC_MUMBAI,
    locationName: LOC_NAME,
    consultingDays: 'Mon, Wed, Fri',
  },
  {
    id: DOC_VIKRAM,
    name: 'Dr. Vikram Sample',
    speciality: 'Orthopaedics',
    locationId: LOC_MUMBAI,
    locationName: LOC_NAME,
    consultingDays: 'Tue, Thu, Sat',
  },
];

export const patientPriya: PatientProfile = {
  id: PAT_PRIYA,
  name: 'Priya Sample',
  uhid: 'SUN-P-2044',
  email: 'patient@sunrise.demo',
  mobile: '9876500101',
  dob: '1992-03-14',
  gender: 'female',
  bloodGroup: 'B+',
  addressLine1: '12 Fictional Lane, Andheri West',
  city: 'Mumbai',
  stateCode: '27',
  pincode: '400053',
  locationId: LOC_MUMBAI,
  locationName: LOC_NAME,
  emergencyName: 'Amit Sample',
  emergencyMobile: '9876500102',
};

const names: Record<string, { name: string; uhid: string }> = {
  [PAT_PRIYA]: { name: 'Priya Sample', uhid: 'SUN-P-2044' },
  [PAT_ANITA]: { name: 'Anita Demo', uhid: 'SUN-P-1882' },
  [PAT_ROHAN]: { name: 'Rohan Testcase', uhid: 'SUN-P-2110' },
  [PAT_SUNITA]: { name: 'Sunita Fictional', uhid: 'SUN-P-1760' },
};

function apt(
  id: string,
  patientId: string,
  doctorId: string,
  date: string,
  start: string,
  end: string,
  status: Appointment['status'],
  reason: string,
  visitId: string | null = null,
): Appointment {
  const doc = doctors.find((d) => d.id === doctorId)!;
  const p = names[patientId]!;
  return {
    id,
    tenantId: TENANT_ID,
    locationId: LOC_MUMBAI,
    locationName: LOC_NAME,
    patientId,
    patientName: p.name,
    uhid: p.uhid,
    doctorId,
    doctorName: doc.name,
    speciality: doc.speciality,
    date,
    slotStart: start,
    slotEnd: end,
    status,
    reason,
    visitId,
    createdAt,
  };
}

export const seedAppointments: Appointment[] = [
  apt('apt_today_priya', PAT_PRIYA, DOC_ARJUN, '2026-11-10', '09:00', '09:20', 'confirmed', 'Follow-up after viral fever'),
  apt('apt_today_anita', PAT_ANITA, DOC_ARJUN, '2026-11-10', '09:30', '09:50', 'booked', 'Headache for three days'),
  apt('apt_today_rohan', PAT_ROHAN, DOC_ARJUN, '2026-11-10', '11:00', '11:20', 'checked_in', 'Knee pain after a fall'),
  apt('apt_today_sunita', PAT_SUNITA, DOC_ARJUN, '2026-11-10', '14:00', '14:20', 'booked', 'Review of blood sugar'),
  apt('apt_soon_priya', PAT_PRIYA, DOC_MEERA, '2026-11-14', '10:00', '10:20', 'booked', 'Vaccination query for nephew — own consult'),
  apt(
    'apt_past_priya',
    PAT_PRIYA,
    DOC_ARJUN,
    '2026-10-28',
    '10:30',
    '10:50',
    'completed',
    'Fever and body ache',
    'vis_priya_oct',
  ),
];

export const seedVisits: Visit[] = [
  {
    id: 'vis_priya_oct',
    appointmentId: 'apt_past_priya',
    patientId: PAT_PRIYA,
    patientName: 'Priya Sample',
    uhid: 'SUN-P-2044',
    doctorId: DOC_ARJUN,
    doctorName: 'Dr. Arjun Fictional',
    locationId: LOC_MUMBAI,
    locationName: LOC_NAME,
    visitedOn: '2026-10-28',
    chiefComplaint: 'Fever and body ache for two days',
    diagnosis: 'Viral fever (sample)',
    notes: 'Advised rest and fluids. Return if fever lasts beyond four days.',
    vitals: {
      bpSystolic: 118,
      bpDiastolic: 76,
      pulse: 88,
      tempC: 38.4,
      spo2: 98,
      weightKg: 58,
    },
    tests: [{ name: 'CBC', status: 'reported', resultSummary: 'Mild leucocytosis. Sample report.' }],
    medicines: [{ name: 'Paracetamol 650 mg', dose: '650 mg', frequency: '1-0-1', days: 3 }],
  },
  {
    id: 'vis_today_rohan',
    appointmentId: 'apt_today_rohan',
    patientId: PAT_ROHAN,
    patientName: 'Rohan Testcase',
    uhid: 'SUN-P-2110',
    doctorId: DOC_ARJUN,
    doctorName: 'Dr. Arjun Fictional',
    locationId: LOC_MUMBAI,
    locationName: LOC_NAME,
    visitedOn: '2026-11-10',
    chiefComplaint: 'Right knee pain after a fall yesterday',
    diagnosis: 'Soft-tissue injury (provisional, sample)',
    notes: 'No fracture suspected. Ice, rest, review if swelling increases.',
    vitals: {
      bpSystolic: 124,
      bpDiastolic: 80,
      pulse: 72,
      tempC: 36.8,
      spo2: 99,
      weightKg: 74,
    },
    tests: [{ name: 'Knee X-ray AP/Lat', status: 'ordered', resultSummary: null }],
    medicines: [{ name: 'Aceclofenac 100 mg', dose: '100 mg', frequency: '1-0-1 after food', days: 5 }],
  },
];

export const seedBills: Bill[] = [
  {
    id: 'bill_priya_oct',
    number: 'HOS/2627/000042',
    patientId: PAT_PRIYA,
    patientName: 'Priya Sample',
    uhid: 'SUN-P-2044',
    locationName: LOC_NAME,
    issuedOn: '2026-10-28',
    status: 'paid',
    subtotalPaise: 110000,
    gstPaise: 19800,
    totalPaise: 129800,
    paidPaise: 129800,
    lines: [
      { description: 'OP consultation — General Medicine', qty: 1, unitPaise: 80000, amountPaise: 80000 },
      { description: 'CBC', qty: 1, unitPaise: 30000, amountPaise: 30000 },
    ],
  },
  {
    id: 'bill_priya_open',
    number: 'HOS/2627/000108',
    patientId: PAT_PRIYA,
    patientName: 'Priya Sample',
    uhid: 'SUN-P-2044',
    locationName: LOC_NAME,
    issuedOn: '2026-11-08',
    status: 'issued',
    subtotalPaise: 50000,
    gstPaise: 9000,
    totalPaise: 59000,
    paidPaise: 0,
    lines: [{ description: 'OP consultation — follow-up deposit', qty: 1, unitPaise: 50000, amountPaise: 50000 }],
  },
];

export const seedOrders: Order[] = [
  {
    id: 'ord_rohan_xray',
    visitId: 'vis_today_rohan',
    patientId: PAT_ROHAN,
    patientName: 'Rohan Testcase',
    uhid: 'SUN-P-2110',
    doctorId: DOC_ARJUN,
    kind: 'test',
    items: [{ name: 'Knee X-ray AP/Lat', notes: 'Right knee' }],
    status: 'placed',
    createdAt: '2026-11-10T05:40:00.000Z',
  },
];

export const seedFeedback: Feedback[] = [];

const SLOT_HOURS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '16:00'];

export function buildSlots(doctorId: string, date: string, appointments: Appointment[]): DoctorSlot[] {
  const doc = doctors.find((d) => d.id === doctorId);
  if (!doc) return [];
  const taken = new Set(
    appointments
      .filter((a) => a.doctorId === doctorId && a.date === date && a.status !== 'cancelled')
      .map((a) => a.slotStart),
  );
  return SLOT_HOURS.map((start) => {
    const [h, m] = start.split(':').map(Number);
    const endMin = (h ?? 0) * 60 + (m ?? 0) + 20;
    const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    return {
      doctorId,
      doctorName: doc.name,
      speciality: doc.speciality,
      locationId: LOC_MUMBAI,
      locationName: LOC_NAME,
      date,
      start,
      end,
      available: !taken.has(start),
    };
  });
}

function tenantMe(partial: {
  id: string;
  name: string;
  email: string;
  mobile: string;
  designation: string | null;
  roleKey: string;
  roleName: string;
}): TenantMe {
  return {
    kind: 'tenant',
    user: {
      id: partial.id,
      name: partial.name,
      email: partial.email,
      mobile: partial.mobile,
      designation: partial.designation,
      totpEnabled: false,
    },
    tenant: {
      id: TENANT_ID,
      slug: 'sunrise-demo',
      status: 'active',
      onboardingStep: 'done',
      facilityType: 'nursing_home',
      legalName: 'Sunrise Demo Nursing Home Pvt Ltd',
      displayName: 'Sunrise Demo Nursing Home',
      gstin: '27AAAAA0000A1Z5',
      registrationNo: 'MH-NH-DEMO-0001',
      bedCount: 24,
      specialities: ['General Medicine', 'Paediatrics', 'Orthopaedics'],
      logoUrl: null,
      sandbox: true,
    },
    locations: [
      {
        id: LOC_MUMBAI,
        name: LOC_NAME,
        code: 'MUM',
        addressLine1: 'Andheri West',
        addressLine2: '',
        city: 'Mumbai',
        stateCode: '27',
        pincode: '400053',
        phone: '02200000000',
        isPrimary: true,
        departments: ['OPD', 'Billing', 'Laboratory'],
      },
    ],
    currentLocationId: LOC_MUMBAI,
    roles: [{ roleKey: partial.roleKey, roleName: partial.roleName, locationId: LOC_MUMBAI }],
    permissions: [],
    subscription: null,
    modules: [],
    features: [],
  };
}

export const DEMO_PASSWORD = 'Demo@12345';

export const mockUsers: { email: string; password: string; token: string; me: Me }[] = [
  {
    email: 'patient@sunrise.demo',
    password: DEMO_PASSWORD,
    token: 'sess_patient_demo',
    me: tenantMe({
      id: PAT_PRIYA,
      name: 'Priya Sample',
      email: 'patient@sunrise.demo',
      mobile: '9876500101',
      designation: null,
      roleKey: 'patient',
      roleName: 'Patient',
    }),
  },
  {
    email: 'doctor@sunrise.demo',
    password: DEMO_PASSWORD,
    token: 'sess_doctor_demo',
    me: tenantMe({
      id: DOC_ARJUN,
      name: 'Dr. Arjun Fictional',
      email: 'doctor@sunrise.demo',
      mobile: '9876500201',
      designation: 'Consultant',
      roleKey: 'doctor',
      roleName: 'Doctor',
    }),
  },
  {
    email: 'nurse@sunrise.demo',
    password: DEMO_PASSWORD,
    token: 'sess_nurse_demo',
    me: tenantMe({
      id: 'usr_kavita',
      name: 'Kavita Demo',
      email: 'nurse@sunrise.demo',
      mobile: '9876500301',
      designation: 'Staff Nurse',
      roleKey: 'nurse',
      roleName: 'Nurse',
    }),
  },
  {
    email: 'admin@sunrise.demo',
    password: DEMO_PASSWORD,
    token: 'sess_admin_demo',
    me: tenantMe({
      id: 'usr_ramesh',
      name: 'Ramesh Placeholder',
      email: 'admin@sunrise.demo',
      mobile: '9876500401',
      designation: 'owner',
      roleKey: 'tenant_admin',
      roleName: 'Tenant Admin',
    }),
  },
];

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
