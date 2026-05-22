import AsyncStorage from 'expo-sqlite/kv-store';

const TAKEN_MEDICATIONS_KEY = '@taken_medications';

export interface TakenMedication {
  medicationId: string;
  time: string;
  date: string; // YYYY-MM-DD format
  takenAt: string; // ISO string
}

export const markAsTaken = async (
  medicationId: string, 
  time: string
): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const takenMeds = await getTakenMedications();
    
    // Remove any existing entry for this medication/time today
    const filteredMeds = takenMeds.filter(
      med => !(med.medicationId === medicationId && 
               med.time === time && 
               med.date === today)
    );
    
    const takenMed: TakenMedication = {
      medicationId,
      time,
      date: today,
      takenAt: new Date().toISOString(),
    };
    
    filteredMeds.push(takenMed);
    await AsyncStorage.setItem(TAKEN_MEDICATIONS_KEY, JSON.stringify(filteredMeds));
  } catch (error) {
    console.error('Error marking medication as taken:', error);
  }
};

export const markAsNotTaken = async (
  medicationId: string,
  time: string
): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const takenMeds = await getTakenMedications();
    
    const filteredMeds = takenMeds.filter(
      med => !(med.medicationId === medicationId && 
               med.time === time && 
               med.date === today)
    );
    
    await AsyncStorage.setItem(TAKEN_MEDICATIONS_KEY, JSON.stringify(filteredMeds));
  } catch (error) {
    console.error('Error marking medication as not taken:', error);
  }
};

export const getTakenMedications = async (): Promise<TakenMedication[]> => {
  try {
    const data = await AsyncStorage.getItem(TAKEN_MEDICATIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading taken medications:', error);
    return [];
  }
};

export const getTakenMedicationsByDate = async (date: string): Promise<TakenMedication[]> => {
  try {
    const takenMeds = await getTakenMedications();
    return takenMeds.filter(med => med.date === date);
  } catch (error) {
    console.error('Error getting taken medications by date:', error);
    return [];
  }
};

export const isTakenToday = async (
  medicationId: string, 
  time: string
): Promise<boolean> => {
  const today = new Date().toISOString().split('T')[0];
  const takenMeds = await getTakenMedications();
  
  return takenMeds.some(
    med => med.medicationId === medicationId && 
           med.time === time && 
           med.date === today
  );
};

export const getTodayTakenMedications = async (): Promise<TakenMedication[]> => {
  const today = new Date().toISOString().split('T')[0];
  const takenMeds = await getTakenMedications();
  
  return takenMeds.filter(med => med.date === today);
};

export const getTakenMedicationsByMedication = async (
  medicationId: string,
  limit: number = 20
): Promise<TakenMedication[]> => {
  try {
    const takenMeds = await getTakenMedications();
    return takenMeds
      .filter((med) => med.medicationId === medicationId)
      .sort((left, right) => right.takenAt.localeCompare(left.takenAt))
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting taken medication history:', error);
    return [];
  }
};

export const clearOldTakenMedications = async (daysToKeep: number = 30): Promise<void> => {
  try {
    const takenMeds = await getTakenMedications();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDateString = cutoffDate.toISOString().split('T')[0];
    
    const filteredMeds = takenMeds.filter(med => med.date >= cutoffDateString);
    
    await AsyncStorage.setItem(TAKEN_MEDICATIONS_KEY, JSON.stringify(filteredMeds));
  } catch (error) {
    console.error('Error clearing old taken medications:', error);
  }
};

export const clearAllTakenMedications = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(TAKEN_MEDICATIONS_KEY);
  } catch (error) {
    console.error('Error clearing all taken medications:', error);
  }
};
