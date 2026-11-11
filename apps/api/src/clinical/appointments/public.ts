import type { Tx } from '@hos/db';
import type { DiaryReader } from '@hos/shared';
import { bookAppointment, cancelAppointment, listSlots, loadDiary } from './service';

/** DiaryReader for other clinical tasks. Routes in this folder call the same service. */
export const diary: DiaryReader<Tx> = {
  async diary(ctx, q) {
    const view = await loadDiary(ctx, q);
    return view.columns.flatMap((column) => column.appointments);
  },
  slots(ctx, q) {
    return listSlots(ctx, q);
  },
  book(ctx, input) {
    return bookAppointment(ctx, {
      doctorId: input.doctorId,
      date: input.date,
      slotStart: input.slotStart,
      reason: input.reason,
      patientId: input.patientId,
      channel: input.channel,
    });
  },
  cancel(ctx, appointmentId, reason) {
    return cancelAppointment(ctx, appointmentId, reason);
  },
};
