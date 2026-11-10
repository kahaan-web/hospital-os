import { Redirect, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hrefForMe } from '../src/apps';
import { ApiError } from '../src/api';
import { useAuth } from '../src/auth';
import { copy } from '../src/copy';
import { USE_MOCK } from '../src/env';
import { space, type } from '../src/theme';
import { useTheme } from '../src/theme-context';
import { Banner } from '../src/ui/Banner';
import { Button } from '../src/ui/Button';
import { TextField } from '../src/ui/TextField';

export default function LoginScreen() {
  const { colors } = useTheme();
  const { me, loading, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!loading && me) return <Redirect href={hrefForMe(me) as Href} />;

  async function onSubmit() {
    setError(null);
    setFields({});
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields ?? {});
        setError(e.fields ? null : e.message);
      } else {
        setError(copy.couldNotSignIn);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ padding: space[16], maxWidth: 480 }}>
        <Text style={[type.caption, { color: colors.inkMuted }]}>{copy.appName}</Text>
        <Text style={[type.display, { color: colors.ink, marginTop: space[8], marginBottom: space[24] }]}>
          {copy.signIn}
        </Text>
        {error ? <Banner message={error} tone="danger" /> : null}
        <TextField
          label={copy.email}
          value={email}
          onChangeText={setEmail}
          placeholder={copy.emailPlaceholder}
          keyboardType="email-address"
          autoComplete="email"
          error={fields.email}
          returnKeyType="next"
          blurOnSubmit={false}
        />
        <TextField
          label={copy.password}
          value={password}
          onChangeText={setPassword}
          placeholder={copy.passwordPlaceholder}
          secure
          autoComplete="password"
          error={fields.password}
          returnKeyType="go"
          onSubmitEditing={() => void onSubmit()}
        />
        <Button label={busy ? copy.signingIn : copy.signIn} onPress={() => void onSubmit()} loading={busy} />
        {USE_MOCK ? (
          <Text style={[type.caption, { color: colors.inkMuted, marginTop: space[16] }]}>{copy.demoHint}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
