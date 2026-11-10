import type { PayerType, WardType } from './codes';
import type { ChargeDto, ChargeInput, ChargeSource } from './charges';
import type { EncounterDto } from './encounter';
import type { PlaceClinicalOrderInput, ClinicalOrderDto, ClinicalOrderItemDto, OrderWorklistQuery } from './orders';
import type { SeriesKey } from './numbering';
import type { GstTreatment } from './gst-health';
import type { PageDto } from '../types';
import type { BookAppointmentInput, DietOrderView, GiveDoseInput, MarDose, WardPatient } from '../mobile';
import type {
  AdmissionRequestDto,
  AppointmentDto,
  BillDto,
  LabReportListItem,
  LabResultSummaryDto,
  SlotDto,
} from './contract-dtos';

export interface ClinicalCtx<TX = unknown> {
  tx: TX;
  tenantId: string;
  locationId: string;
  userId: string;
  audit(action: string, entityType: string, entityId: string | null, before: unknown, after: unknown): Promise<void>;
}

export interface ChargeCapture<TX = unknown> {
  post(ctx: ClinicalCtx<TX>, input: ChargeInput): Promise<ChargeDto>;
  reverse(ctx: ClinicalCtx<TX>, chargeId: string, reason: string): Promise<ChargeDto>;
  reverseBySource(ctx: ClinicalCtx<TX>, source: ChargeSource, reason: string): Promise<ChargeDto[]>;
  listUnbilled(ctx: ClinicalCtx<TX>, encounterId: string): Promise<ChargeDto[]>;
  /** Billing only. `billId` null returns the charges to unbilled. */
  markBilled(ctx: ClinicalCtx<TX>, chargeIds: string[], billId: string | null): Promise<void>;
}

export interface PriceLookup<TX = unknown> {
  priceFor(
    ctx: ClinicalCtx<TX>,
    q: { serviceId: string; wardClass?: string; payerClass?: string; on?: string },
  ): Promise<{ unitPricePaise: number; gstTreatment: GstTreatment; gstRateBp: number; hsnSac: string }>;
}

export interface NumberSeries<TX = unknown> {
  next(ctx: ClinicalCtx<TX>, key: SeriesKey, opts?: { at?: Date; scope?: string }): Promise<string>;
}

export interface EncounterService<TX = unknown> {
  openOpd(
    ctx: ClinicalCtx<TX>,
    i: {
      patientId: string;
      doctorId: string;
      departmentId?: string;
      appointmentId?: string;
      visitType: 'new' | 'follow_up';
      payerType?: PayerType;
    },
  ): Promise<EncounterDto>;
  openIpd(
    ctx: ClinicalCtx<TX>,
    i: { patientId: string; doctorId: string; departmentId?: string; number: string; payerType: PayerType; isMlc: boolean },
  ): Promise<EncounterDto>;
  setBedLabels(ctx: ClinicalCtx<TX>, encounterId: string, l: { wardCode: string | null; bedLabel: string | null }): Promise<void>;
  close(ctx: ClinicalCtx<TX>, encounterId: string, at?: Date): Promise<EncounterDto>;
}

export interface OrderService<TX = unknown> {
  place(ctx: ClinicalCtx<TX>, encounterId: string, input: PlaceClinicalOrderInput): Promise<ClinicalOrderDto>;
  cancel(ctx: ClinicalCtx<TX>, orderId: string, reason: string): Promise<ClinicalOrderDto>;
  worklist(ctx: ClinicalCtx<TX>, q: OrderWorklistQuery): Promise<PageDto<ClinicalOrderItemDto>>;
  recordFulfilment(
    ctx: ClinicalCtx<TX>,
    itemId: string,
    f: { status: 'in_progress' | 'done'; qty?: number; refType: string; refId: string },
  ): Promise<ClinicalOrderItemDto>;
}

export interface CashLedger<TX = unknown> {
  record(ctx: ClinicalCtx<TX>, e: import('./charges').CashEntryInput): Promise<import('./charges').CashEntryDto>;
  void(ctx: ClinicalCtx<TX>, entryId: string, reason: string): Promise<import('./charges').CashEntryDto>;
}

export interface BillingStatusReader<TX = unknown> {
  settledSources(ctx: ClinicalCtx<TX>, sources: ChargeSource[]): Promise<Set<string>>;
  billsForPatient(ctx: ClinicalCtx<TX>, patientId: string): Promise<BillDto[]>;
}

export interface DischargeClearance<TX = unknown> {
  check(ctx: ClinicalCtx<TX>, encounterId: string): Promise<{ ok: boolean; balancePaise: number; reasons: string[] }>;
}

export interface AdmissionRequestSink<TX = unknown> {
  request(
    ctx: ClinicalCtx<TX>,
    r: { patientId: string; fromEncounterId: string; doctorId: string; reason: string; plannedOn: string; wardType?: WardType },
  ): Promise<AdmissionRequestDto>;
}

export interface DiaryReader<TX = unknown> {
  diary(ctx: ClinicalCtx<TX>, q: { doctorId: string; date: string }): Promise<AppointmentDto[]>;
  slots(ctx: ClinicalCtx<TX>, q: { doctorId: string; date: string }): Promise<SlotDto[]>;
  book(ctx: ClinicalCtx<TX>, i: BookAppointmentInput & { patientId: string; channel: 'counter' | 'phone' | 'portal' }): Promise<AppointmentDto>;
  cancel(ctx: ClinicalCtx<TX>, appointmentId: string, reason: string): Promise<AppointmentDto>;
}

export interface LabResultsReader<TX = unknown> {
  summaries(ctx: ClinicalCtx<TX>, orderItemIds: string[]): Promise<Map<string, LabResultSummaryDto>>;
  reportsForPatient(ctx: ClinicalCtx<TX>, patientId: string): Promise<LabReportListItem[]>;
}

export interface NursingService<TX = unknown> {
  wardPatients(ctx: ClinicalCtx<TX>, q: { wardCode?: string }): Promise<WardPatient[]>;
  marFor(ctx: ClinicalCtx<TX>, encounterId: string, date: string): Promise<MarDose[]>;
  giveDose(ctx: ClinicalCtx<TX>, doseId: string, i: GiveDoseInput): Promise<MarDose>;
  dietOrders(ctx: ClinicalCtx<TX>, q: { wardCode?: string; encounterId?: string }): Promise<DietOrderView[]>;
}

export interface ClinicalServices<TX = unknown> {
  charges: ChargeCapture<TX>;
  prices: PriceLookup<TX>;
  numbering: NumberSeries<TX>;
  encounters: EncounterService<TX>;
  orders: OrderService<TX>;
  cash: CashLedger<TX>;
  billing: BillingStatusReader<TX>;
  discharge: DischargeClearance<TX>;
  admissions: AdmissionRequestSink<TX>;
  diary: DiaryReader<TX>;
  labResults: LabResultsReader<TX>;
  nursing: NursingService<TX>;
}
