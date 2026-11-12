// Sunrise demo rows for the MVP slices: equipment maintenance and payroll & attendance.
// Fictional assets and fictional staff names. Every row is flagged is_sample. No real people or devices.
import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Day `day` of the current month (UTC date key). Attendance samples stay in one month so the payslip preview shows them. */
function dayOfThisMonth(day: number): string {
  return `${dayOffset(0).slice(0, 8)}${String(day).padStart(2, '0')}`;
}

export async function seedSunriseMvp(db: Db, tenantId: string, log: (m: string) => void): Promise<void> {
  const [existing] = await db
    .select({ id: schema.equipmentAssets.id })
    .from(schema.equipmentAssets)
    .where(eq(schema.equipmentAssets.tenantId, tenantId))
    .limit(1);
  if (existing) {
    log('sunrise MVP equipment and payroll sample already present');
    return;
  }

  const assets = await db
    .insert(schema.equipmentAssets)
    .values([
      { tenantId, assetTag: 'EQ-SR-0001', name: 'Multipara patient monitor', category: 'Monitoring', department: 'ICU', criticality: 'high', purchaseCostPaise: 40_000_000, installedOn: dayOffset(-400), warrantyUntil: dayOffset(330), isSample: true },
      { tenantId, assetTag: 'EQ-SR-0002', name: 'Infusion pump', category: 'Infusion', department: 'General ward', criticality: 'medium', purchaseCostPaise: 12_000_000, installedOn: dayOffset(-200), isSample: true },
      { tenantId, assetTag: 'EQ-SR-0003', name: 'Horizontal autoclave', category: 'Sterilisation', department: 'CSSD', criticality: 'high', status: 'non_operational', purchaseCostPaise: 90_000_000, installedOn: dayOffset(-900), isSample: true },
      { tenantId, assetTag: 'EQ-SR-0004', name: 'Vaccine refrigerator (2 to 8 C)', category: 'Cold chain', department: 'Pharmacy', criticality: 'high', purchaseCostPaise: 6_500_000, installedOn: dayOffset(-120), isSample: true },
    ])
    .returning();

  const byTag = new Map(assets.map((a) => [a.assetTag, a.id]));
  const monitorId = byTag.get('EQ-SR-0001')!;
  const autoclaveId = byTag.get('EQ-SR-0003')!;
  const fridgeId = byTag.get('EQ-SR-0004')!;

  await db.insert(schema.equipmentPmSchedules).values([
    { tenantId, equipmentId: monitorId, title: 'Quarterly preventive service', frequencyDays: 90, nextDue: dayOffset(12) },
    { tenantId, equipmentId: autoclaveId, title: 'Annual validation and calibration', frequencyDays: 365, nextDue: dayOffset(-3) },
    { tenantId, equipmentId: fridgeId, title: 'Monthly temperature and door-seal check', frequencyDays: 30, nextDue: dayOffset(5) },
  ]);

  await db.insert(schema.equipmentServiceLogs).values([
    { tenantId, equipmentId: autoclaveId, kind: 'breakdown', description: 'Chamber pressure fault. Engineer called.' },
  ]);

  const employees = await db
    .insert(schema.payrollEmployees)
    .values([
      { tenantId, employeeCode: 'EMP-SR-001', fullName: 'Sunita Verma', department: 'ICU', designation: 'Staff nurse', monthlyBasicPaise: 1_800_000, joinedOn: '2022-04-01', isSample: true },
      { tenantId, employeeCode: 'EMP-SR-002', fullName: 'Ravi Kulkarni', department: 'Housekeeping', designation: 'Attendant', monthlyBasicPaise: 1_200_000, joinedOn: '2023-09-15', isSample: true },
      { tenantId, employeeCode: 'EMP-SR-003', fullName: 'Meenakshi Iyer', department: 'Laboratory', designation: 'Lab technician', monthlyBasicPaise: 2_200_000, joinedOn: '2021-06-01', isSample: true },
      { tenantId, employeeCode: 'EMP-SR-004', fullName: 'Farhan Qureshi', department: 'Pharmacy', designation: 'Pharmacist', monthlyBasicPaise: 2_000_000, joinedOn: '2024-01-10', isSample: true },
    ])
    .returning();

  const sunita = employees.find((e) => e.employeeCode === 'EMP-SR-001');
  const ravi = employees.find((e) => e.employeeCode === 'EMP-SR-002');
  if (sunita && ravi) {
    await db.insert(schema.payrollAttendance).values([
      { tenantId, employeeId: sunita.id, workDate: dayOfThisMonth(1), status: 'present' },
      { tenantId, employeeId: sunita.id, workDate: dayOfThisMonth(2), status: 'half_day', note: 'Left after the morning round' },
      { tenantId, employeeId: sunita.id, workDate: dayOfThisMonth(3), status: 'absent', note: 'Sample absence' },
      { tenantId, employeeId: ravi.id, workDate: dayOfThisMonth(1), status: 'week_off' },
    ]);
  }

  log(`sunrise MVP sample: ${assets.length} equipment assets, ${employees.length} staff (is_sample)`);
}
