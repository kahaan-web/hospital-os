import { z } from 'zod';

export interface VitalRange {
  unit: string;
  /** Inclusive normal band, shown beside the value. */
  normal: readonly [number, number];
  /** Outside this band the value is critical. */
  critical: readonly [number, number];
}

/** Temperature is stored as °C × 10. Weight is grams. Height is millimetres. */
export const VITAL_RANGES = {
  bpSystolic: { unit: 'mmHg', normal: [90, 140], critical: [80, 180] },
  bpDiastolic: { unit: 'mmHg', normal: [60, 90], critical: [50, 120] },
  pulse: { unit: '/min', normal: [60, 100], critical: [40, 140] },
  respRate: { unit: '/min', normal: [12, 20], critical: [8, 30] },
  tempC: { unit: '°C', normal: [36.1, 37.2], critical: [35, 39.5] },
  spo2: { unit: '%', normal: [95, 100], critical: [90, 100] },
  painScore: { unit: '/10', normal: [0, 3], critical: [0, 7] },
  grbsMgDl: { unit: 'mg/dL', normal: [70, 140], critical: [50, 300] },
} as const satisfies Record<string, VitalRange>;

export interface VitalSignsDto {
  id: string;
  locationId: string;
  encounterId: string;
  patientId: string;
  recordedAt: string;
  recordedBy: string | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  pulse: number | null;
  respRate: number | null;
  tempC: number | null;
  spo2: number | null;
  weightKg: number | null;
  heightCm: number | null;
  painScore: number | null;
  grbsMgDl: number | null;
  notes: string | null;
  enteredInErrorAt: string | null;
  errorReason: string | null;
}

const optInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();

export const recordVitalsSchema = z.object({
  recordedAt: z.string().datetime().optional(),
  bpSystolic: optInt(40, 260),
  bpDiastolic: optInt(20, 180),
  pulse: optInt(20, 240),
  respRate: optInt(4, 80),
  /** Degrees Celsius. Stored as °C × 10. */
  tempC: z.number().min(30).max(45).nullable().optional(),
  spo2: optInt(40, 100),
  weightKg: z.number().min(0.2).max(400).nullable().optional(),
  heightCm: z.number().min(20).max(250).nullable().optional(),
  painScore: optInt(0, 10),
  grbsMgDl: optInt(10, 800),
  notes: z.string().trim().max(500).optional(),
});
export type RecordVitalsInput = z.infer<typeof recordVitalsSchema>;

export function vitalFlag(key: keyof typeof VITAL_RANGES, value: number | null | undefined): 'normal' | 'abnormal' | 'critical' | null {
  if (value == null || Number.isNaN(value)) return null;
  const range = VITAL_RANGES[key];
  if (value < range.critical[0] || value > range.critical[1]) return 'critical';
  if (value < range.normal[0] || value > range.normal[1]) return 'abnormal';
  return 'normal';
}
