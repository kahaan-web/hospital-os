import { adtEn } from './adt';
import { appointmentsEn } from './appointments';
import { billingEn } from './billing';
import { doctorEn } from './doctor';
import { doctorAccountingEn, insuranceEn } from './insurance';
import { indentsEn } from './indents';
import { equipmentEn } from './equipment';
import { ipbillingEn } from './ipbilling';
import { labEn } from './lab';
import { linenEn } from './linen';
import { nursingEn } from './nursing';
import { otEn } from './ot';
import { payrollEn } from './payroll';
import { pharmacyEn } from './pharmacy';
import { portalEn } from './portal';
import { radiologyEn } from './radiology';
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
  ot: otEn,
  radiology: radiologyEn,
  insurance: insuranceEn,
  doctorAccounting: doctorAccountingEn,
  indents: indentsEn,
  linen: linenEn,
  equipment: equipmentEn,
  payroll: payrollEn,
} as const;
