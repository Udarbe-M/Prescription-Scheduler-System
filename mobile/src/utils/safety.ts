import axios from 'axios';

import { InteractionCheckResult, Medication } from '../types';
import { getCurrentAPIUrl } from './ocr';

const serializeMedication = (medication: Medication) => ({
  name: medication.name,
  dosage: medication.dosage,
});

export const checkMedicationInteractions = async (
  medications: Medication[]
): Promise<InteractionCheckResult> => {
  const apiBaseUrl = await getCurrentAPIUrl();

  try {
    const response = await axios.post<InteractionCheckResult>(
      `${apiBaseUrl}/safety/interactions`,
      {
        medications: medications.map(serializeMedication),
        max_alerts: 8,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
      }
    );

    return response.data;
  } catch (error: any) {
    if (error.response) {
      const detail = error.response.data?.detail || 'Unknown safety backend error';
      throw new Error(`Interaction check failed: ${detail}`);
    }

    if (error.request) {
      throw new Error(
        `Cannot reach the safety backend at ${apiBaseUrl}. Check your API URL in Settings.`
      );
    }

    throw error;
  }
};
