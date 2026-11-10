import { APPOINTMENT_STATUS_LABEL } from '@hos/shared';
import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { formatDate, formatSlot, todayIso } from '../../../src/format';
import { space, type } from '../../../src/theme';
import { useTheme } from '../../../src/theme-context';
import { ListRow } from '../../../src/ui/ListRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
import { useLoad } from '../../../src/use-load';

export default function DiaryScreen() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const today = todayIso();
  const { data, loading, error, reload } = useLoad(() => api.listDiary(today), [today]);
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;

  return (
    <Screen
      title={copy.diary}
      locationName={location}
      loading={loading}
      error={error}
      onRetry={reload}
      empty={data && data.length === 0 ? copy.noDiary : undefined}
    >
      <Text style={[type.caption, { color: colors.inkMuted, marginBottom: space[12], fontVariant: ['tabular-nums'] }]}>
        {formatDate(today)}
      </Text>
      <Panel>
        {(data ?? []).map((a, i) => (
          <ListRow
            key={a.id}
            title={`${formatSlot(a.slotStart, a.slotEnd)} · ${a.patientName}`}
            subtitle={`${a.uhid} · ${APPOINTMENT_STATUS_LABEL[a.status]} · ${a.reason}`}
            last={i === (data?.length ?? 0) - 1}
            onPress={() => router.push(`/doctor/visit/${a.visitId}`)}
            accessibilityLabel={`${a.patientName} at ${a.slotStart}, ${APPOINTMENT_STATUS_LABEL[a.status]}`}
          />
        ))}
      </Panel>
    </Screen>
  );
}
