import { APPOINTMENT_STATUS_LABEL } from '@hos/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, ApiError } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { formatDate, formatSlot } from '../../../src/format';
import { space } from '../../../src/theme';
import { Badge } from '../../../src/ui/Badge';
import { Banner } from '../../../src/ui/Banner';
import { Button } from '../../../src/ui/Button';
import { FieldRow } from '../../../src/ui/FieldRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
import { appointmentTone } from '../../../src/ui/status';
import { useLoad } from '../../../src/use-load';

export default function AppointmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const { data, loading, error, reload } = useLoad(() => api.getAppointment(String(id)), [id]);
  const [confirm, setConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    setActionError(null);
    try {
      await api.cancelAppointment(String(id));
      reload();
      setConfirm(false);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

  const cancellable = data && data.status !== 'cancelled' && data.status !== 'completed';

  return (
    <Screen title="Appointment" locationName={location} loading={loading} error={error} onRetry={reload}>
      {data ? (
        <>
          <View style={{ marginBottom: space[12] }}>
            <Badge label={APPOINTMENT_STATUS_LABEL[data.status]} tone={appointmentTone(data.status)} />
          </View>
          {actionError ? <Banner message={actionError} tone="danger" /> : null}
          <Panel>
            <FieldRow label="When" value={`${formatDate(data.date)} · ${formatSlot(data.slotStart, data.slotEnd)}`} />
            <FieldRow label="Doctor" value={`${data.doctorName} · ${data.speciality}`} />
            <FieldRow label="Location" value={data.locationName} />
            <FieldRow label="UHID" value={data.uhid} />
            <FieldRow label={copy.reason} value={data.reason} last />
          </Panel>
          {data.visitId ? (
            <View style={{ marginBottom: space[16] }}>
              <Button label="Open visit summary" variant="secondary" onPress={() => router.push(`/patient/visit/${data.visitId}`)} />
            </View>
          ) : null}
          {cancellable && !confirm ? (
            <Button label={copy.cancelAppointment} variant="danger" onPress={() => setConfirm(true)} />
          ) : null}
          {confirm ? (
            <View style={{ gap: space[8] }}>
              <Banner message={copy.cancelAppointmentConfirm} tone="warning" />
              <Button label={copy.cancelAppointment} variant="danger" onPress={() => void cancel()} loading={busy} />
              <Button label={copy.back} variant="secondary" onPress={() => setConfirm(false)} />
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
