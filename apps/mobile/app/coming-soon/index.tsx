import { useRouter, type Href } from 'expo-router';
import { Text, View } from 'react-native';
import { roleApps } from '../../src/apps';
import { useAuth } from '../../src/auth';
import { copy } from '../../src/copy';
import { space, type } from '../../src/theme';
import { useTheme } from '../../src/theme-context';
import { Button } from '../../src/ui/Button';
import { ListRow } from '../../src/ui/ListRow';
import { Panel } from '../../src/ui/Panel';
import { Screen } from '../../src/ui/Screen';

const HREF: Record<string, string> = {
  nurse: '/nurse',
  mis: '/mis',
  equipment: '/equipment',
  hr: '/hr',
  maintenance: '/maintenance',
};

export default function ComingSoonHub() {
  const { me, signOut } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const apps = Object.values(roleApps).filter((a) => !a.ready);

  return (
    <Screen title="Android apps" locationName={location}>
      {me?.kind === 'platform' ? <Text style={[type.body, { color: colors.ink, marginBottom: space[16] }]}>{copy.wrongApp}</Text> : null}
      <Text style={[type.bodyComfortable, { color: colors.ink, marginBottom: space[16] }]}>{copy.comingSoonBody}</Text>
      <Panel>
        {apps.map((a, i) => (
          <ListRow
            key={a.id}
            title={`${a.androidCode} · ${a.title}`}
            subtitle={`${a.features.length} features listed`}
            last={i === apps.length - 1}
            onPress={() => router.push((HREF[a.id] ?? '/coming-soon') as Href)}
          />
        ))}
      </Panel>
      <View style={{ marginTop: space[8] }}>
        <Button label={copy.signOut} variant="secondary" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}
