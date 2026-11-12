import type { FastifyInstance } from 'fastify';
import type { Deps } from '../guard';
import { registerAdt } from './adt/routes';
import { registerAppointments } from './appointments/routes';
import { registerBilling } from './billing/routes';
import { registerDoctor } from './doctor/routes';
import { registerIpbilling } from './ipbilling/routes';
import { registerLab } from './lab/routes';
import { registerModuleRoutes } from './module-routes';
import { registerMvp } from './mvp/routes';
import { registerNursing } from './nursing/routes';
import { registerPharmacy } from './pharmacy/routes';
import { registerPortal } from './portal/routes';
import { registerRegistration } from './registration/routes';

export function registerClinical(app: FastifyInstance, deps: Deps): void {
  registerModuleRoutes(app, deps);
  registerRegistration(app, deps);
  registerAppointments(app, deps);
  registerDoctor(app, deps);
  registerAdt(app, deps);
  registerBilling(app, deps);
  registerIpbilling(app, deps);
  registerPharmacy(app, deps);
  registerLab(app, deps);
  registerNursing(app, deps);
  registerMvp(app, deps);
  registerPortal(app, deps);
}

export { clinical } from './registry';
