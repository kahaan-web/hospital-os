import { Text, View } from 'react-native';
import { copy } from '../copy';
import { space, type } from '../theme';
import { useTheme } from '../theme-context';
import { useAuth } from '../auth';
import { Badge } from '../ui/Badge';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { ListRow } from '../ui/ListRow';
import { Panel } from '../ui/Panel';
import { Screen } from '../ui/Screen';
import type { RoleAppConfig } from './types';

export function ComingSoonScreen({ app }: { app: RoleAppConfig }) {
  const { colors } = useTheme();
  const { me, signOut } = useAuth();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const userName = me?.kind === 'tenant' ? me.user.name : me?.kind === 'platform' ? me.admin.name : '';

  return (
    <Screen title={app.title} locationName={location}>
      <View style={{ marginBottom: space[16] }}>
        <Badge label={`${app.androidCode} · ${copy.comingSoon}`} tone="warning" />
      </View>
      <Text style={[type.bodyComfortable, { color: colors.ink, marginBottom: space[16] }]}>
        {copy.comingSoonBody}
      </Text>
      {userName ? (
        <Text style={[type.caption, { color: colors.inkMuted, marginBottom: space[12] }]}>Signed in as {userName}</Text>
      ) : null}
      <Panel>
        {app.features.length === 0 ? (
          <View style={{ padding: space[16] }}>
            <Banner message={copy.noFeaturesListed} tone="info" />
          </View>
        ) : (
          app.features.map((f, i) => (
            <ListRow key={f.name} title={f.name} subtitle={f.sourceName} last={i === app.features.length - 1} />
          ))
        )}
      </Panel>
      <Button label={copy.signOut} variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
