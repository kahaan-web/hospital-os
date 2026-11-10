import { ORDER_STATUS_LABEL } from '@hos/shared';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { formatDate } from '../../../src/format';
import { space } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { ListRow } from '../../../src/ui/ListRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
import { useLoad } from '../../../src/use-load';

export default function OrdersScreen() {
  const { me } = useAuth();
  const router = useRouter();
  const { data, loading, error, reload } = useLoad(() => api.listOrders(), []);
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;

  return (
    <Screen title={copy.orders} locationName={location} loading={loading} error={error} onRetry={reload}>
      <View style={{ marginBottom: space[16] }}>
        <Button label={copy.placeOrder} onPress={() => router.push('/doctor/order')} />
      </View>
      <Panel>
        {(data ?? []).length === 0 ? (
          <ListRow title="No orders placed yet." last />
        ) : (
          (data ?? []).map((o, i) => (
            <ListRow
              key={o.id}
              title={`${o.kind === 'test' ? 'Tests' : 'Medicines'} · ${o.patientName}`}
              subtitle={`${o.items.map((it) => it.name).join(', ')} · ${formatDate(o.createdAt)}`}
              meta={ORDER_STATUS_LABEL[o.status]}
              last={i === (data?.length ?? 0) - 1}
              onPress={() => router.push(`/doctor/visit/${o.visitId}`)}
            />
          ))
        )}
      </Panel>
    </Screen>
  );
}
