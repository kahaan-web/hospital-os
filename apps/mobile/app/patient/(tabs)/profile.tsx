import { formatDate, GENDER_LABEL } from '@hos/shared';
import { Text, View } from 'react-native';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { dash, formatPhone, stateName } from '../../../src/format';
import { space, type } from '../../../src/theme';
import { useTheme } from '../../../src/theme-context';
import { Button } from '../../../src/ui/Button';
import { FieldRow } from '../../../src/ui/FieldRow';
import { Panel } from '../../../src/ui/Panel';
import { Screen } from '../../../src/ui/Screen';
import { useLoad } from '../../../src/use-load';

export default function ProfileScreen() {
  const { me, signOut } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const { data, loading, error, reload } = useLoad(() => api.getProfile(), []);
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;

  const controls = (
    <View
      style={{
        paddingHorizontal: space[16],
        paddingBottom: space[24],
        paddingTop: space[12],
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.canvas,
      }}
    >
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
    </View>
  );

  return (
    <Screen
      title={copy.profile}
      locationName={location}
      loading={loading}
      error={error}
      onRetry={reload}
      footer={controls}
    >
      {data ? (
        <Panel>
          <FieldRow label={copy.name} value={data.name} />
          <FieldRow label={copy.uhid} value={data.uhid} />
          <FieldRow label={copy.dateOfBirth} value={formatDate(data.dob)} />
          <FieldRow label={copy.gender} value={GENDER_LABEL[data.gender]} />
          <FieldRow label={copy.bloodGroup} value={dash(data.bloodGroup)} />
          <FieldRow label={copy.mobile} value={formatPhone(data.mobile)} />
          <FieldRow label={copy.email} value={data.email} />
          <FieldRow
            label={copy.address}
            value={copy.addressLine(data.addressLine1, data.city, stateName(data.stateCode), data.pincode)}
          />
          <FieldRow
            label={copy.emergencyContact}
            value={copy.emergencyLine(data.emergencyName, formatPhone(data.emergencyMobile))}
            last
          />
        </Panel>
      ) : null}
    </Screen>
  );
}
