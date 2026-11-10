import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { dash, formatBp, formatDate } from '../../../src/format';
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
    <Screen title={copy.visitDetail} locationName={location} loading={loading} error={error} onRetry={reload}>
      {data ? (
        <>
          <Panel>
            <FieldRow label="Date" value={formatDate(data.visitedOn)} />
            <FieldRow label="Doctor" value={data.doctorName} />
            <FieldRow label="UHID" value={data.uhid} />
            <FieldRow label={copy.chiefComplaint} value={data.chiefComplaint} />
            <FieldRow label={copy.diagnosis} value={dash(data.diagnosis)} />
            <FieldRow label={copy.notes} value={dash(data.notes)} last />
          </Panel>
          <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.vitals}</Text>
          <Panel>
            <FieldRow label="Blood pressure" value={formatBp(data.vitals.bpSystolic, data.vitals.bpDiastolic)} />
            <FieldRow label="Pulse" value={data.vitals.pulse === null ? '—' : `${data.vitals.pulse} /min`} />
            <FieldRow label="Temperature" value={data.vitals.tempC === null ? '—' : `${data.vitals.tempC} °C`} />
            <FieldRow label="SpO₂" value={data.vitals.spo2 === null ? '—' : `${data.vitals.spo2} %`} />
            <FieldRow
              label="Weight"
              value={data.vitals.weightKg === null ? '—' : `${data.vitals.weightKg} kg`}
              last
            />
          </Panel>
          <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.tests}</Text>
          <Panel>
            {data.tests.length === 0 ? (
              <ListRow title="No tests recorded" last />
            ) : (
              data.tests.map((t, i) => (
                <ListRow
                  key={`${t.name}-${i}`}
                  title={t.name}
                  subtitle={t.resultSummary ?? copy.pending}
                  meta={t.status}
                  last={i === data.tests.length - 1}
                />
              ))
            )}
          </Panel>
          <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.medicines}</Text>
          <Panel>
            {data.medicines.length === 0 ? (
              <ListRow title="No medicines recorded" last />
            ) : (
              data.medicines.map((m, i) => (
                <ListRow
                  key={`${m.name}-${i}`}
                  title={m.name}
                  subtitle={`${m.dose} · ${m.frequency} · ${m.days} days`}
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
