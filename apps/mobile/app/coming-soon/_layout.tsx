import { AppStack } from '../../src/apps/PlaceholderStack';
import { AuthGate, comingSoonAllowed } from '../../src/apps/RoleGate';
import { copy } from '../../src/copy';

export default function Layout() {
  return (
    <AuthGate allow={comingSoonAllowed}>
      <AppStack title={copy.comingLater} />
    </AuthGate>
  );
}
