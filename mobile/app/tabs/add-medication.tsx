import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ActivePatientCard } from '../../src/components/ActivePatientCard';
import { useTheme } from '../../src/context/ThemeContext';
import { InteractionCheckResult, Medication, PatientProfile } from '../../src/types';
import { getDaysRemaining } from '../../src/utils/medicationHelpers';
import { cancelNotification, scheduleNotification } from '../../src/utils/notifications';
import { ExtractedData, extractTextFromImage, OCRExtractionResult } from '../../src/utils/ocr';
import { enqueuePendingScan } from '../../src/utils/ocrQueueStorage';
import { DEFAULT_PATIENT_ID, getActivePatient, loadPatients } from '../../src/utils/patientStorage';
import { checkMedicationInteractions } from '../../src/utils/safety';
import { getTakenMedicationsByMedication, TakenMedication } from '../../src/utils/scheduleStorage';
import {
  addMedication,
  deleteNotificationIds,
  getMedication,
  getNotificationIds,
  loadMedicationsByPatient,
  saveNotificationIds,
  updateMedication,
} from '../../src/utils/storage';

const getDefaultTimes = (frequency: Medication['frequency']): string[] => {
  switch (frequency) {
    case 'twice':
      return ['08:00', '20:00'];
    case 'thrice':
      return ['08:00', '14:00', '20:00'];
    case 'weekly':
      return ['09:00'];
    default:
      return ['09:00'];
  }
};

export default function AddMedicationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditMode = !!id;
  const { colors } = useTheme();

  const [activePatient, setActivePatient] = useState<PatientProfile | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRExtractionResult | null>(null);
  const [safetyResult, setSafetyResult] = useState<InteractionCheckResult | null>(null);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [takenHistory, setTakenHistory] = useState<TakenMedication[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCheckingSafety, setIsCheckingSafety] = useState(false);
  const [isLoadingMed, setIsLoadingMed] = useState(!!id);
  const [medication, setMedication] = useState<Partial<Medication>>({
    patientId: DEFAULT_PATIENT_ID,
    name: '',
    dosage: '',
    frequency: 'daily',
    times: ['09:00'],
    startDate: new Date().toISOString().split('T')[0],
    prescriptionDate: new Date().toISOString().split('T')[0],
    instructions: '',
    quantity: undefined,
    lowStockThreshold: 5,
  });

  const loadPatientContext = useCallback(async (patientId?: string) => {
    if (patientId) {
      const patients = await loadPatients();
      const match = patients.find((patient) => patient.id === patientId);
      if (match) {
        setActivePatient(match);
        return match;
      }
    }

    const active = await getActivePatient();
    setActivePatient(active);
    return active;
  }, []);

  const loadExistingMedication = useCallback(async (medId: string) => {
    try {
      const existing = await getMedication(medId);
      if (existing) {
        setMedication(existing);
        await loadPatientContext(existing.patientId);
        if (existing.imageUri) {
          setImageUri(existing.imageUri);
        }
        setTakenHistory(await getTakenMedicationsByMedication(existing.id, 8));
      }
    } catch (error) {
      console.error('Error loading medication for edit:', error);
    } finally {
      setIsLoadingMed(false);
    }
  }, [loadPatientContext]);

  useEffect(() => {
    const initialize = async () => {
      if (id) {
        await loadExistingMedication(id);
      } else {
        const patient = await getActivePatient();
        setActivePatient(patient);
        setMedication((previous) => ({ ...previous, patientId: patient.id }));
        setIsLoadingMed(false);
      }
    };

    initialize();
  }, [id, loadExistingMedication]);

  const applyDetectedMedication = (fields: ExtractedData) => {
    const frequency = fields.frequency || 'daily';
    setMedication((previous) => ({
      ...previous,
      name: fields.name || previous.name,
      dosage: fields.dosage || previous.dosage,
      frequency,
      instructions: fields.instructions || previous.instructions,
      quantity: fields.quantity_hint ?? previous.quantity,
      times:
        previous.times && previous.times.length > 1 && previous.name
          ? previous.times
          : getDefaultTimes(frequency),
    }));
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required to scan prescriptions.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!result.canceled && result.assets[0]) {
      processImage(result.assets[0].uri);
    }
  };

  const uploadPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Photo library permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!result.canceled && result.assets[0]) {
      processImage(result.assets[0].uri);
    }
  };

  const processImage = async (uri: string) => {
    setImageUri(uri);
    setIsProcessing(true);

    try {
      const extraction = await extractTextFromImage(uri);
      setOcrResult(extraction);
      applyDetectedMedication(extraction.fields);

      Alert.alert(
        'Scan Complete',
        `Detected ${Math.max(extraction.medications.length, 1)} medication candidate(s). Review before saving.`
      );
    } catch (error: any) {
      Alert.alert('Scan Failed', error.message || 'The scan could not be processed.', [
        {
          text: 'Queue for Later',
          onPress: async () => {
            await enqueuePendingScan(uri, error.message);
            Alert.alert('Queued', 'The prescription image was saved to the retry queue in Settings.');
          },
        },
        { text: 'Enter Manually', style: 'cancel' },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const addTime = () => {
    setMedication((previous) => ({
      ...previous,
      times: [...(previous.times || []), '12:00'],
    }));
  };

  const updateTime = (index: number, value: string) => {
    const next = [...(medication.times || [])];
    next[index] = value;
    setMedication((previous) => ({ ...previous, times: next }));
  };

  const removeTime = (index: number) => {
    if ((medication.times?.length || 0) > 1) {
      setMedication((previous) => ({
        ...previous,
        times: previous.times?.filter((_, itemIndex) => itemIndex !== index) || [],
      }));
    }
  };

  const persistMedication = async (medData: Medication) => {
    if (isEditMode) {
      try {
        const existingIds = await getNotificationIds();
        const idsToCancel = existingIds[id!] || [];
        for (const notifId of idsToCancel) {
          try {
            await cancelNotification(notifId);
          } catch (error) {
            console.log('Failed to cancel old notification:', error);
          }
        }
        await deleteNotificationIds(id!);
      } catch (error) {
        console.log('Error cleaning old notifications:', error);
      }

      await updateMedication(id!, medData);
    } else {
      await addMedication(medData);
    }

    const notificationIds: string[] = [];
    for (const time of medData.times) {
      try {
        const notificationId = await scheduleNotification(medData, time);
        notificationIds.push(notificationId);
      } catch (error) {
        console.log('Notification scheduling skipped:', error);
      }
    }

    await saveNotificationIds(medData.id, notificationIds);
  };

  const runSafetyCheck = async () => {
    if (!activePatient) {
      Alert.alert('No active profile', 'Choose a patient profile first.');
      return;
    }

    if (!medication.name || !medication.dosage) {
      Alert.alert('Missing details', 'Add at least a medication name and dosage before checking interactions.');
      return;
    }

    setIsCheckingSafety(true);
    try {
      const existingMeds = await loadMedicationsByPatient(activePatient.id);
      const draftMedication: Medication = {
        id: medication.id || 'draft-check',
        patientId: activePatient.id,
        name: medication.name,
        dosage: medication.dosage,
        frequency: (medication.frequency || 'daily') as Medication['frequency'],
        times: medication.times || ['09:00'],
        startDate: medication.startDate || new Date().toISOString().split('T')[0],
        prescriptionDate: medication.prescriptionDate || new Date().toISOString().split('T')[0],
        instructions: medication.instructions,
        quantity: medication.quantity !== undefined ? Number(medication.quantity) : undefined,
        lowStockThreshold: medication.lowStockThreshold,
      };

      const result = await checkMedicationInteractions([
        ...existingMeds.filter((item) => item.id !== draftMedication.id),
        draftMedication,
      ]);
      setSafetyResult(result);
      setSafetyError(null);
    } catch (error: any) {
      setSafetyResult(null);
      setSafetyError(error.message || 'Unable to run the interaction check right now.');
    } finally {
      setIsCheckingSafety(false);
    }
  };

  const handleSave = async () => {
    if (!medication.name || !medication.dosage) {
      Alert.alert('Missing Fields', 'Please review medication name and dosage before saving.');
      return;
    }

    const medData: Medication = {
      id: isEditMode ? id! : Date.now().toString(),
      patientId: medication.patientId || activePatient?.id || DEFAULT_PATIENT_ID,
      name: medication.name,
      dosage: medication.dosage,
      frequency: medication.frequency as Medication['frequency'],
      times: medication.times || ['09:00'],
      startDate: medication.startDate || new Date().toISOString().split('T')[0],
      prescriptionDate: medication.prescriptionDate || new Date().toISOString().split('T')[0],
      instructions: medication.instructions,
      imageUri: medication.imageUri || imageUri || undefined,
      sourceText: ocrResult?.normalizedText || medication.sourceText,
      ocrEngine: ocrResult?.engine || medication.ocrEngine,
      ocrConfidence: ocrResult?.confidence ?? medication.ocrConfidence,
      quantity: medication.quantity !== undefined ? Number(medication.quantity) : undefined,
      lowStockThreshold: medication.lowStockThreshold ?? 5,
    };

    try {
      await persistMedication(medData);
      Alert.alert('Saved', isEditMode ? 'Medication updated.' : 'Medication added.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', isEditMode ? 'Failed to update medication.' : 'Failed to save medication.');
    }
  };

  const handleAddAllDetected = async () => {
    if (!ocrResult || ocrResult.medications.length === 0) {
      return;
    }

    try {
      for (const candidate of ocrResult.medications) {
        const frequency = candidate.frequency || 'daily';
        const medicationToAdd: Medication = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          patientId: activePatient?.id || DEFAULT_PATIENT_ID,
          name: candidate.name || 'Review Detected Medication',
          dosage: candidate.dosage || 'Review dosage',
          frequency,
          times: getDefaultTimes(frequency),
          startDate: new Date().toISOString().split('T')[0],
          prescriptionDate: new Date().toISOString().split('T')[0],
          instructions: candidate.instructions,
          imageUri: imageUri || undefined,
          sourceText: ocrResult.normalizedText,
          ocrEngine: ocrResult.engine,
          ocrConfidence: ocrResult.confidence,
          quantity: candidate.quantity_hint,
          lowStockThreshold: 5,
        };

        await persistMedication(medicationToAdd);
      }

      Alert.alert('Imported', 'All detected medications were added to your archive.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Unable to import all detected medications.');
    }
  };

  if (isLoadingMed) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading prescription...
        </Text>
      </View>
    );
  }

  const confidencePercent =
    ocrResult?.confidence !== undefined ? Math.round(ocrResult.confidence * 100) : null;
  const showConfidenceWarning = confidencePercent !== null && confidencePercent < 70;
  const daysRemaining =
    medication.name && medication.dosage
      ? getDaysRemaining({
          id: medication.id || 'preview',
          patientId: medication.patientId || activePatient?.id || DEFAULT_PATIENT_ID,
          name: medication.name,
          dosage: medication.dosage,
          frequency: (medication.frequency || 'daily') as Medication['frequency'],
          times: medication.times || ['09:00'],
          startDate: medication.startDate || new Date().toISOString().split('T')[0],
          prescriptionDate: medication.prescriptionDate,
          instructions: medication.instructions,
          imageUri: medication.imageUri,
          quantity: medication.quantity,
          lowStockThreshold: medication.lowStockThreshold,
        })
      : null;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.heroCard, { backgroundColor: colors.paper, borderColor: colors.border }]}>
        <Text style={[styles.heroTitle, { color: colors.text }]}>
          {isEditMode ? 'Review Prescription' : 'Scan a Prescription'}
        </Text>
        <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
          Capture a prescription, review the OCR output, then save one or more medications.
        </Text>

        {!imageUri ? (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.imageButton, { backgroundColor: colors.primarySoft }]}
              onPress={takePhoto}
            >
              <Text style={[styles.imageButtonLabel, { color: colors.primary }]}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.imageButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={uploadPhoto}
            >
              <Text style={[styles.imageButtonLabel, { color: colors.text }]}>Upload</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Image source={{ uri: imageUri }} style={styles.image} />
            <TouchableOpacity
              style={[styles.removeImageButton, { borderColor: colors.border }]}
              onPress={() => {
                setImageUri(null);
                setOcrResult(null);
              }}
            >
              <Text style={[styles.removeImageText, { color: colors.text }]}>Replace image</Text>
            </TouchableOpacity>
          </View>
        )}

        {isProcessing ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.processingText, { color: colors.textSecondary }]}>
              Reading handwriting and prescription details...
            </Text>
          </View>
        ) : null}
      </View>

      {activePatient ? (
        <View style={styles.patientWrap}>
          <ActivePatientCard
            patient={activePatient}
            onManage={() => router.push('/tabs/patients')}
          />
        </View>
      ) : null}

      {ocrResult ? (
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>OCR Review</Text>
            <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
              {ocrResult.engine}
              {confidencePercent !== null ? ` • ${confidencePercent}%` : ''}
            </Text>
          </View>

          {showConfidenceWarning ? (
            <View style={[styles.warningBox, { backgroundColor: `${colors.accent}18` }]}>
              <Text style={[styles.warningText, { color: colors.accent }]}>
                Lower confidence detected. Double-check medicine names and dosages before saving.
              </Text>
            </View>
          ) : null}

          {ocrResult.medications.length > 0 ? (
            <>
              <Text style={[styles.subtleLabel, { color: colors.textSecondary }]}>
                Detected medications
              </Text>
              {ocrResult.medications.map((candidate, index) => (
                <TouchableOpacity
                  key={`${candidate.name || 'candidate'}-${index}`}
                  style={[styles.detectedCard, { borderColor: colors.border, backgroundColor: colors.paper }]}
                  onPress={() => applyDetectedMedication(candidate)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.detectedName, { color: colors.text }]}>
                      {candidate.name || 'Unnamed medication'}
                    </Text>
                    <Text style={[styles.detectedMeta, { color: colors.textSecondary }]}>
                      {candidate.dosage || 'Review dosage'} • {candidate.frequency || 'daily'}
                    </Text>
                    {candidate.instructions ? (
                      <Text style={[styles.detectedMeta, { color: colors.textSecondary }]}>
                        {candidate.instructions}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.useText, { color: colors.primary }]}>Use</Text>
                </TouchableOpacity>
              ))}

              {!isEditMode && ocrResult.medications.length > 1 ? (
                <TouchableOpacity
                  style={[styles.bulkButton, { backgroundColor: colors.primary }]}
                  onPress={handleAddAllDetected}
                >
                  <Text style={styles.bulkButtonText}>Add all detected medications</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}

          <Text style={[styles.subtleLabel, { color: colors.textSecondary, marginTop: 14 }]}>
            Extracted text
          </Text>
          <TextInput
            style={[
              styles.previewInput,
              { backgroundColor: colors.paper, borderColor: colors.border, color: colors.text },
            ]}
            value={ocrResult.normalizedText}
            editable={false}
            multiline
          />
        </View>
      ) : null}

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Medication Details</Text>

        {medication.quantity !== undefined || daysRemaining !== null ? (
          <View style={[styles.timelineSummary, { backgroundColor: colors.paper, borderColor: colors.border }]}>
            <View style={styles.timelineMetric}>
              <Text style={[styles.timelineMetricLabel, { color: colors.textSecondary }]}>Stock</Text>
              <Text style={[styles.timelineMetricValue, { color: colors.text }]}>
                {medication.quantity ?? 'Unknown'}
              </Text>
            </View>
            <View style={styles.timelineMetric}>
              <Text style={[styles.timelineMetricLabel, { color: colors.textSecondary }]}>Days left</Text>
              <Text
                style={[
                  styles.timelineMetricValue,
                  { color: daysRemaining !== null && daysRemaining <= 5 ? colors.accent : colors.primary },
                ]}
              >
                {daysRemaining !== null ? Math.max(0, Math.floor(daysRemaining)) : '--'}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.textSecondary }]}>Medication Name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.paper, borderColor: colors.border, color: colors.text }]}
          value={medication.name}
          onChangeText={(text) => setMedication((previous) => ({ ...previous, name: text }))}
          placeholder="e.g., Amoxicillin"
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Dosage</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.paper, borderColor: colors.border, color: colors.text }]}
          value={medication.dosage}
          onChangeText={(text) => setMedication((previous) => ({ ...previous, dosage: text }))}
          placeholder="e.g., 500mg"
          placeholderTextColor={colors.textSecondary}
        />

        <View style={styles.dualRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Prescription Date</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.paper, borderColor: colors.border, color: colors.text }]}
              value={medication.prescriptionDate}
              onChangeText={(text) => setMedication((previous) => ({ ...previous, prescriptionDate: text }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Quantity</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.paper, borderColor: colors.border, color: colors.text }]}
              value={medication.quantity !== undefined ? String(medication.quantity) : ''}
              onChangeText={(text) => {
                const number = parseInt(text, 10);
                setMedication((previous) => ({
                  ...previous,
                  quantity: Number.isNaN(number) ? undefined : number,
                }));
              }}
              placeholder="30"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Frequency</Text>
        <View style={styles.frequencyContainer}>
          {(['daily', 'twice', 'thrice', 'weekly'] as const).map((frequency) => {
            const active = medication.frequency === frequency;
            return (
              <TouchableOpacity
                key={frequency}
                style={[
                  styles.frequencyButton,
                  {
                    backgroundColor: active ? colors.primary : colors.paper,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() =>
                  setMedication((previous) => ({
                    ...previous,
                    frequency,
                    times: getDefaultTimes(frequency),
                  }))
                }
              >
                <Text style={[styles.frequencyText, { color: active ? '#fff' : colors.text }]}>
                  {frequency}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Reminder Times</Text>
        {medication.times?.map((time, index) => (
          <View key={`${time}-${index}`} style={styles.timeRow}>
            <TextInput
              style={[
                styles.input,
                styles.timeInput,
                { backgroundColor: colors.paper, borderColor: colors.border, color: colors.text },
              ]}
              value={time}
              onChangeText={(text) => updateTime(index, text)}
              placeholder="09:00"
              placeholderTextColor={colors.textSecondary}
            />
            {(medication.times?.length || 0) > 1 ? (
              <TouchableOpacity
                style={[styles.removeTimeButton, { borderColor: colors.border }]}
                onPress={() => removeTime(index)}
              >
                <Text style={[styles.removeTimeText, { color: colors.danger }]}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        <TouchableOpacity
          style={[styles.addTimeButton, { borderColor: colors.border }]}
          onPress={addTime}
        >
          <Text style={[styles.addTimeText, { color: colors.primary }]}>Add another time</Text>
        </TouchableOpacity>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Instructions</Text>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            { backgroundColor: colors.paper, borderColor: colors.border, color: colors.text },
          ]}
          value={medication.instructions}
          onChangeText={(text) => setMedication((previous) => ({ ...previous, instructions: text }))}
          placeholder="Take with food"
          placeholderTextColor={colors.textSecondary}
          multiline
        />

        <TouchableOpacity
          style={[styles.secondaryActionButton, { borderColor: colors.border }]}
          onPress={runSafetyCheck}
          disabled={isCheckingSafety}
        >
          <Text style={[styles.secondaryActionTextButton, { color: colors.text }]}>
            {isCheckingSafety ? 'Checking current meds...' : 'Check with current meds'}
          </Text>
        </TouchableOpacity>

        {safetyResult?.alerts?.length ? (
          <View style={[styles.safetyPanel, { backgroundColor: colors.paper, borderColor: colors.border }]}>
            <Text style={[styles.safetyPanelTitle, { color: colors.text }]}>Interaction review</Text>
            {safetyResult.alerts.slice(0, 3).map((alert, index) => (
              <View key={`${alert.medications.join('-')}-${index}`} style={styles.safetyItem}>
                <Text
                  style={[
                    styles.safetySeverity,
                    { color: alert.severity === 'high' ? colors.accent : colors.primary },
                  ]}
                >
                  {alert.severity.toUpperCase()}
                </Text>
                <Text style={[styles.safetySummary, { color: colors.text }]}>{alert.summary}</Text>
                <Text style={[styles.safetyEvidence, { color: colors.textSecondary }]}>
                  {alert.evidence_excerpt || alert.section}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {safetyError ? (
          <View style={[styles.safetyPanel, { backgroundColor: colors.paper, borderColor: colors.border }]}>
            <Text style={[styles.safetyPanelTitle, { color: colors.text }]}>Interaction review</Text>
            <Text style={[styles.safetyEvidence, { color: colors.textSecondary }]}>{safetyError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
        >
          <Text style={styles.saveButtonText}>
            {isEditMode ? 'Update Medication' : 'Save to Prescription Archive'}
          </Text>
        </TouchableOpacity>
      </View>

      {isEditMode ? (
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Medication Timeline</Text>
          <View style={styles.timelineList}>
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
              <View style={styles.timelineContent}>
                <Text style={[styles.timelineTitle, { color: colors.text }]}>Prescription dated</Text>
                <Text style={[styles.timelineBody, { color: colors.textSecondary }]}>
                  {medication.prescriptionDate || 'Not set'}
                </Text>
              </View>
            </View>
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, { backgroundColor: colors.primarySoft }]} />
              <View style={styles.timelineContent}>
                <Text style={[styles.timelineTitle, { color: colors.text }]}>Schedule started</Text>
                <Text style={[styles.timelineBody, { color: colors.textSecondary }]}>
                  {medication.startDate || 'Not set'}
                </Text>
              </View>
            </View>
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, { backgroundColor: colors.accent }]} />
              <View style={styles.timelineContent}>
                <Text style={[styles.timelineTitle, { color: colors.text }]}>Saved in archive</Text>
                <Text style={[styles.timelineBody, { color: colors.textSecondary }]}>
                  {medication.createdAt || 'Unknown'}
                </Text>
              </View>
            </View>
            {takenHistory.map((entry) => (
              <View key={`${entry.takenAt}-${entry.time}`} style={styles.timelineItem}>
                <View style={[styles.timelineDot, { backgroundColor: '#2e8b57' }]} />
                <View style={styles.timelineContent}>
                  <Text style={[styles.timelineTitle, { color: colors.text }]}>Dose marked taken</Text>
                  <Text style={[styles.timelineBody, { color: colors.textSecondary }]}>
                    {entry.date} at {entry.time}
                  </Text>
                </View>
              </View>
            ))}
            {takenHistory.length === 0 ? (
              <Text style={[styles.timelineEmpty, { color: colors.textSecondary }]}>
                No dose history yet. Mark medication as taken from Today&apos;s plan to build the timeline.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  heroCard: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  imageButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
  },
  imageButtonLabel: {
    fontWeight: '800',
    fontSize: 15,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    marginBottom: 12,
  },
  removeImageButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  removeImageText: {
    fontWeight: '700',
  },
  processingContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  processingText: {
    marginTop: 8,
    fontSize: 13,
  },
  patientWrap: {
    marginBottom: 16,
  },
  sectionCard: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningBox: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    fontWeight: '700',
    fontSize: 13,
  },
  subtleLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  detectedCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detectedName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  detectedMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
  useText: {
    fontWeight: '800',
  },
  bulkButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  bulkButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  previewInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  dualRow: {
    flexDirection: 'row',
    gap: 12,
  },
  frequencyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frequencyButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  frequencyText: {
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  timeInput: {
    flex: 1,
  },
  removeTimeButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  removeTimeText: {
    fontWeight: '700',
  },
  addTimeButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addTimeText: {
    fontWeight: '700',
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  secondaryActionButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  secondaryActionTextButton: {
    fontWeight: '700',
  },
  safetyPanel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
  },
  safetyPanelTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  safetyItem: {
    marginTop: 12,
  },
  safetySeverity: {
    fontSize: 11,
    fontWeight: '800',
  },
  safetySummary: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  safetyEvidence: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 18,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  timelineSummary: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    gap: 18,
    marginBottom: 10,
  },
  timelineMetric: {
    flex: 1,
  },
  timelineMetricLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  timelineMetricValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  timelineList: {
    gap: 14,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  timelineBody: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
  },
  timelineEmpty: {
    fontSize: 13,
    lineHeight: 19,
  },
});
