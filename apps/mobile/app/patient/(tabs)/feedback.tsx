import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABEL, type FeedbackCategory } from '@hos/shared';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { radius, space, type } from '../../../src/theme';
import { useTheme } from '../../../src/theme-context';
import { Banner } from '../../../src/ui/Banner';
import { Button } from '../../../src/ui/Button';
import { Screen } from '../../../src/ui/Screen';
import { TextField } from '../../../src/ui/TextField';

export default function FeedbackScreen() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [cats, setCats] = useState<FeedbackCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function toggle(c: FeedbackCategory) {
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api.submitFeedback({ rating, comment, categories: cats });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save feedback.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={copy.feedback} locationName={location}>
      {done ? <Banner message={copy.feedbackSent} tone="info" /> : null}
      {error ? <Banner message={error} tone="danger" /> : null}
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.rating}</Text>
      <View style={{ flexDirection: 'row', gap: space[8], marginBottom: space[16] }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setRating(n)}
            accessibilityRole="button"
            accessibilityLabel={`${n} out of 5`}
            accessibilityState={{ selected: rating === n }}
            style={{
              minWidth: 48,
              minHeight: 48,
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: rating === n ? colors.teal : colors.line,
              backgroundColor: rating === n ? colors.tealSubtle : colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[type.label, { color: colors.ink, fontVariant: ['tabular-nums'] }]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>About</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8], marginBottom: space[16] }}>
        {FEEDBACK_CATEGORIES.map((c) => {
          const on = cats.includes(c);
          return (
            <Pressable
              key={c}
              onPress={() => toggle(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={FEEDBACK_CATEGORY_LABEL[c]}
              style={{
                minHeight: 48,
                paddingHorizontal: space[12],
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: on ? colors.teal : colors.line,
                backgroundColor: on ? colors.tealSubtle : colors.surface,
                justifyContent: 'center',
              }}
            >
              <Text style={[type.caption, { color: colors.ink }]}>{FEEDBACK_CATEGORY_LABEL[c]}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextField label={copy.comment} value={comment} onChangeText={setComment} autoCapitalize="sentences" />
      <Button label={copy.sendFeedback} onPress={() => void submit()} loading={busy} disabled={done} />
    </Screen>
  );
}
