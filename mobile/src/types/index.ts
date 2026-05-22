export interface Medication {
  id: string;
  patientId: string;
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

export interface PatientProfile {
  id: string;
  name: string;
  relationship: string;
  birthDate?: string;
  doctorName?: string;
  doctorPhone?: string;
  pharmacyName?: string;
  pharmacyPhone?: string;
  notes?: string;
  createdAt: string;
}

export interface InteractionAlert {
  medications: string[];
  severity: 'high' | 'moderate' | 'info';
  section: string;
  summary: string;
  evidence_excerpt?: string;
}

export interface InteractionMedicationMatch {
  name: string;
  dosage?: string;
  normalized_name?: string;
  rxcui?: string;
  label_brand_names: string[];
  label_generic_names: string[];
  label_found: boolean;
}

export interface InteractionCheckResult {
  success: boolean;
  checked_at: string;
  medications: InteractionMedicationMatch[];
  alerts: InteractionAlert[];
  unresolved_medications: string[];
  disclaimer: string;
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
