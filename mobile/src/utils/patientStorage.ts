import AsyncStorage from 'expo-sqlite/kv-store';

import { PatientProfile } from '../types';

const PATIENTS_KEY = '@patients';
const ACTIVE_PATIENT_ID_KEY = '@active_patient_id';
export const DEFAULT_PATIENT_ID = 'self-profile';

const createDefaultPatient = (): PatientProfile => ({
  id: DEFAULT_PATIENT_ID,
  name: 'My Prescriptions',
  relationship: 'Self',
  notes: 'Default profile for personal medication tracking.',
  createdAt: new Date().toISOString(),
});

export const loadPatients = async (): Promise<PatientProfile[]> => {
  try {
    const raw = await AsyncStorage.getItem(PATIENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as PatientProfile[]) : [];
    const patients = parsed.length > 0 ? parsed : [createDefaultPatient()];

    if (!patients.some((patient) => patient.id === DEFAULT_PATIENT_ID)) {
      patients.unshift(createDefaultPatient());
    }

    await AsyncStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
    return patients;
  } catch (error) {
    console.error('Error loading patients:', error);
    return [createDefaultPatient()];
  }
};

export const savePatients = async (patients: PatientProfile[]): Promise<void> => {
  await AsyncStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
};

export const getActivePatientId = async (): Promise<string> => {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_PATIENT_ID_KEY);
    return stored || DEFAULT_PATIENT_ID;
  } catch (error) {
    console.error('Error loading active patient:', error);
    return DEFAULT_PATIENT_ID;
  }
};

export const setActivePatientId = async (patientId: string): Promise<void> => {
  await AsyncStorage.setItem(ACTIVE_PATIENT_ID_KEY, patientId);
};

export const getActivePatient = async (): Promise<PatientProfile> => {
  const [patients, activePatientId] = await Promise.all([loadPatients(), getActivePatientId()]);
  const activePatient =
    patients.find((patient) => patient.id === activePatientId) ||
    patients.find((patient) => patient.id === DEFAULT_PATIENT_ID) ||
    patients[0];

  if (activePatient) {
    await setActivePatientId(activePatient.id);
    return activePatient;
  }

  const fallback = createDefaultPatient();
  await savePatients([fallback]);
  await setActivePatientId(fallback.id);
  return fallback;
};

export const upsertPatient = async (patient: PatientProfile): Promise<void> => {
  const patients = await loadPatients();
  const index = patients.findIndex((item) => item.id === patient.id);

  if (index >= 0) {
    patients[index] = patient;
  } else {
    patients.push(patient);
  }

  await savePatients(patients);
};

export const deletePatient = async (patientId: string): Promise<void> => {
  if (patientId === DEFAULT_PATIENT_ID) {
    return;
  }

  const patients = await loadPatients();
  const filtered = patients.filter((patient) => patient.id !== patientId);
  await savePatients(filtered);

  const activePatientId = await getActivePatientId();
  if (activePatientId === patientId) {
    await setActivePatientId(DEFAULT_PATIENT_ID);
  }
};
