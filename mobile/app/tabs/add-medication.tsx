import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { useTheme } from '../../src/context/ThemeContext';
import { Medication } from '../../src/types';
import { cancelNotification, scheduleNotification } from '../../src/utils/notifications';
import { enqueuePendingScan } from '../../src/utils/ocrQueueStorage';
import { ExtractedData, extractTextFromImage, OCRExtractionResult } from '../../src/utils/ocr';
import {
  addMedication,
  deleteNotificationIds,
  getMedication,
  getNotificationIds,
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

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRExtractionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingMed, setIsLoadingMed] = useState(!!id);
  const [medication, setMedication] = useState<Partial<Medication>>({
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

  useEffect(() => {
    if (id) {
      loadExistingMedication(id);
    }
  }, [id]);

  const loadExistingMedication = async (medId: string) => {
    try {
      const existing = await getMedication(medId);
      if (existing) {
        setMedication(existing);
        if (existing.imageUri) {
          setImageUri(existing.imageUri);
        }
      }
    } catch (error) {
      console.error('Error loading medication for edit:', error);
    } finally {
      setIsLoadingMed(false);
    }
  };

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
      Alert.alert(
        'Scan Failed',
        error.message || 'The scan could not be processed.',
        [
          {
            text: 'Queue for Later',
            onPress: async () => {
              await enqueuePendingScan(uri, error.message);
              Alert.alert('Queued', 'The prescription image was saved to the retry queue in Settings.');
            },
          },
          { text: 'Enter Manually', style: 'cancel' },
        ]
      );
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

  const handleSave = async () => {
    if (!medication.name || !medication.dosage) {
      Alert.alert('Missing Fields', 'Please review medication name and dosage before saving.');
      return;
    }

    const medData: Medication = {
      id: isEditMode ? id! : Date.now().toString(),
      name: medication.name,
      dosage: medication.dosage,
      frequency: medication.frequency as Medication['frequency'],
      times: medication.times || ['09:00'],
      startDate: medication.startDate || new Date().toISOString().split('T')[0],
      prescriptionDate:
        medication.prescriptionDate || new Date().toISOString().split('T')[0],
      instructions: medication.instructions,
      imageUri: medication.imageUri || imageUri || undefined,
      sourceText: ocrResult?.normalizedText || medication.sourceText,
      ocrEngine: ocrResult?.engine || medication.ocrEngine,
      ocrConfidence: ocrResult?.confidence ?? medication.ocrConfidence,
      quantity:
        medication.quantity !== undefined ? Number(medication.quantity) : undefined,
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
              onChangeText={(text) =>
                setMedication((previous) => ({ ...previous, prescriptionDate: text }))
              }
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
                <Text
                  style={[
                    styles.frequencyText,
                    { color: active ? '#fff' : colors.text },
                  ]}
                >
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
          onChangeText={(text) =>
            setMedication((previous) => ({ ...previous, instructions: text }))
          }
          placeholder="Take with food"
          placeholderTextColor={colors.textSecondary}
          multiline
        />

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
        >
          <Text style={styles.saveButtonText}>
            {isEditMode ? 'Update Medication' : 'Save to Prescription Archive'}
          </Text>
        </TouchableOpacity>
      </View>
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
});
