import { BILL_STATUS_LABEL, formatINR } from '@hos/shared';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { formatDate } from '../../../src/format';
import { space, type } from '../../../src/theme';
import { useTheme } from '../../../src/theme-context';
import { Badge } from '../../../src/ui/Badge';
import { FieldRow } from '../../../src/ui/FieldRow';
import { ListRow } from '../../../src/ui/ListRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
import { billTone } from '../../../src/ui/status';
import { useLoad } from '../../../src/use-load';

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { colors } = useTheme();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const { data, loading, error, reload } = useLoad(() => api.getBill(String(id)), [id]);
  const due = data ? data.totalPaise - data.paidPaise : 0;

  return (
    <Screen title={copy.billDetail} locationName={location} loading={loading} error={error} onRetry={reload} hideTitle>
      {data ? (
        <>
          <View style={{ marginBottom: space[12] }}>
            <Badge label={BILL_STATUS_LABEL[data.status]} tone={billTone(data.status)} />
          </View>
          <Panel>
            <FieldRow label={copy.number} value={data.number} />
            <FieldRow label={copy.date} value={formatDate(data.issuedOn)} />
            <FieldRow label={copy.patient} value={copy.nameAndUhid(data.patientName, data.uhid)} />
            <FieldRow label={copy.location} value={data.locationName} last />
          </Panel>
          <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.charges}</Text>
          <Panel>
            {data.lines.map((line, i) => (
              <ListRow
                key={`${line.description}-${i}`}
                title={line.description}
                subtitle={copy.qtyAndUnit(line.qty, formatINR(line.unitPaise, { decimals: 'always' }))}
                meta={formatINR(line.amountPaise, { decimals: 'always' })}
                last={i === data.lines.length - 1}
              />
            ))}
          </Panel>
          <Panel>
            <FieldRow label={copy.subtotal} value={formatINR(data.subtotalPaise, { decimals: 'always' })} />
            <FieldRow label={copy.cgst} value={formatINR(data.cgstPaise, { decimals: 'always' })} />
            <FieldRow label={copy.sgst} value={formatINR(data.sgstPaise, { decimals: 'always' })} />
            <FieldRow label={copy.igst} value={formatINR(data.igstPaise, { decimals: 'always' })} />
            <FieldRow label={copy.gst} value={formatINR(data.gstPaise, { decimals: 'always' })} hint={copy.gstExemptNote} />
            <FieldRow label={copy.total} value={formatINR(data.totalPaise, { decimals: 'always' })} />
            <FieldRow label={copy.paid} value={formatINR(data.paidPaise, { decimals: 'always' })} />
            <FieldRow label={copy.due} value={formatINR(due, { decimals: 'always' })} last />
          </Panel>
        </>
      ) : null}
    </Screen>
  );
}
