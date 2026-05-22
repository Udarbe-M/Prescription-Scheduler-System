export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: 'daily' | 'twice' | 'thrice' | 'weekly';
  times: string[];
  startDate: string;
  createdAt?: string;
  prescriptionDate?: string;
  instructions?: string;
  imageUri?: string;
  sourceText?: string;
  ocrEngine?: string;
  ocrConfidence?: number;
  quantity?: number;
  lowStockThreshold?: number;
}

export interface ScheduleItem extends Medication {
  time: string;
  taken: boolean;
}

export interface PendingOCRScan {
  id: string;
  imageUri: string;
  createdAt: string;
  status: 'queued' | 'failed';
  errorMessage?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}
