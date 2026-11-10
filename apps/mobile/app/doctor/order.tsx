import { type OrderKind } from '@hos/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { useAuth } from '../../src/auth';
import { copy } from '../../src/copy';
import { formatDate, todayIso } from '../../src/format';
import { radius, space, type } from '../../src/theme';
import { useTheme } from '../../src/theme-context';
import { Banner } from '../../src/ui/Banner';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { TextField } from '../../src/ui/TextField';
import { useLoad } from '../../src/use-load';

type Line = { name: string; dose: string; frequency: string; days: string; notes: string };

const emptyLine = (): Line => ({ name: '', dose: '', frequency: '', days: '', notes: '' });

export default function PlaceOrderScreen() {
  const params = useLocalSearchParams<{ visitId?: string; kind?: string }>();
  const { me } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const { data: visits } = useLoad(() => api.listVisits(), []);
  const { data: diary } = useLoad(() => api.listDiary(todayIso()), []);
  const visitOptions = useMemo(() => {
    const fromVisits = visits ?? [];
    const extra = (diary ?? [])
      .filter((a) => a.visitId && !fromVisits.some((v) => v.id === a.visitId))
      .map((a) => ({ id: a.visitId as string, patientName: a.patientName, visitedOn: a.date, uhid: a.uhid }));
    return [...fromVisits, ...extra];
  }, [visits, diary]);

  const [visitId, setVisitId] = useState(params.visitId ?? '');
  const [kind, setKind] = useState<OrderKind>(params.kind === 'medicine' ? 'medicine' : 'test');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setError(null);
    const items = lines
      .filter((l) => l.name.trim())
      .map((l) => ({
        name: l.name.trim(),
        notes: l.notes.trim() || undefined,
        dose: kind === 'medicine' ? l.dose.trim() || undefined : undefined,
        frequency: kind === 'medicine' ? l.frequency.trim() || undefined : undefined,
        days: kind === 'medicine' && l.days ? Number(l.days) : undefined,
      }));
    if (!visitId) {
      setError('Choose a patient visit.');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one item.');
      return;
    }
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await api.placeOrder({ visitId, kind, items });
      router.replace(`/doctor/visit/${visitId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not place the order.');
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={copy.placeOrder} locationName={location}>
      {error ? <Banner message={error} tone="danger" /> : null}
      {confirm ? <Banner message={copy.placeOrderConfirm} tone="warning" /> : null}
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>Patient visit</Text>
      <View style={{ gap: space[8], marginBottom: space[16] }}>
        {visitOptions.map((v) => {
          const on = v.id === visitId;
          return (
            <Pressable
              key={v.id}
              onPress={() => setVisitId(v.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${v.patientName}, ${formatDate(v.visitedOn)}`}
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderColor: on ? colors.teal : colors.line,
                backgroundColor: on ? colors.tealSubtle : colors.surface,
                borderRadius: radius.panel,
                padding: space[12],
              }}
            >
              <Text style={[type.label, { color: colors.ink }]}>{v.patientName}</Text>
              <Text style={[type.caption, { color: colors.inkMuted }]}>
                {formatDate(v.visitedOn)} · {v.uhid}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>Order type</Text>
      <View style={{ flexDirection: 'row', gap: space[8], marginBottom: space[16] }}>
        <View style={{ flex: 1 }}>
          <Button label={copy.orderTests} variant={kind === 'test' ? 'primary' : 'secondary'} onPress={() => setKind('test')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={copy.orderMedicines}
            variant={kind === 'medicine' ? 'primary' : 'secondary'}
            onPress={() => setKind('medicine')}
          />
        </View>
      </View>
      {lines.map((line, i) => (
        <View key={i} style={{ marginBottom: space[8] }}>
          <TextField
            label={kind === 'test' ? `Test ${i + 1}` : `Medicine ${i + 1}`}
            value={line.name}
            onChangeText={(name) => updateLine(i, { name })}
            autoCapitalize="words"
            placeholder={kind === 'test' ? 'e.g. CBC' : 'e.g. Paracetamol 650 mg'}
          />
          {kind === 'medicine' ? (
            <>
              <TextField label="Dose" value={line.dose} onChangeText={(dose) => updateLine(i, { dose })} placeholder="650 mg" />
              <TextField
                label="Frequency"
                value={line.frequency}
                onChangeText={(frequency) => updateLine(i, { frequency })}
                placeholder="1-0-1 after food"
              />
              <TextField label="Days" value={line.days} onChangeText={(days) => updateLine(i, { days })} keyboardType="numeric" />
            </>
          ) : (
            <TextField label="Notes" value={line.notes} onChangeText={(notes) => updateLine(i, { notes })} autoCapitalize="sentences" />
          )}
        </View>
      ))}
      <View style={{ marginBottom: space[16] }}>
        <Button label={copy.addItem} variant="secondary" onPress={() => setLines((p) => [...p, emptyLine()])} />
      </View>
      <Button label={confirm ? copy.confirm : copy.placeOrder} onPress={() => void submit()} loading={busy} />
      {confirm ? (
        <View style={{ marginTop: space[8] }}>
          <Button label={copy.back} variant="ghost" onPress={() => setConfirm(false)} />
        </View>
      ) : null}
    </Screen>
  );
}
