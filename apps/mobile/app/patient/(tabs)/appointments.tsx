import { APPOINTMENT_STATUS_LABEL } from '@hos/shared';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { formatDate, formatSlot } from '../../../src/format';
import { space } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { ListRow } from '../../../src/ui/ListRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
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
            title={copy.dateAndTime(formatDate(a.date), formatSlot(a.slotStart, a.slotEnd))}
            subtitle={copy.nameAndSpeciality(a.doctorName, a.speciality)}
            meta={APPOINTMENT_STATUS_LABEL[a.status]}
            last={i === (data?.length ?? 0) - 1}
            onPress={() => router.push(`/patient/appointment/${a.id}`)}
            accessibilityLabel={copy.billSummary(a.doctorName, APPOINTMENT_STATUS_LABEL[a.status], formatDate(a.date))}
          />
        ))}
      </Panel>
    </Screen>
  );
}
