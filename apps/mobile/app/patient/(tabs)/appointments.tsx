import { APPOINTMENT_STATUS_LABEL } from '@hos/shared';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { formatDate, formatSlot } from '../../../src/format';
import { space } from '../../../src/theme';
import { Badge } from '../../../src/ui/Badge';
import { Button } from '../../../src/ui/Button';
import { ListRow } from '../../../src/ui/ListRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
import { appointmentTone } from '../../../src/ui/status';
import { useLoad } from '../../../src/use-load';

export default function AppointmentsScreen() {
  const { me } = useAuth();
  const router = useRouter();
  const { data, loading, error, reload } = useLoad(() => api.listAppointments(), []);
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;

  return (
    <Screen
      title={copy.appointments}
      locationName={location}
      loading={loading}
      error={error}
      onRetry={reload}
      empty={data && data.length === 0 ? copy.noAppointments : undefined}
      emptyActionLabel={copy.bookAppointment}
      onEmptyAction={() => router.push('/patient/appointment/book')}
    >
      <View style={{ marginBottom: space[16] }}>
        <Button label={copy.bookAppointment} onPress={() => router.push('/patient/appointment/book')} />
      </View>
      <Panel>
        {(data ?? []).map((a, i) => (
          <ListRow
            key={a.id}
            title={`${formatDate(a.date)} · ${formatSlot(a.slotStart, a.slotEnd)}`}
            subtitle={`${a.doctorName} · ${a.speciality}`}
            meta={APPOINTMENT_STATUS_LABEL[a.status]}
            last={i === (data?.length ?? 0) - 1}
            onPress={() => router.push(`/patient/appointment/${a.id}`)}
            accessibilityLabel={`${a.doctorName}, ${formatDate(a.date)}, ${APPOINTMENT_STATUS_LABEL[a.status]}`}
          />
        ))}
      </Panel>
      {(data ?? []).length > 0 ? (
        <View style={{ marginTop: space[8], flexDirection: 'row', gap: space[8], flexWrap: 'wrap' }}>
          {(data ?? []).slice(0, 1).map((a) => (
            <Badge key={a.id} label={APPOINTMENT_STATUS_LABEL[a.status]} tone={appointmentTone(a.status)} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
