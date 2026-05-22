import { Medication } from '../types';
import { TakenMedication } from './scheduleStorage';

const isoDate = (date: Date): string => date.toISOString().split('T')[0];

const shouldScheduleOnDate = (medication: Medication, date: Date): boolean => {
  const day = date.getDay();
  switch (medication.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return new Date(medication.startDate).getDay() === day;
    case 'twice':
      return day % 2 === 0;
    case 'thrice':
      return day % 3 === 0;
    default:
      return true;
  }
};

export const getScheduledDosesForDate = (medications: Medication[], date: Date): number => {
  return medications.reduce((count, medication) => {
    if (!shouldScheduleOnDate(medication, date)) {
      return count;
    }
    return count + Math.max(medication.times.length, 1);
  }, 0);
};

export const getTakenDosesForDate = (taken: TakenMedication[], date: Date): number => {
  const key = isoDate(date);
  return taken.filter((item) => item.date === key).length;
};

export const buildWeeklyAdherence = (medications: Medication[], taken: TakenMedication[]) => {
  const today = new Date();
  const items = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const scheduled = getScheduledDosesForDate(medications, date);
    const completed = Math.min(scheduled, getTakenDosesForDate(taken, date));
    const adherence = scheduled > 0 ? completed / scheduled : 0;

    items.push({
      date: isoDate(date),
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      scheduled,
      completed,
      adherence,
    });
  }

  return items;
};

export const getWeeklySummary = (medications: Medication[], taken: TakenMedication[]) => {
  const weekly = buildWeeklyAdherence(medications, taken);
  const scheduled = weekly.reduce((sum, item) => sum + item.scheduled, 0);
  const completed = weekly.reduce((sum, item) => sum + item.completed, 0);
  const adherenceRate = scheduled > 0 ? completed / scheduled : 0;

  let streak = 0;
  for (let index = weekly.length - 1; index >= 0; index -= 1) {
    if (weekly[index].scheduled > 0 && weekly[index].completed >= weekly[index].scheduled) {
      streak += 1;
    } else {
      break;
    }
  }

  return {
    weekly,
    scheduled,
    completed,
    adherenceRate,
    streak,
  };
};
