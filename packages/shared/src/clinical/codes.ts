// Shared clinical code lists. Rates and clinical ranges are configuration, not advice.

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const ID_TYPES = ['aadhaar_last4', 'pan', 'voter', 'passport', 'dl', 'none'] as const;
export type IdType = (typeof ID_TYPES)[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type ClinicalGender = (typeof GENDERS)[number];

export const RELATIONS = ['spouse', 'parent', 'child', 'sibling', 'guardian', 'friend', 'other'] as const;
export type Relation = (typeof RELATIONS)[number];

export const VISIT_TYPES = ['new', 'follow_up'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const ROUTES = ['PO', 'IV', 'IM', 'SC', 'SL', 'TOP', 'INH', 'PR', 'EYE', 'EAR'] as const;
export type RouteCode = (typeof ROUTES)[number];

export const DOSE_FORMS = ['tablet', 'capsule', 'syrup', 'injection', 'drops', 'ointment', 'inhaler', 'sachet', 'gel'] as const;
export type DoseForm = (typeof DOSE_FORMS)[number];

export const BED_STATUSES = ['vacant', 'occupied', 'housekeeping', 'maintenance', 'blocked'] as const;
export type BedStatus = (typeof BED_STATUSES)[number];

export const SPECIMENS = ['blood', 'serum', 'plasma', 'urine', 'stool', 'swab', 'sputum', 'csf', 'other'] as const;
export type Specimen = (typeof SPECIMENS)[number];

export const PAYMENT_MODES = ['cash', 'upi', 'card', 'cheque', 'neft'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYER_TYPES = ['self', 'corporate', 'tpa', 'scheme', 'free'] as const;
export type PayerType = (typeof PAYER_TYPES)[number];

/** Times per day are the scheduled doses. SOS is unscheduled. */
export const FREQUENCIES = [
  { code: 'OD', label: 'Once daily', timesPerDay: 1 },
  { code: 'BD', label: 'Twice daily', timesPerDay: 2 },
  { code: 'TDS', label: 'Three times daily', timesPerDay: 3 },
  { code: 'QID', label: 'Four times daily', timesPerDay: 4 },
  { code: 'HS', label: 'At bedtime', timesPerDay: 1 },
  { code: 'SOS', label: 'When required', timesPerDay: 0 },
  { code: 'STAT', label: 'Immediately', timesPerDay: 1 },
] as const;
export type FrequencyCode = (typeof FREQUENCIES)[number]['code'];

export const DIET_CODES = ['normal', 'soft', 'liquid', 'diabetic', 'renal', 'low_salt', 'NBM'] as const;
export type DietCode = (typeof DIET_CODES)[number];

export const WARD_TYPES = ['general', 'semi_private', 'private', 'icu', 'nicu', 'hdu', 'daycare'] as const;
export type WardType = (typeof WARD_TYPES)[number];

export const DISCHARGE_TYPES = ['normal', 'lama', 'dama', 'referred', 'death', 'absconded'] as const;
export type DischargeType = (typeof DISCHARGE_TYPES)[number];

export interface Icd10Code {
  code: string;
  display: string;
}

/** A short WHO ICD-10 sample for pickers. Not a full catalogue. */
export const ICD10_SAMPLE: readonly Icd10Code[] = [
  { code: 'A09', display: 'Infectious gastroenteritis and colitis' },
  { code: 'A90', display: 'Dengue fever' },
  { code: 'B01', display: 'Varicella' },
  { code: 'B05', display: 'Measles' },
  { code: 'B16', display: 'Acute hepatitis B' },
  { code: 'B20', display: 'HIV disease' },
  { code: 'B50', display: 'Plasmodium falciparum malaria' },
  { code: 'B54', display: 'Unspecified malaria' },
  { code: 'E03.9', display: 'Hypothyroidism, unspecified' },
  { code: 'E10', display: 'Type 1 diabetes mellitus' },
  { code: 'E11', display: 'Type 2 diabetes mellitus' },
  { code: 'E66', display: 'Obesity' },
  { code: 'E78', display: 'Disorders of lipoprotein metabolism' },
  { code: 'E86', display: 'Volume depletion' },
  { code: 'F32', display: 'Depressive episode' },
  { code: 'G40', display: 'Epilepsy' },
  { code: 'G43', display: 'Migraine' },
  { code: 'H10', display: 'Conjunctivitis' },
  { code: 'H66', display: 'Suppurative and unspecified otitis media' },
  { code: 'I10', display: 'Essential hypertension' },
  { code: 'I21', display: 'Acute myocardial infarction' },
  { code: 'I25', display: 'Chronic ischaemic heart disease' },
  { code: 'I48', display: 'Atrial fibrillation and flutter' },
  { code: 'I50', display: 'Heart failure' },
  { code: 'I63', display: 'Cerebral infarction' },
  { code: 'I64', display: 'Stroke, not specified as haemorrhage or infarction' },
  { code: 'J00', display: 'Acute nasopharyngitis' },
  { code: 'J06.9', display: 'Acute upper respiratory infection, unspecified' },
  { code: 'J18.9', display: 'Pneumonia, unspecified' },
  { code: 'J44', display: 'Chronic obstructive pulmonary disease' },
  { code: 'J45', display: 'Asthma' },
  { code: 'K21', display: 'Gastro-oesophageal reflux disease' },
  { code: 'K29', display: 'Gastritis and duodenitis' },
  { code: 'K35', display: 'Acute appendicitis' },
  { code: 'K59.0', display: 'Constipation' },
  { code: 'K80', display: 'Cholelithiasis' },
  { code: 'K92.2', display: 'Gastrointestinal haemorrhage, unspecified' },
  { code: 'L03', display: 'Cellulitis' },
  { code: 'L30.9', display: 'Dermatitis, unspecified' },
  { code: 'M06.9', display: 'Rheumatoid arthritis, unspecified' },
  { code: 'M54.5', display: 'Low back pain' },
  { code: 'N18', display: 'Chronic kidney disease' },
  { code: 'N39.0', display: 'Urinary tract infection' },
  { code: 'N92', display: 'Excessive, frequent and irregular menstruation' },
  { code: 'O80', display: 'Single spontaneous delivery' },
  { code: 'O82', display: 'Single delivery by caesarean section' },
  { code: 'P07', display: 'Disorders related to short gestation and low birth weight' },
  { code: 'R05', display: 'Cough' },
  { code: 'R07.4', display: 'Chest pain, unspecified' },
  { code: 'R10', display: 'Abdominal and pelvic pain' },
  { code: 'R50.9', display: 'Fever, unspecified' },
  { code: 'R51', display: 'Headache' },
  { code: 'S06', display: 'Intracranial injury' },
  { code: 'S52', display: 'Fracture of forearm' },
  { code: 'S72', display: 'Fracture of femur' },
  { code: 'T14', display: 'Injury of unspecified body region' },
  { code: 'T78.4', display: 'Allergy, unspecified' },
  { code: 'Z34', display: 'Supervision of normal pregnancy' },
  { code: 'Z38', display: 'Liveborn infants according to place of birth' },
  { code: 'Z51.1', display: 'Chemotherapy session for neoplasm' },
] as const;

export interface DrugGeneric {
  code: string;
  name: string;
}

/** Generic names for prescriptions. Pharmacy maps a generic to its item master when it dispenses. */
export const DRUG_GENERICS_SAMPLE: readonly DrugGeneric[] = [
  { code: 'PARACETAMOL', name: 'Paracetamol' },
  { code: 'IBUPROFEN', name: 'Ibuprofen' },
  { code: 'DICLOFENAC', name: 'Diclofenac' },
  { code: 'ASPIRIN', name: 'Aspirin' },
  { code: 'AMOXICILLIN', name: 'Amoxicillin' },
  { code: 'AMOXICILLIN_CLAV', name: 'Amoxicillin with clavulanate' },
  { code: 'AZITHROMYCIN', name: 'Azithromycin' },
  { code: 'CEFIXIME', name: 'Cefixime' },
  { code: 'CEFTRIAXONE', name: 'Ceftriaxone' },
  { code: 'CEFUROXIME', name: 'Cefuroxime' },
  { code: 'CIPROFLOXACIN', name: 'Ciprofloxacin' },
  { code: 'LEVOFLOXACIN', name: 'Levofloxacin' },
  { code: 'METRONIDAZOLE', name: 'Metronidazole' },
  { code: 'DOXYCYCLINE', name: 'Doxycycline' },
  { code: 'COTRIMOXAZOLE', name: 'Co-trimoxazole' },
  { code: 'NITROFURANTOIN', name: 'Nitrofurantoin' },
  { code: 'GENTAMICIN', name: 'Gentamicin' },
  { code: 'PIPERACILLIN_TAZ', name: 'Piperacillin with tazobactam' },
  { code: 'MEROPENEM', name: 'Meropenem' },
  { code: 'CLINDAMYCIN', name: 'Clindamycin' },
  { code: 'PANTOPRAZOLE', name: 'Pantoprazole' },
  { code: 'OMEPRAZOLE', name: 'Omeprazole' },
  { code: 'ONDANSETRON', name: 'Ondansetron' },
  { code: 'DOMPERIDONE', name: 'Domperidone' },
  { code: 'METOCLOPRAMIDE', name: 'Metoclopramide' },
  { code: 'HYOSCINE', name: 'Hyoscine' },
  { code: 'ORS', name: 'Oral rehydration salts' },
  { code: 'LACTULOSE', name: 'Lactulose' },
  { code: 'BISACODYL', name: 'Bisacodyl' },
  { code: 'DICYCLOMINE', name: 'Dicyclomine' },
  { code: 'CETIRIZINE', name: 'Cetirizine' },
  { code: 'LEVOCETIRIZINE', name: 'Levocetirizine' },
  { code: 'CHLORPHENIRAMINE', name: 'Chlorpheniramine' },
  { code: 'MONTELUKAST', name: 'Montelukast' },
  { code: 'SALBUTAMOL', name: 'Salbutamol' },
  { code: 'BUDESONIDE', name: 'Budesonide' },
  { code: 'AMBROXOL', name: 'Ambroxol' },
  { code: 'PREDNISOLONE', name: 'Prednisolone' },
  { code: 'HYDROCORTISONE', name: 'Hydrocortisone' },
  { code: 'DEXAMETHASONE', name: 'Dexamethasone' },
  { code: 'AMLODIPINE', name: 'Amlodipine' },
  { code: 'TELMISARTAN', name: 'Telmisartan' },
  { code: 'LOSARTAN', name: 'Losartan' },
  { code: 'ENALAPRIL', name: 'Enalapril' },
  { code: 'ATENOLOL', name: 'Atenolol' },
  { code: 'METOPROLOL', name: 'Metoprolol' },
  { code: 'FUROSEMIDE', name: 'Furosemide' },
  { code: 'HYDROCHLOROTHIAZIDE', name: 'Hydrochlorothiazide' },
  { code: 'ATORVASTATIN', name: 'Atorvastatin' },
  { code: 'ROSUVASTATIN', name: 'Rosuvastatin' },
  { code: 'CLOPIDOGREL', name: 'Clopidogrel' },
  { code: 'METFORMIN', name: 'Metformin' },
  { code: 'GLIMEPIRIDE', name: 'Glimepiride' },
  { code: 'GLIBENCLAMIDE', name: 'Glibenclamide' },
  { code: 'INSULIN_REGULAR', name: 'Insulin regular' },
  { code: 'INSULIN_GLARGINE', name: 'Insulin glargine' },
  { code: 'THYROXINE', name: 'Levothyroxine' },
  { code: 'TRAMADOL', name: 'Tramadol' },
  { code: 'MORPHINE', name: 'Morphine' },
  { code: 'FENTANYL', name: 'Fentanyl' },
  { code: 'DIAZEPAM', name: 'Diazepam' },
  { code: 'LORAZEPAM', name: 'Lorazepam' },
  { code: 'MIDAZOLAM', name: 'Midazolam' },
  { code: 'PHENYTOIN', name: 'Phenytoin' },
  { code: 'VALPROATE', name: 'Sodium valproate' },
  { code: 'LEVETIRACETAM', name: 'Levetiracetam' },
  { code: 'CARBAMAZEPINE', name: 'Carbamazepine' },
  { code: 'AMITRIPTYLINE', name: 'Amitriptyline' },
  { code: 'SERTRALINE', name: 'Sertraline' },
  { code: 'FLUOXETINE', name: 'Fluoxetine' },
  { code: 'FERROUS_SULFATE', name: 'Ferrous sulfate' },
  { code: 'FOLIC_ACID', name: 'Folic acid' },
  { code: 'CALCIUM_CARBONATE', name: 'Calcium carbonate' },
  { code: 'VITAMIN_D3', name: 'Vitamin D3' },
  { code: 'VITAMIN_B_COMPLEX', name: 'Vitamin B complex' },
  { code: 'ZINC_SULFATE', name: 'Zinc sulfate' },
  { code: 'ALBENDAZOLE', name: 'Albendazole' },
  { code: 'ARTESUNATE', name: 'Artesunate' },
  { code: 'OXYTOCIN', name: 'Oxytocin' },
  { code: 'MAGNESIUM_SULFATE', name: 'Magnesium sulfate' },
  { code: 'TRANEXAMIC_ACID', name: 'Tranexamic acid' },
  { code: 'ADRENALINE', name: 'Adrenaline' },
  { code: 'ATROPINE', name: 'Atropine' },
  { code: 'HEPARIN', name: 'Heparin' },
  { code: 'ENOXAPARIN', name: 'Enoxaparin' },
  { code: 'LIGNOCAINE', name: 'Lignocaine' },
  { code: 'FLUCANAZOLE', name: 'Fluconazole' },
  { code: 'CLOTRIMAZOLE', name: 'Clotrimazole' },
  { code: 'ACYCLOVIR', name: 'Acyclovir' },
] as const;

export interface ClinicalCodesDto {
  bloodGroups: readonly string[];
  idTypes: readonly string[];
  genders: readonly string[];
  relations: readonly string[];
  visitTypes: readonly string[];
  routes: readonly string[];
  doseForms: readonly string[];
  bedStatuses: readonly string[];
  specimens: readonly string[];
  paymentModes: readonly string[];
  payerTypes: readonly string[];
  frequencies: readonly { code: string; label: string; timesPerDay: number }[];
  dietCodes: readonly string[];
  wardTypes: readonly string[];
  dischargeTypes: readonly string[];
  icd10: readonly Icd10Code[];
  drugGenerics: readonly DrugGeneric[];
}

export function clinicalCodesDto(): ClinicalCodesDto {
  return {
    bloodGroups: BLOOD_GROUPS,
    idTypes: ID_TYPES,
    genders: GENDERS,
    relations: RELATIONS,
    visitTypes: VISIT_TYPES,
    routes: ROUTES,
    doseForms: DOSE_FORMS,
    bedStatuses: BED_STATUSES,
    specimens: SPECIMENS,
    paymentModes: PAYMENT_MODES,
    payerTypes: PAYER_TYPES,
    frequencies: FREQUENCIES,
    dietCodes: DIET_CODES,
    wardTypes: WARD_TYPES,
    dischargeTypes: DISCHARGE_TYPES,
    icd10: ICD10_SAMPLE,
    drugGenerics: DRUG_GENERICS_SAMPLE,
  };
}
