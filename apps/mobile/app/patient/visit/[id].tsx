import { TEST_STATUS_LABEL } from '@hos/shared';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { dash, formatBp, formatDate, formatPulse, formatSpo2, formatTempC, formatWeightKg } from '../../../src/format';
import { space, type } from '../../../src/theme';
import { useTheme } from '../../../src/theme-context';
import { FieldRow } from '../../../src/ui/FieldRow';
import { ListRow } from '../../../src/ui/ListRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
import { useLoad } from '../../../src/use-load';

export default function VisitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { colors } = useTheme();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const { data, loading, error, reload } = useLoad(() => api.getVisit(String(id)), [id]);

  return (
    <Screen title={copy.visitDetail} locationName={location} loading={loading} error={error} onRetry={reload} hideTitle>
      {data ? (
        <>
          <Panel>
            <FieldRow label={copy.date} value={formatDate(data.visitedOn)} />
            <FieldRow label={copy.doctor} value={data.doctorName} />
            <FieldRow label={copy.uhid} value={data.uhid} />
            <FieldRow label={copy.chiefComplaint} value={data.chiefComplaint} />
            <FieldRow label={copy.diagnosis} value={dash(data.diagnosis)} />
            <FieldRow label={copy.notes} value={dash(data.notes)} last />
          </Panel>
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
              <ListRow title={copy.noTestsRecorded} last />
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
              <ListRow title={copy.noMedicinesRecorded} last />
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
