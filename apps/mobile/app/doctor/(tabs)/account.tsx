import { Text, View } from 'react-native';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { formatPhone } from '../../../src/format';
import { space, type } from '../../../src/theme';
import { useTheme } from '../../../src/theme-context';
import { Button } from '../../../src/ui/Button';
import { FieldRow } from '../../../src/ui/FieldRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';

export default function DoctorAccountScreen() {
  const { me, signOut } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const user = me?.kind === 'tenant' ? me.user : null;
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const tenant = me?.kind === 'tenant' ? me.tenant.displayName : copy.appName;
  const role = me?.kind === 'tenant' ? me.roles.map((r) => r.roleName).join(', ') : copy.roleDoctor;

  return (
    <Screen title={copy.account} locationName={location}>
      <Panel>
        <FieldRow label={copy.name} value={user?.name ?? '—'} />
        <FieldRow label={copy.email} value={user?.email ?? '—'} />
        <FieldRow label={copy.mobile} value={formatPhone(user?.mobile ?? '')} />
        <FieldRow label={copy.hospitalLabel} value={tenant} />
        <FieldRow label={copy.role} value={role || copy.roleDoctor} last />
      </Panel>
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.appearance}</Text>
      <View style={{ flexDirection: 'row', gap: space[8], marginBottom: space[24] }}>
        <View style={{ flex: 1 }}>
          <Button
            label={copy.light}
            variant={preference === 'light' ? 'primary' : 'secondary'}
            onPress={() => setPreference('light')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={copy.dark}
            variant={preference === 'dark' ? 'primary' : 'secondary'}
            onPress={() => setPreference('dark')}
          />
        </View>
      </View>
      <Button label={copy.signOut} variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
