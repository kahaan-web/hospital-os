import { BILL_STATUS_LABEL, formatINR } from '@hos/shared';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { formatDate } from '../../../src/format';
import { Badge } from '../../../src/ui/Badge';
import { ListRow } from '../../../src/ui/ListRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
import { billTone } from '../../../src/ui/status';
import { useLoad } from '../../../src/use-load';

export default function BillsScreen() {
  const { me } = useAuth();
  const router = useRouter();
  const { data, loading, error, reload } = useLoad(() => api.listBills(), []);
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;

  return (
    <Screen
      title={copy.bills}
      locationName={location}
      loading={loading}
      error={error}
      onRetry={reload}
      empty={data && data.length === 0 ? copy.noBills : undefined}
    >
      <Panel>
        {(data ?? []).map((b, i) => (
          <View key={b.id}>
            <ListRow
              title={b.number}
              subtitle={`${formatDate(b.issuedOn)} · ${formatINR(b.totalPaise, { decimals: 'always' })}`}
              last={i === (data?.length ?? 0) - 1}
              onPress={() => router.push(`/patient/bill/${b.id}`)}
              accessibilityLabel={`${b.number}, ${BILL_STATUS_LABEL[b.status]}, ${formatINR(b.totalPaise, { decimals: 'always' })}`}
            />
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Badge label={BILL_STATUS_LABEL[b.status]} tone={billTone(b.status)} />
            </View>
          </View>
        ))}
      </Panel>
    </Screen>
  );
}
