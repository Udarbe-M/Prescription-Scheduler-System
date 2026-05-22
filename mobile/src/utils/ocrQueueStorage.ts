import AsyncStorage from 'expo-sqlite/kv-store';

import { PendingOCRScan } from '../types';

const OCR_QUEUE_KEY = '@ocr_queue';

export const loadPendingScans = async (): Promise<PendingOCRScan[]> => {
  try {
    const data = await AsyncStorage.getItem(OCR_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading OCR queue:', error);
    return [];
  }
};

export const savePendingScans = async (items: PendingOCRScan[]): Promise<void> => {
  await AsyncStorage.setItem(OCR_QUEUE_KEY, JSON.stringify(items));
};

export const enqueuePendingScan = async (
  imageUri: string,
  errorMessage?: string
): Promise<PendingOCRScan> => {
  const current = await loadPendingScans();
  const item: PendingOCRScan = {
    id: `${Date.now()}`,
    imageUri,
    createdAt: new Date().toISOString(),
    status: 'queued',
    errorMessage,
  };
  current.unshift(item);
  await savePendingScans(current);
  return item;
};

export const removePendingScan = async (id: string): Promise<void> => {
  const current = await loadPendingScans();
  await savePendingScans(current.filter((item) => item.id !== id));
};

export const updatePendingScanStatus = async (
  id: string,
  status: PendingOCRScan['status'],
  errorMessage?: string
): Promise<void> => {
  const current = await loadPendingScans();
  const updated = current.map((item) =>
    item.id === id ? { ...item, status, errorMessage } : item
  );
  await savePendingScans(updated);
};
