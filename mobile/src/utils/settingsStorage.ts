import Storage from 'expo-sqlite/kv-store';

export type OCRMode = 'auto' | 'printed' | 'handwritten' | 'prescription';

const API_URL_KEY = '@settings_api_url';
const OCR_MODE_KEY = '@settings_ocr_mode';

export const saveApiBaseUrl = async (value: string): Promise<void> => {
  await Storage.setItem(API_URL_KEY, value.trim());
};

export const loadApiBaseUrl = async (): Promise<string | null> => {
  return Storage.getItem(API_URL_KEY);
};

export const saveOcrMode = async (value: OCRMode): Promise<void> => {
  await Storage.setItem(OCR_MODE_KEY, value);
};

export const loadOcrMode = async (): Promise<OCRMode> => {
  const value = await Storage.getItem(OCR_MODE_KEY);
  if (value === 'printed' || value === 'handwritten' || value === 'prescription') {
    return value;
  }
  return 'auto';
};
