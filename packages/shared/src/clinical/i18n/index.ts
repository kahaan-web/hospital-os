import { adtEn } from './adt';
import { appointmentsEn } from './appointments';
import { billingEn } from './billing';
import { doctorEn } from './doctor';
import { ipbillingEn } from './ipbilling';
import { labEn } from './lab';
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
} as const;
