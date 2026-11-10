import { useRouter } from 'expo-router';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { formatDate } from '../../../src/format';
import { ListRow } from '../../../src/ui/ListRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
import { useLoad } from '../../../src/use-load';

export default function VisitsScreen() {
  const { me } = useAuth();
  const router = useRouter();
  const { data, loading, error, reload } = useLoad(() => api.listVisits(), []);
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;

  return (
    <Screen
      title={copy.visits}
      locationName={location}
      loading={loading}
      error={error}
      onRetry={reload}
      empty={data && data.length === 0 ? copy.noVisits : undefined}
    >
      <Panel>
        {(data ?? []).map((v, i) => (
          <ListRow
            key={v.id}
            title={copy.dateAndDoctor(formatDate(v.visitedOn), v.doctorName)}
            subtitle={v.diagnosis || v.chiefComplaint}
            last={i === (data?.length ?? 0) - 1}
            onPress={() => router.push(`/patient/visit/${v.id}`)}
            accessibilityLabel={copy.visitWith(formatDate(v.visitedOn), v.doctorName)}
          />
        ))}
      </Panel>
    </Screen>
  );
}
