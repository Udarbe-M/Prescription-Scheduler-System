import { Medication } from '../types';

export const getDailyDoseCount = (medication: Medication): number => {
  if (medication.times.length > 0) {
    return medication.times.length;
  }

  switch (medication.frequency) {
    case 'twice':
      return 2;
    case 'thrice':
      return 3;
    case 'weekly':
      return 1 / 7;
    default:
      return 1;
  }
};

export const getDaysRemaining = (medication: Medication): number | null => {
  if (medication.quantity === undefined) {
    return null;
  }

  const dosesPerDay = getDailyDoseCount(medication);
  if (dosesPerDay <= 0) {
    return null;
  }

  return Math.max(0, medication.quantity / dosesPerDay);
};

export const getStockStatus = (medication: Medication): 'ok' | 'low' | 'out' | 'unknown' => {
  if (medication.quantity === undefined) {
    return 'unknown';
  }
  if (medication.quantity <= 0) {
    return 'out';
  }
  if (medication.quantity <= (medication.lowStockThreshold ?? 5)) {
    return 'low';
  }
  return 'ok';
};

export const formatPrescriptionDate = (value?: string): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
