import type { AppointmentStatus, BillStatus, ClinicalOrderStatus } from '@hos/shared';
import type { BadgeTone } from './Badge';

export function appointmentTone(status: AppointmentStatus): BadgeTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'cancelled':
    case 'no_show':
      return 'danger';
    case 'checked_in':
      return 'info';
    case 'confirmed':
      return 'teal';
    default:
      return 'warning';
  }
}

export function billTone(status: BillStatus): BadgeTone {
  switch (status) {
    case 'paid':
      return 'success';
    case 'overdue':
      return 'danger';
    case 'partial':
    case 'issued':
      return 'warning';
    case 'cancelled':
      return 'neutral';
    default:
      return 'info';
  }
}

export function orderTone(status: ClinicalOrderStatus): BadgeTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
    case 'in_progress':
      return 'info';
    case 'placed':
      return 'teal';
    default:
      return 'warning';
  }
}
