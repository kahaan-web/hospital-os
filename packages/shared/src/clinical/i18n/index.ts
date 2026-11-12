import { adtEn } from './adt';
import { appointmentsEn } from './appointments';
import { billingEn } from './billing';
import { doctorEn } from './doctor';
import { indentsEn } from './indents';
import { ipbillingEn } from './ipbilling';
import { labEn } from './lab';
import { linenEn } from './linen';
import { nursingEn } from './nursing';
import { pharmacyEn } from './pharmacy';
import { portalEn } from './portal';
import { registrationEn } from './registration';

export const clinicalEn = {
  registration: registrationEn,
  appointments: appointmentsEn,
  doctor: doctorEn,
  adt: adtEn,
  billing: billingEn,
  ipbilling: ipbillingEn,
  pharmacy: pharmacyEn,
  lab: labEn,
  nursing: nursingEn,
  portal: portalEn,
  indents: indentsEn,
  linen: linenEn,
} as const;
