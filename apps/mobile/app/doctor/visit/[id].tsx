import { TEST_STATUS_LABEL } from '@hos/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { dash, formatBp, formatDate, formatPulse, formatSpo2, formatTempC, formatWeightKg } from '../../../src/format';
import { space, type } from '../../../src/theme';
import { useTheme } from '../../../src/theme-context';
import { Button } from '../../../src/ui/Button';
import { FieldRow } from '../../../src/ui/FieldRow';
import { ListRow } from '../../../src/ui/ListRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
import { useLoad } from '../../../src/use-load';

export default function DoctorVisitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const { data, loading, error, reload } = useLoad(() => api.getDoctorVisit(String(id)), [id]);

  return (
    <Screen title={copy.visitDetail} locationName={location} loading={loading} error={error} onRetry={reload} hideTitle>
      {data ? (
        <>
          <Panel>
            <FieldRow label={copy.patient} value={copy.nameAndUhid(data.patientName, data.uhid)} />
            <FieldRow label={copy.date} value={formatDate(data.visitedOn)} />
            <FieldRow label={copy.chiefComplaint} value={dash(data.chiefComplaint)} />
            <FieldRow
              label={copy.diagnosis}
              value={dash(data.diagnosis) === '—' ? copy.notRecorded : data.diagnosis}
              last
            />
          </Panel>
          <View style={{ flexDirection: 'row', gap: space[8], marginBottom: space[16] }}>
            <View style={{ flex: 1 }}>
              <Button
                label={copy.orderTests}
                onPress={() => router.push(`/doctor/order?visitId=${data.id}&kind=test`)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={copy.orderMedicines}
                variant="secondary"
                onPress={() => router.push(`/doctor/order?visitId=${data.id}&kind=medicine`)}
              />
            </View>
          </View>
          <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.vitals}</Text>
          <Panel>
            <FieldRow
              label={copy.bloodPressure}
              value={formatBp(data.vitals.bpSystolic, data.vitals.bpDiastolic)}
              hint={copy.bpRange}
            />
            <FieldRow label={copy.pulse} value={formatPulse(data.vitals.pulse)} hint={copy.pulseRange} />
            <FieldRow label={copy.temperature} value={formatTempC(data.vitals.tempC)} hint={copy.tempRange} />
            <FieldRow label={copy.spo2} value={formatSpo2(data.vitals.spo2)} hint={copy.spo2Range} />
            <FieldRow label={copy.weight} value={formatWeightKg(data.vitals.weightKg)} hint={copy.weightHint} last />
          </Panel>
          <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.tests}</Text>
          <Panel>
            {data.tests.length === 0 ? (
              <ListRow title={copy.noTestsOrdered} last />
            ) : (
              data.tests.map((t, i) => (
                <ListRow
                  key={`${t.name}-${i}`}
                  title={t.name}
                  subtitle={t.resultSummary ?? copy.pending}
                  meta={TEST_STATUS_LABEL[t.status]}
                  last={i === data.tests.length - 1}
                />
              ))
            )}
          </Panel>
          <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.medicines}</Text>
          <Panel>
            {data.medicines.length === 0 ? (
              <ListRow title={copy.noMedicinesOrdered} last />
            ) : (
              data.medicines.map((m, i) => (
                <ListRow
                  key={`${m.name}-${i}`}
                  title={m.name}
                  subtitle={copy.medicineLine(
                    m.dose,
                    m.frequency,
                    m.days === 0 ? copy.notRecorded : copy.daysCount(m.days),
                  )}
                  last={i === data.medicines.length - 1}
                />
              ))
            )}
          </Panel>
        </>
      ) : null}
    </Screen>
  );
}
