import AsyncStorage from 'expo-sqlite/kv-store';
import { Medication } from '../types';
import { DEFAULT_PATIENT_ID } from './patientStorage';

const MEDICATIONS_KEY = '@medications';
const NOTIFICATION_IDS_KEY = '@notification_ids';

const normalizeMedication = (medication: Medication): Medication => ({
  ...medication,
  patientId: medication.patientId || DEFAULT_PATIENT_ID,
});

export const saveMedications = async (medications: Medication[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      MEDICATIONS_KEY,
      JSON.stringify(medications.map(normalizeMedication))
    );
  } catch (error) {
    console.error('Error saving medications:', error);
    throw error;
  }
};

export const loadMedications = async (): Promise<Medication[]> => {
  try {
    const data = await AsyncStorage.getItem(MEDICATIONS_KEY);
    return data ? (JSON.parse(data) as Medication[]).map(normalizeMedication) : [];
  } catch (error) {
    console.error('Error loading medications:', error);
    return [];
  }
};

export const loadMedicationsByPatient = async (patientId: string): Promise<Medication[]> => {
  const medications = await loadMedications();
  return medications.filter((medication) => medication.patientId === patientId);
};

export const addMedication = async (medication: Medication): Promise<void> => {
  try {
    const medications = await loadMedications();
    medications.push({
      ...normalizeMedication(medication),
      createdAt: medication.createdAt ?? new Date().toISOString(),
      prescriptionDate: medication.prescriptionDate ?? new Date().toISOString().split('T')[0],
    });
    await saveMedications(medications);
  } catch (error) {
    console.error('Error adding medication:', error);
    throw error;
  }
};

export const updateMedication = async (id: string, updatedMedication: Partial<Medication>): Promise<void> => {
  try {
    const medications = await loadMedications();
    const index = medications.findIndex(med => med.id === id);

    if (index !== -1) {
      medications[index] = normalizeMedication({ ...medications[index], ...updatedMedication });
      await saveMedications(medications);
    }
  } catch (error) {
    console.error('Error updating medication:', error);
    throw error;
  }
};

export const deleteMedication = async (id: string): Promise<void> => {
  try {
    const medications = await loadMedications();
    const filtered = medications.filter(med => med.id !== id);
    await saveMedications(filtered);
  } catch (error) {
    console.error('Error deleting medication:', error);
    throw error;
  }
};

export const getMedication = async (id: string): Promise<Medication | null> => {
  try {
    const medications = await loadMedications();
    return medications.find(med => med.id === id) || null;
  } catch (error) {
    console.error('Error getting medication:', error);
    return null;
  }
};

// Notification ID management
export const saveNotificationIds = async (
  medicationId: string,
  notificationIds: string[]
): Promise<void> => {
  try {
    const allIds = await getNotificationIds();
    allIds[medicationId] = notificationIds;
    await AsyncStorage.setItem(NOTIFICATION_IDS_KEY, JSON.stringify(allIds));
  } catch (error) {
    console.error('Error saving notification IDs:', error);
  }
};

export const getNotificationIds = async (): Promise<Record<string, string[]>> => {
  try {
    const data = await AsyncStorage.getItem(NOTIFICATION_IDS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error loading notification IDs:', error);
    return {};
  }
};

export const deleteNotificationIds = async (medicationId: string): Promise<void> => {
  try {
    const allIds = await getNotificationIds();
    delete allIds[medicationId];
    await AsyncStorage.setItem(NOTIFICATION_IDS_KEY, JSON.stringify(allIds));
  } catch (error) {
    console.error('Error deleting notification IDs:', error);
  }
};

// Clear all data (for testing/debugging)
export const clearAllData = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(MEDICATIONS_KEY);
    await AsyncStorage.removeItem(NOTIFICATION_IDS_KEY);
  } catch (error) {
    console.error('Error clearing data:', error);
  }
};

// Decrement quantity by 1 when a dose is taken. Returns the new quantity (or undefined if not tracked).
export const decrementMedicationQuantity = async (id: string): Promise<number | undefined> => {
  try {
    const medications = await loadMedications();
    const index = medications.findIndex(med => med.id === id);
    if (index === -1) return undefined;
    const med = medications[index];
    if (med.quantity === undefined) return undefined;
    const newQuantity = Math.max(0, med.quantity - 1);
    medications[index] = { ...med, quantity: newQuantity };
    await saveMedications(medications);
    return newQuantity;
  } catch (error) {
    console.error('Error decrementing medication quantity:', error);
    return undefined;
  }
};

// Increment quantity by 1 when a dose is undone.
export const incrementMedicationQuantity = async (id: string): Promise<number | undefined> => {
  try {
    const medications = await loadMedications();
    const index = medications.findIndex(med => med.id === id);
    if (index === -1) return undefined;
    const med = medications[index];
    if (med.quantity === undefined) return undefined;
    const newQuantity = med.quantity + 1;
    medications[index] = { ...med, quantity: newQuantity };
    await saveMedications(medications);
    return newQuantity;
  } catch (error) {
    console.error('Error incrementing medication quantity:', error);
    return undefined;
  }
};
