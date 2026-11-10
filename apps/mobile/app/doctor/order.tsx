import { fieldErrors, placeOrderSchema, type OrderKind } from '@hos/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError } from '../../src/api';
import { useAuth } from '../../src/auth';
import { copy } from '../../src/copy';
import { formatDate, todayIso } from '../../src/format';
import { radius, space, type } from '../../src/theme';
import { useTheme } from '../../src/theme-context';
import { Banner } from '../../src/ui/Banner';
import { Button } from '../../src/ui/Button';
import { isFocused, webFocusRing } from '../../src/ui/focus';
import { Screen } from '../../src/ui/Screen';
import { TextField } from '../../src/ui/TextField';
import { useLoad } from '../../src/use-load';

type Line = { name: string; dose: string; frequency: string; days: string; notes: string };

const emptyLine = (): Line => ({ name: '', dose: '', frequency: '', days: '', notes: '' });

function parseDays(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (!/^\d+$/.test(t)) return Number.NaN;
  return Number(t);
}

export default function PlaceOrderScreen() {
  const params = useLocalSearchParams<{ visitId?: string; kind?: string }>();
  const { me } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const visitsLoad = useLoad(() => api.listDoctorVisits(), []);
  const diaryLoad = useLoad(() => api.listDiary(todayIso()), []);
  const visitOptions = useMemo(() => {
    const fromVisits = visitsLoad.data ?? [];
    const extra = (diaryLoad.data ?? [])
      .filter((a) => a.visitId && !fromVisits.some((v) => v.id === a.visitId))
      .map((a) => ({ id: a.visitId as string, patientName: a.patientName, visitedOn: a.date, uhid: a.uhid }));
    return [...fromVisits, ...extra];
  }, [visitsLoad.data, diaryLoad.data]);

  const [visitId, setVisitId] = useState(params.visitId ?? '');
  const [kind, setKind] = useState<OrderKind>(params.kind === 'medicine' ? 'medicine' : 'test');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setConfirm(false);
  }, [visitId, kind, lines]);

  const selectedVisit = visitOptions.find((v) => v.id === visitId);
  const loading = visitsLoad.loading || diaryLoad.loading;
  const loadError = visitsLoad.error || diaryLoad.error;

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setError(null);
    setFields({});
    const items = lines
      .filter((l) => l.name.trim())
      .map((l) => ({
        name: l.name.trim(),
        notes: l.notes.trim() || undefined,
        dose: kind === 'medicine' ? l.dose.trim() || undefined : undefined,
        frequency: kind === 'medicine' ? l.frequency.trim() || undefined : undefined,
        days: kind === 'medicine' ? parseDays(l.days) : undefined,
      }));
    const parsed = placeOrderSchema.safeParse({ visitId, kind, items });
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setFields(next);
      setError(next.visitId ?? next.items ?? Object.values(next)[0] ?? copy.checkForm);
      return;
    }
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await api.placeOrder(parsed.data);
      router.replace(`/doctor/visit/${visitId}`);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields ?? {});
        setError(e.fields ? Object.values(e.fields)[0] ?? e.message : e.message);
      } else {
        setError(copy.couldNotPlaceOrder);
      }
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  const itemNames = lines
    .map((l) => l.name.trim())
    .filter(Boolean)
    .join(', ');

  return (
    <Screen
      title={copy.placeOrder}
      locationName={location}
      loading={loading}
      error={loadError}
      onRetry={() => {
        visitsLoad.reload();
        diaryLoad.reload();
      }}
      empty={visitOptions.length === 0 ? copy.noVisitsToOrder : undefined}
      hideTitle
    >
      {error ? <Banner message={error} tone="danger" /> : null}
      {confirm && selectedVisit ? (
        <Banner message={copy.placeOrderBanner(selectedVisit.patientName, selectedVisit.uhid, itemNames)} tone="warning" />
      ) : null}
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.patientVisit}</Text>
      <View style={{ gap: space[8], marginBottom: space[16] }}>
        {visitOptions.map((v) => {
          const on = v.id === visitId;
          return (
            <Pressable
              key={v.id}
              onPress={() => setVisitId(v.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={copy.nameAndUhid(v.patientName, formatDate(v.visitedOn))}
              style={(state) => [
                {
                  minHeight: 48,
                  borderWidth: 1,
                  borderColor: on ? colors.teal : colors.line,
                  backgroundColor: on ? colors.tealSubtle : colors.surface,
                  borderRadius: radius.panel,
                  padding: space[12],
                },
                webFocusRing(colors.teal, isFocused(state)),
              ]}
            >
              <Text style={[type.label, { color: colors.ink }]}>{v.patientName}</Text>
              <Text style={[type.caption, { color: colors.inkMuted }]}>
                {copy.dateAndUhid(formatDate(v.visitedOn), v.uhid)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {fields.visitId ? (
        <Text style={[type.caption, { color: colors.danger, marginBottom: space[8] }]}>{fields.visitId}</Text>
      ) : null}
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.orderType}</Text>
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
            label={kind === 'test' ? copy.testN(i + 1) : copy.medicineN(i + 1)}
            value={line.name}
            onChangeText={(name) => updateLine(i, { name })}
            autoCapitalize="words"
            placeholder={kind === 'test' ? copy.placeholderTest : copy.placeholderMedicine}
            error={i === 0 ? fields['items.0.name'] ?? fields.items : undefined}
          />
          {kind === 'medicine' ? (
            <>
              <TextField
                label={copy.dose}
                value={line.dose}
                onChangeText={(dose) => updateLine(i, { dose })}
                placeholder={copy.placeholderDose}
              />
              <TextField
                label={copy.frequency}
                value={line.frequency}
                onChangeText={(frequency) => updateLine(i, { frequency })}
                placeholder={copy.placeholderFrequency}
              />
              <TextField
                label={copy.days}
                value={line.days}
                onChangeText={(days) => updateLine(i, { days })}
                keyboardType="numeric"
                error={i === 0 ? fields['items.0.days'] : undefined}
              />
            </>
          ) : (
            <TextField
              label={copy.notesLabel}
              value={line.notes}
              onChangeText={(notes) => updateLine(i, { notes })}
              autoCapitalize="sentences"
            />
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
