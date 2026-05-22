import axios from 'axios';
import Constants from 'expo-constants';

import { loadApiBaseUrl, loadOcrMode, OCRMode } from './settingsStorage';

export interface ExtractedData {
  name?: string;
  dosage?: string;
  frequency?: 'daily' | 'twice' | 'thrice' | 'weekly';
  instructions?: string;
  quantity_hint?: number;
}

interface ParsedPayload {
  medications?: ExtractedData[];
  primary_medication?: ExtractedData | null;
}

interface OCRResponse {
  success: boolean;
  engine: string;
  mode_used: OCRMode;
  text: string;
  normalized_text: string;
  confidence?: number;
  parsed?: ParsedPayload | null;
}

export interface OCRExtractionResult {
  text: string;
  normalizedText: string;
  engine: string;
  confidence?: number;
  fields: ExtractedData;
  medications: ExtractedData[];
}

const buildDefaultApiUrl = (): string => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) {
      return `http://${host}:8000`;
    }
  }
  return 'http://127.0.0.1:8000';
};

const getApiBaseUrl = async (): Promise<string> => {
  const saved = await loadApiBaseUrl();
  return saved && saved.trim().length > 0 ? saved.trim() : buildDefaultApiUrl();
};

export const extractTextFromImage = async (
  imageUri: string
): Promise<OCRExtractionResult> => {
  const apiBaseUrl = await getApiBaseUrl();
  const ocrMode = await loadOcrMode();

  try {
    const base64Image = await uriToBase64(imageUri);
    const response = await axios.post<OCRResponse>(
      `${apiBaseUrl}/ocr/recognize`,
      {
        image_base64: base64Image,
        filename: 'prescription.jpg',
        ocr_mode: ocrMode,
        parse_medication: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const data = response.data;
    if (!data.success) {
      throw new Error('OCR request failed');
    }

    return {
      text: data.text,
      normalizedText: data.normalized_text,
      engine: data.engine,
      confidence: data.confidence,
      fields: data.parsed?.primary_medication || parsePrescriptionText(data.normalized_text),
      medications: data.parsed?.medications || [],
    };
  } catch (error: any) {
    if (error.code === 'ECONNABORTED') {
      throw new Error(
        'The OCR request timed out. The backend may still be loading or downloading models.'
      );
    }

    if (error.response) {
      const detail = error.response.data?.detail || 'Unknown backend error';
      throw new Error(`Backend error (${error.response.status}): ${detail}`);
    }

    if (error.request) {
      throw new Error(
        `Cannot reach the backend at ${apiBaseUrl}. Update the API URL in Settings if your phone and backend are on different hosts.`
      );
    }

    throw error;
  }
};

async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to read image: ${response.statusText}`);
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const payload = String(reader.result || '');
      const base64 = payload.includes(',') ? payload.split(',')[1] : payload;
      resolve(base64.replace(/\s/g, ''));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const parsePrescriptionText = (text: string): ExtractedData => {
  const lowerText = text.toLowerCase();
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const dosageMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(mg|g|ml|mcg|tablet|tab|capsule|cap|pill|unit)/i
  );
  const firstLine = lines[0]?.replace(/^(rx|medication|drug)[:\s-]*/i, '').trim();

  let frequency: ExtractedData['frequency'] = 'daily';
  if (lowerText.includes('three times') || lowerText.includes('thrice') || lowerText.includes('3x')) {
    frequency = 'thrice';
  } else if (lowerText.includes('twice') || lowerText.includes('2x') || lowerText.includes('two times')) {
    frequency = 'twice';
  } else if (lowerText.includes('weekly')) {
    frequency = 'weekly';
  }

  let instructions: string | undefined;
  if (lowerText.includes('with food')) {
    instructions = 'Take with food';
  } else if (lowerText.includes('before meal')) {
    instructions = 'Take before meals';
  } else if (lowerText.includes('bedtime')) {
    instructions = 'Take at bedtime';
  }

  return {
    name: firstLine || undefined,
    dosage: dosageMatch?.[0],
    frequency,
    instructions,
  };
};

export const testAPIConnection = async (): Promise<{
  connected: boolean;
  message: string;
}> => {
  const apiBaseUrl = await getApiBaseUrl();

  try {
    const response = await axios.get(`${apiBaseUrl}/health`, { timeout: 8000 });
    const models = response.data?.models || [];
    const ready = models.filter((model: any) => model.available).length;
    return {
      connected: true,
      message: `Connected to ${apiBaseUrl}. ${ready} OCR engine(s) available.`,
    };
  } catch {
    return {
      connected: false,
      message: `Cannot connect to ${apiBaseUrl}. Start the backend and make sure your phone and computer are on the same network.`,
    };
  }
};

export const getModelInfo = async (): Promise<any> => {
  const apiBaseUrl = await getApiBaseUrl();
  try {
    const response = await axios.get(`${apiBaseUrl}/ocr/models`, {
      timeout: 8000,
    });
    return response.data;
  } catch {
    return null;
  }
};

export const getCurrentAPIUrl = async (): Promise<string> => {
  return getApiBaseUrl();
};
