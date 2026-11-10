// MOCK demo dataset. Every person, number and identifier in this file is invented for the Hospital OS demo.
// None of it belongs to a real patient or member of staff. Do not replace it with real data: production data
// comes in through the product, never through seeds.
//
// Formats follow what Indian hospital staff expect to read:
// - dates are written DD/MM/YYYY here and converted to ISO (YYYY-MM-DD) for the `date` column,
// - mobiles are Indian numbers in the made-up +91 90000 xxxxx block (stored as 10 digits, like users.mobile),
// - ABHA-style numbers start with `00-`, which no issued ABHA number uses, and every ABHA address ends in
//   `@sbx` (the ABDM sandbox suffix).
// Patients go into the Phase B `patients` table (migration 0100, owned by B0); until it exists they are skipped.

export type Sex = 'male' | 'female' | 'other';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface DemoPatient {
  /** Location code inside the tenant (MUM / IDR / JAI), or PRIMARY for the tenant's primary location. */
  loc: string;
  first: string;
  last: string;
  sex: Sex;
  /** DD/MM/YYYY. */
  dob: string;
  blood: BloodGroup | null;
  area: string;
  /** Registration date, DD/MM/YYYY. */
  registered: string;
  /** Whether the sample record carries an ABHA-style id. */
  abha: boolean;
  emergencyName: string;
  emergencyRelation: string;
}

export interface DemoStaff {
  email: string;
  name: string;
  role: 'tenant_admin' | 'location_admin' | 'front_desk' | 'doctor' | 'nurse' | 'cashier' | 'pharmacist' | 'lab_tech' | 'accounts';
  /** Location code, or null for all locations. */
  loc: string | null;
  designation?: 'owner' | 'manager';
}

// ---------------------------------------------------------------------------------------------------------------------
// Sunrise Care Hospitals (Demo): Mumbai, Indore, Jaipur. The owner and the five Mumbai staff below already exist in the
// base demo seed (seed.ts); this list adds the remaining roles at every location. Existing emails are skipped.
// ---------------------------------------------------------------------------------------------------------------------
export const SUNRISE_STAFF: DemoStaff[] = [
  { email: 'accounts@sunrise.demo', name: 'Prakash Kulkarni', role: 'accounts', loc: null, designation: 'manager' },
  { email: 'pharmacist@sunrise.demo', name: 'Sneha Pawar', role: 'pharmacist', loc: 'MUM' },
  { email: 'labtech@sunrise.demo', name: 'Ganesh Shinde', role: 'lab_tech', loc: 'MUM' },

  { email: 'location.admin.indore@sunrise.demo', name: 'Rajesh Malviya', role: 'location_admin', loc: 'IDR' },
  { email: 'frontdesk.indore@sunrise.demo', name: 'Pooja Chouhan', role: 'front_desk', loc: 'IDR' },
  { email: 'doctor.indore@sunrise.demo', name: 'Dr. Alok Tiwari', role: 'doctor', loc: 'IDR' },
  { email: 'nurse.indore@sunrise.demo', name: 'Sister Rekha Verma', role: 'nurse', loc: 'IDR' },
  { email: 'cashier.indore@sunrise.demo', name: 'Manish Jain', role: 'cashier', loc: 'IDR' },
  { email: 'pharmacist.indore@sunrise.demo', name: 'Nitin Rathore', role: 'pharmacist', loc: 'IDR' },
  { email: 'labtech.indore@sunrise.demo', name: 'Kiran Patidar', role: 'lab_tech', loc: 'IDR' },

  { email: 'location.admin.jaipur@sunrise.demo', name: 'Vivek Shekhawat', role: 'location_admin', loc: 'JAI' },
  { email: 'frontdesk.jaipur@sunrise.demo', name: 'Neha Agarwal', role: 'front_desk', loc: 'JAI' },
  { email: 'doctor.jaipur@sunrise.demo', name: 'Dr. Sunita Meena', role: 'doctor', loc: 'JAI' },
  { email: 'nurse.jaipur@sunrise.demo', name: 'Sister Mamta Choudhary', role: 'nurse', loc: 'JAI' },
  { email: 'cashier.jaipur@sunrise.demo', name: 'Rahul Khandelwal', role: 'cashier', loc: 'JAI' },
  { email: 'pharmacist.jaipur@sunrise.demo', name: 'Deepak Saini', role: 'pharmacist', loc: 'JAI' },
  { email: 'labtech.jaipur@sunrise.demo', name: 'Anjali Rathore', role: 'lab_tech', loc: 'JAI' },
];

/** Sample doctor masters per location (the base seed already adds three generic ones everywhere). */
export const SUNRISE_DOCTORS: { loc: string; name: string; qualification: string; speciality: string }[] = [
  { loc: 'MUM', name: 'Dr. Sameer Deshpande', qualification: 'MBBS, MD (Paediatrics)', speciality: 'Paediatrics' },
  { loc: 'MUM', name: 'Dr. Farah Shaikh', qualification: 'MBBS, MS (Ortho)', speciality: 'Orthopaedics' },
  { loc: 'IDR', name: 'Dr. Alok Tiwari', qualification: 'MBBS, MD', speciality: 'General Medicine' },
  { loc: 'IDR', name: 'Dr. Swati Dubey', qualification: 'MBBS, DGO', speciality: 'Obstetrics & Gynaecology' },
  { loc: 'JAI', name: 'Dr. Sunita Meena', qualification: 'MBBS, MD', speciality: 'General Medicine' },
  { loc: 'JAI', name: 'Dr. Harish Bhati', qualification: 'MBBS, MS', speciality: 'General Surgery' },
];

export const SUNRISE_PATIENTS: DemoPatient[] = [
  // Mumbai (14)
  { loc: 'MUM', first: 'Aarav', last: 'Patil', sex: 'male', dob: '14/03/1988', blood: 'B+', area: 'Dadar West', registered: '02/04/2026', abha: true, emergencyName: 'Snehal Patil', emergencyRelation: 'Spouse' },
  { loc: 'MUM', first: 'Priya', last: 'Deshmukh', sex: 'female', dob: '27/11/1992', blood: 'O+', area: 'Parel', registered: '05/04/2026', abha: true, emergencyName: 'Sunil Deshmukh', emergencyRelation: 'Father' },
  { loc: 'MUM', first: 'Rohit', last: 'Naik', sex: 'male', dob: '03/07/1975', blood: 'A+', area: 'Andheri East', registered: '11/04/2026', abha: false, emergencyName: 'Kavita Naik', emergencyRelation: 'Spouse' },
  { loc: 'MUM', first: 'Fatima', last: 'Ansari', sex: 'female', dob: '19/01/1968', blood: 'B-', area: 'Mahim', registered: '18/04/2026', abha: true, emergencyName: 'Imran Ansari', emergencyRelation: 'Son' },
  { loc: 'MUM', first: 'Kunal', last: 'Mehta', sex: 'male', dob: '08/09/2001', blood: 'O-', area: 'Ghatkopar', registered: '26/04/2026', abha: true, emergencyName: 'Hina Mehta', emergencyRelation: 'Mother' },
  { loc: 'MUM', first: 'Shalini', last: 'Gawde', sex: 'female', dob: '22/05/1984', blood: 'AB+', area: 'Lalbaug', registered: '03/05/2026', abha: false, emergencyName: 'Prasad Gawde', emergencyRelation: 'Spouse' },
  { loc: 'MUM', first: 'Joseph', last: 'Fernandes', sex: 'male', dob: '30/12/1959', blood: 'A-', area: 'Bandra West', registered: '14/05/2026', abha: true, emergencyName: 'Maria Fernandes', emergencyRelation: 'Spouse' },
  { loc: 'MUM', first: 'Ananya', last: 'Iyer', sex: 'female', dob: '11/02/2016', blood: 'O+', area: 'Matunga', registered: '29/05/2026', abha: false, emergencyName: 'Ramesh Iyer', emergencyRelation: 'Father' },
  { loc: 'MUM', first: 'Sanjay', last: 'Kadam', sex: 'male', dob: '05/06/1979', blood: 'B+', area: 'Worli', registered: '08/06/2026', abha: true, emergencyName: 'Vaishali Kadam', emergencyRelation: 'Spouse' },
  { loc: 'MUM', first: 'Heena', last: 'Shah', sex: 'female', dob: '17/08/1990', blood: 'A+', area: 'Borivali West', registered: '21/06/2026', abha: true, emergencyName: 'Jignesh Shah', emergencyRelation: 'Spouse' },
  { loc: 'MUM', first: 'Mahesh', last: 'Sawant', sex: 'male', dob: '25/10/1951', blood: null, area: 'Chembur', registered: '04/07/2026', abha: false, emergencyName: 'Nilesh Sawant', emergencyRelation: 'Son' },
  { loc: 'MUM', first: 'Tanvi', last: 'Joshi', sex: 'female', dob: '09/04/1998', blood: 'O+', area: 'Thane West', registered: '19/07/2026', abha: true, emergencyName: 'Medha Joshi', emergencyRelation: 'Mother' },
  { loc: 'MUM', first: 'Arjun', last: 'Pillai', sex: 'male', dob: '13/12/2019', blood: 'B+', area: 'Vashi', registered: '02/08/2026', abha: false, emergencyName: 'Lakshmi Pillai', emergencyRelation: 'Mother' },
  { loc: 'MUM', first: 'Zoya', last: 'Khan', sex: 'female', dob: '01/01/1987', blood: 'AB-', area: 'Kurla West', registered: '16/08/2026', abha: true, emergencyName: 'Salim Khan', emergencyRelation: 'Brother' },

  // Indore (13)
  { loc: 'IDR', first: 'Vikas', last: 'Sharma', sex: 'male', dob: '20/02/1982', blood: 'B+', area: 'Vijay Nagar', registered: '07/04/2026', abha: true, emergencyName: 'Ritu Sharma', emergencyRelation: 'Spouse' },
  { loc: 'IDR', first: 'Kavya', last: 'Joshi', sex: 'female', dob: '15/06/1995', blood: 'A+', area: 'Palasia', registered: '12/04/2026', abha: true, emergencyName: 'Anil Joshi', emergencyRelation: 'Father' },
  { loc: 'IDR', first: 'Ramesh', last: 'Yadav', sex: 'male', dob: '04/11/1963', blood: 'O+', area: 'Rau', registered: '24/04/2026', abha: false, emergencyName: 'Suresh Yadav', emergencyRelation: 'Brother' },
  { loc: 'IDR', first: 'Sakshi', last: 'Agrawal', sex: 'female', dob: '28/03/2003', blood: 'B-', area: 'Sapna Sangeeta Road', registered: '06/05/2026', abha: true, emergencyName: 'Pankaj Agrawal', emergencyRelation: 'Father' },
  { loc: 'IDR', first: 'Imran', last: 'Qureshi', sex: 'male', dob: '10/08/1977', blood: 'A-', area: 'Khajrana', registered: '17/05/2026', abha: false, emergencyName: 'Nazia Qureshi', emergencyRelation: 'Spouse' },
  { loc: 'IDR', first: 'Meenakshi', last: 'Patel', sex: 'female', dob: '31/07/1970', blood: 'O+', area: 'Bhawarkua', registered: '30/05/2026', abha: true, emergencyName: 'Hemant Patel', emergencyRelation: 'Spouse' },
  { loc: 'IDR', first: 'Ayush', last: 'Solanki', sex: 'male', dob: '12/12/2010', blood: 'AB+', area: 'Bengali Square', registered: '09/06/2026', abha: false, emergencyName: 'Rakhi Solanki', emergencyRelation: 'Mother' },
  { loc: 'IDR', first: 'Geeta', last: 'Raghuvanshi', sex: 'female', dob: '06/05/1956', blood: 'B+', area: 'Annapurna', registered: '23/06/2026', abha: true, emergencyName: 'Ajay Raghuvanshi', emergencyRelation: 'Son' },
  { loc: 'IDR', first: 'Harsh', last: 'Gupta', sex: 'male', dob: '23/09/1999', blood: 'O-', area: 'MR 10', registered: '07/07/2026', abha: true, emergencyName: 'Sunita Gupta', emergencyRelation: 'Mother' },
  { loc: 'IDR', first: 'Shabnam', last: 'Bano', sex: 'female', dob: '18/10/1985', blood: null, area: 'Chandan Nagar', registered: '22/07/2026', abha: false, emergencyName: 'Aslam Khan', emergencyRelation: 'Spouse' },
  { loc: 'IDR', first: 'Devendra', last: 'Chouhan', sex: 'male', dob: '02/01/1948', blood: 'A+', area: 'Mhow Naka', registered: '05/08/2026', abha: true, emergencyName: 'Sanjay Chouhan', emergencyRelation: 'Son' },
  { loc: 'IDR', first: 'Ishita', last: 'Kothari', sex: 'female', dob: '26/04/2021', blood: 'B+', area: 'Scheme 54', registered: '20/08/2026', abha: false, emergencyName: 'Rohan Kothari', emergencyRelation: 'Father' },
  { loc: 'IDR', first: 'Sameer', last: 'Pathak', sex: 'other', dob: '16/02/1993', blood: 'O+', area: 'Nipania', registered: '03/09/2026', abha: true, emergencyName: 'Nisha Pathak', emergencyRelation: 'Sister' },

  // Jaipur (13)
  { loc: 'JAI', first: 'Mahendra', last: 'Singh', sex: 'male', dob: '07/03/1966', blood: 'B+', area: 'Malviya Nagar', registered: '09/04/2026', abha: true, emergencyName: 'Kamla Kanwar', emergencyRelation: 'Spouse' },
  { loc: 'JAI', first: 'Pooja', last: 'Sharma', sex: 'female', dob: '21/09/1991', blood: 'A+', area: 'Mansarovar', registered: '15/04/2026', abha: true, emergencyName: 'Gaurav Sharma', emergencyRelation: 'Spouse' },
  { loc: 'JAI', first: 'Lokesh', last: 'Meena', sex: 'male', dob: '11/11/1986', blood: 'O+', area: 'Sanganer', registered: '28/04/2026', abha: false, emergencyName: 'Ramkishan Meena', emergencyRelation: 'Father' },
  { loc: 'JAI', first: 'Divya', last: 'Rathore', sex: 'female', dob: '03/12/2000', blood: 'AB+', area: 'Vaishali Nagar', registered: '10/05/2026', abha: true, emergencyName: 'Bhupendra Rathore', emergencyRelation: 'Father' },
  { loc: 'JAI', first: 'Shyam Sundar', last: 'Gupta', sex: 'male', dob: '29/06/1954', blood: 'B-', area: 'Raja Park', registered: '20/05/2026', abha: true, emergencyName: 'Anita Gupta', emergencyRelation: 'Daughter' },
  { loc: 'JAI', first: 'Rukhsar', last: 'Pathan', sex: 'female', dob: '14/08/1989', blood: 'O+', area: 'Ramganj', registered: '02/06/2026', abha: false, emergencyName: 'Javed Pathan', emergencyRelation: 'Spouse' },
  { loc: 'JAI', first: 'Kartik', last: 'Saini', sex: 'male', dob: '19/01/2014', blood: 'A-', area: 'Jhotwara', registered: '13/06/2026', abha: false, emergencyName: 'Manju Saini', emergencyRelation: 'Mother' },
  { loc: 'JAI', first: 'Bhavna', last: 'Khandelwal', sex: 'female', dob: '08/05/1973', blood: 'B+', area: 'C-Scheme', registered: '27/06/2026', abha: true, emergencyName: 'Naresh Khandelwal', emergencyRelation: 'Spouse' },
  { loc: 'JAI', first: 'Gopal', last: 'Choudhary', sex: 'male', dob: '24/10/1958', blood: null, area: 'Bani Park', registered: '11/07/2026', abha: true, emergencyName: 'Suman Choudhary', emergencyRelation: 'Spouse' },
  { loc: 'JAI', first: 'Nikita', last: 'Jain', sex: 'female', dob: '05/02/1997', blood: 'O-', area: 'Tonk Road', registered: '25/07/2026', abha: true, emergencyName: 'Sudhir Jain', emergencyRelation: 'Father' },
  { loc: 'JAI', first: 'Vikram', last: 'Shekhawat', sex: 'male', dob: '17/07/1981', blood: 'AB-', area: 'Civil Lines', registered: '08/08/2026', abha: false, emergencyName: 'Preeti Shekhawat', emergencyRelation: 'Spouse' },
  { loc: 'JAI', first: 'Aditi', last: 'Bhargava', sex: 'female', dob: '30/03/2018', blood: 'A+', area: 'Jawahar Nagar', registered: '22/08/2026', abha: false, emergencyName: 'Amit Bhargava', emergencyRelation: 'Father' },
  { loc: 'JAI', first: 'Om Prakash', last: 'Kumawat', sex: 'male', dob: '12/09/1945', blood: 'B+', area: 'Amer Road', registered: '06/09/2026', abha: true, emergencyName: 'Ravi Kumawat', emergencyRelation: 'Son' },
];

// ---------------------------------------------------------------------------------------------------------------------
// Lotus (second demo tenant). The tenant itself is created by the Phase B B0 seed (docs/PHASE_B_PLAN.md, decision 10);
// these five patients are added to its primary location once it exists. `loc: 'PRIMARY'` = that tenant's primary site.
// ---------------------------------------------------------------------------------------------------------------------
export const LOTUS_PATIENTS: DemoPatient[] = [
  { loc: 'PRIMARY', first: 'Siddharth', last: 'Gokhale', sex: 'male', dob: '09/10/1980', blood: 'O+', area: 'Kothrud', registered: '10/06/2026', abha: true, emergencyName: 'Manasi Gokhale', emergencyRelation: 'Spouse' },
  { loc: 'PRIMARY', first: 'Rutuja', last: 'Bhosale', sex: 'female', dob: '02/02/1994', blood: 'B+', area: 'Hadapsar', registered: '18/06/2026', abha: false, emergencyName: 'Amol Bhosale', emergencyRelation: 'Spouse' },
  { loc: 'PRIMARY', first: 'Vinayak', last: 'Kulkarni', sex: 'male', dob: '15/05/1962', blood: 'A+', area: 'Shivajinagar', registered: '01/07/2026', abha: true, emergencyName: 'Shubhada Kulkarni', emergencyRelation: 'Spouse' },
  { loc: 'PRIMARY', first: 'Aishwarya', last: 'Pawar', sex: 'female', dob: '27/12/2005', blood: 'AB+', area: 'Aundh', registered: '15/07/2026', abha: false, emergencyName: 'Sachin Pawar', emergencyRelation: 'Father' },
  { loc: 'PRIMARY', first: 'Nilesh', last: 'Thorat', sex: 'male', dob: '06/08/1976', blood: 'O-', area: 'Baner', registered: '29/07/2026', abha: true, emergencyName: 'Varsha Thorat', emergencyRelation: 'Spouse' },
];
