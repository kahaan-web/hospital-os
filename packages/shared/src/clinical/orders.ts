import { z } from 'zod';
import { DIET_CODES, DOSE_FORMS, FREQUENCIES, ROUTES } from './codes';

export const ORDER_KINDS = ['lab', 'medicine', 'procedure', 'diet', 'radiology'] as const;
export type ClinicalOrderKind = (typeof ORDER_KINDS)[number];

export const ORDER_SOURCES = ['opd', 'ipd', 'cpoe', 'nurse', 'mobile'] as const;
export type ClinicalOrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_PRIORITIES = ['routine', 'urgent', 'stat'] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export const ORDER_STATUSES = ['placed', 'in_progress', 'completed', 'cancelled'] as const;
export type ClinicalOrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_ITEM_STATUSES = ['pending', 'in_progress', 'done', 'cancelled'] as const;
export type ClinicalOrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

const frequencyCodes = FREQUENCIES.map((f) => f.code) as [string, ...string[]];

export interface ClinicalOrderItemDto {
  id: string;
  orderId: string;
  lineNo: number;
  serviceId: string | null;
  drugName: string | null;
  genericCode: string | null;
  strength: string | null;
  doseForm: string | null;
  dose: string | null;
  frequencyCode: string | null;
  routeCode: string | null;
  durationDays: number | null;
  quantity: number | null;
  dietCode: string | null;
  instructions: string | null;
  status: ClinicalOrderItemStatus;
  fulfilledQty: number;
  fulfilledRefType: string | null;
  fulfilledRefId: string | null;
}

export interface ClinicalOrderDto {
  id: string;
  locationId: string;
  encounterId: string;
  patientId: string;
  kind: ClinicalOrderKind;
  number: string;
  source: ClinicalOrderSource;
  priority: OrderPriority;
  status: ClinicalOrderStatus;
  orderingDoctorId: string | null;
  orderedByUserId: string | null;
  notes: string | null;
  placedAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  items: ClinicalOrderItemDto[];
}

const common = {
  priority: z.enum(ORDER_PRIORITIES).optional(),
  notes: z.string().trim().max(2000).optional(),
  source: z.enum(ORDER_SOURCES).optional(),
  orderingDoctorId: z.uuid().nullable().optional(),
};

const serviceItem = z.object({
  serviceId: z.uuid(),
  instructions: z.string().trim().max(500).optional(),
});

export const placeClinicalOrderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lab'), ...common, items: z.array(serviceItem).min(1, 'Add a test') }),
  z.object({
    kind: z.literal('medicine'),
    ...common,
    items: z
      .array(
        z.object({
          drugName: z.string().trim().min(1).max(160),
          genericCode: z.string().trim().min(1).max(40),
          strength: z.string().trim().max(40).optional(),
          doseForm: z.enum(DOSE_FORMS).optional(),
          dose: z.string().trim().max(40).optional(),
          frequencyCode: z.enum(frequencyCodes),
          routeCode: z.enum(ROUTES).optional(),
          durationDays: z.number().int().min(1).max(365).optional(),
          quantity: z.number().positive().max(10000).optional(),
          instructions: z.string().trim().max(500).optional(),
        }),
      )
      .min(1, 'Add a medicine'),
  }),
  z.object({ kind: z.literal('procedure'), ...common, items: z.array(serviceItem).min(1, 'Add a procedure') }),
  z.object({
    kind: z.literal('diet'),
    ...common,
    items: z
      .array(
        z.object({
          dietCode: z.enum(DIET_CODES),
          instructions: z.string().trim().max(500).optional(),
        }),
      )
      .min(1, 'Choose a diet'),
  }),
  z.object({ kind: z.literal('radiology'), ...common, items: z.array(serviceItem).min(1) }),
]);
export type PlaceClinicalOrderInput = z.infer<typeof placeClinicalOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(2, 'Say why this order is cancelled').max(300),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const orderWorklistQuery = z.object({
  kind: z.enum(ORDER_KINDS).optional(),
  status: z.enum(ORDER_ITEM_STATUSES).optional(),
  locationId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type OrderWorklistQuery = z.infer<typeof orderWorklistQuery>;
