import type { LoginInput, Me } from '@hos/shared';
import type {
  Appointment,
  Bill,
  BookAppointmentInput,
  DoctorDirectoryItem,
  DoctorSlot,
  Feedback,
  Order,
  PatientProfile,
  PlaceOrderInput,
  SubmitFeedbackInput,
  Visit,
} from '@hos/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface MobileApi {
  login(input: LoginInput): Promise<Me>;
  logout(): Promise<void>;
  me(): Promise<Me>;

  listAppointments(): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment>;
  listDoctors(): Promise<DoctorDirectoryItem[]>;
  listSlots(doctorId: string, date: string): Promise<DoctorSlot[]>;
  bookAppointment(input: BookAppointmentInput): Promise<Appointment>;
  cancelAppointment(id: string): Promise<Appointment>;

  listVisits(): Promise<Visit[]>;
  getVisit(id: string): Promise<Visit>;

  listDoctorVisits(): Promise<Visit[]>;
  getDoctorVisit(id: string): Promise<Visit>;

  listBills(): Promise<Bill[]>;
  getBill(id: string): Promise<Bill>;

  getProfile(): Promise<PatientProfile>;
  submitFeedback(input: SubmitFeedbackInput): Promise<Feedback>;

  listDiary(date: string): Promise<Appointment[]>;
  placeOrder(input: PlaceOrderInput): Promise<Order>;
  listOrders(visitId?: string): Promise<Order[]>;
}
