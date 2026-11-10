import { isoToDDMMYYYY, parseDDMMYYYY } from '@hos/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError } from '../../../src/api';
import { copy } from '../../../src/copy';
import { addDaysIso, formatSlot, todayIso } from '../../../src/format';
import { radius, space, type } from '../../../src/theme';
import { useTheme } from '../../../src/theme-context';
import { Banner } from '../../../src/ui/Banner';
import { Button } from '../../../src/ui/Button';
import { Screen } from '../../../src/ui/Screen';
import { TextField } from '../../../src/ui/TextField';
import { useLoad } from '../../../src/use-load';
import { useAuth } from '../../../src/auth';

export default function BookAppointmentScreen() {
  const { colors } = useTheme();
  const { me } = useAuth();
  const router = useRouter();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const { data: doctors, loading, error, reload } = useLoad(() => api.listDoctors(), []);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [dateText, setDateText] = useState(isoToDDMMYYYY(todayIso()));
  const iso = parseDDMMYYYY(dateText);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: slots, loading: slotsLoading } = useLoad(
    () => (doctorId && iso ? api.listSlots(doctorId, iso) : Promise.resolve([])),
    [doctorId, iso],
  );

  const selected = useMemo(() => doctors?.find((d) => d.id === doctorId) ?? null, [doctors, doctorId]);

  async function submit() {
    setFormError(null);
    if (!doctorId || !iso || !slotStart) {
      setFormError('Choose a doctor, a valid date (DD/MM/YYYY) and a slot.');
      return;
    }
    setBusy(true);
    try {
      const apt = await api.bookAppointment({ doctorId, date: iso, slotStart, reason });
      router.replace(`/patient/appointment/${apt.id}`);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not book. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={copy.bookAppointment} locationName={location} loading={loading} error={error} onRetry={reload}>
      {formError ? <Banner message={formError} tone="danger" /> : null}
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.doctor}</Text>
      <View style={{ gap: space[8], marginBottom: space[16] }}>
        {(doctors ?? []).map((d) => {
          const on = d.id === doctorId;
          return (
            <Pressable
              key={d.id}
              onPress={() => {
                setDoctorId(d.id);
                setSlotStart(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${d.name}, ${d.speciality}`}
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderColor: on ? colors.teal : colors.line,
                backgroundColor: on ? colors.tealSubtle : colors.surface,
                borderRadius: radius.panel,
                padding: space[12],
              }}
            >
              <Text style={[type.label, { color: colors.ink }]}>{d.name}</Text>
              <Text style={[type.caption, { color: colors.inkMuted }]}>
                {d.speciality} · {d.consultingDays}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextField label={copy.date} value={dateText} onChangeText={setDateText} hint={copy.dateHint} keyboardType="numeric" />
      <View style={{ flexDirection: 'row', gap: space[8], marginBottom: space[16] }}>
        <View style={{ flex: 1 }}>
          <Button
            label={copy.today}
            variant="secondary"
            onPress={() => {
              setDateText(isoToDDMMYYYY(todayIso()));
              setSlotStart(null);
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={copy.tomorrow}
            variant="secondary"
            onPress={() => {
              setDateText(isoToDDMMYYYY(addDaysIso(todayIso(), 1)));
              setSlotStart(null);
            }}
          />
        </View>
      </View>
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.slot}</Text>
      {!doctorId || !iso ? (
        <Text style={[type.caption, { color: colors.inkMuted, marginBottom: space[16] }]}>
          Choose a doctor and a valid date to see slots.
        </Text>
      ) : slotsLoading ? (
        <Text style={[type.caption, { color: colors.inkMuted, marginBottom: space[16] }]}>{copy.loading}</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8], marginBottom: space[16] }}>
          {(slots ?? []).filter((s) => s.available).length === 0 ? (
            <Text style={[type.body, { color: colors.ink }]}>{copy.noSlots}</Text>
          ) : (
            (slots ?? [])
              .filter((s) => s.available)
              .map((s) => {
                const on = slotStart === s.start;
                return (
                  <Pressable
                    key={s.start}
                    onPress={() => setSlotStart(s.start)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={formatSlot(s.start, s.end)}
                    style={{
                      minHeight: 48,
                      minWidth: 96,
                      paddingHorizontal: space[12],
                      borderRadius: radius.control,
                      borderWidth: 1,
                      borderColor: on ? colors.teal : colors.line,
                      backgroundColor: on ? colors.tealSubtle : colors.surface,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={[type.label, { color: colors.ink, fontVariant: ['tabular-nums'] }]}>
                      {formatSlot(s.start, s.end)}
                    </Text>
                  </Pressable>
                );
              })
          )}
        </View>
      )}
      <TextField
        label={copy.reason}
        value={reason}
        onChangeText={setReason}
        autoCapitalize="sentences"
        placeholder="e.g. Follow-up for fever"
      />
      {selected && iso && slotStart ? (
        <Text style={[type.caption, { color: colors.inkMuted, marginBottom: space[12] }]}>
          {selected.name} on {dateText} at {slotStart}
        </Text>
      ) : null}
      <Button label={copy.bookThisSlot} onPress={() => void submit()} loading={busy} />
    </Screen>
  );
}
