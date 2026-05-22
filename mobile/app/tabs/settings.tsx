import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useTheme } from '../../src/context/ThemeContext';
import { Medication, PendingOCRScan } from '../../src/types';
import { addMedication } from '../../src/utils/storage';
import { cancelAllNotifications } from '../../src/utils/notifications';
import { ExtractedData, extractTextFromImage, getCurrentAPIUrl, getModelInfo, testAPIConnection } from '../../src/utils/ocr';
import {
  loadPendingScans,
  removePendingScan,
} from '../../src/utils/ocrQueueStorage';
import {
  loadOcrMode,
  OCRMode,
  saveApiBaseUrl,
  saveOcrMode,
} from '../../src/utils/settingsStorage';

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

const candidateToMedication = (
  candidate: ExtractedData,
  sourceText: string,
  engine: string,
  confidence: number | undefined,
  imageUri: string
): Medication => {
  const frequency = candidate.frequency || 'daily';
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name: candidate.name || 'Review queued prescription',
    dosage: candidate.dosage || 'Review dosage',
    frequency,
    times: getDefaultTimes(frequency),
    startDate: new Date().toISOString().split('T')[0],
    prescriptionDate: new Date().toISOString().split('T')[0],
    instructions: candidate.instructions,
    imageUri,
    sourceText,
    ocrEngine: engine,
    ocrConfidence: confidence,
    quantity: candidate.quantity_hint,
    lowStockThreshold: 5,
  };
};

export default function SettingsScreen() {
  const { theme, toggleTheme, colors } = useTheme();
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [ocrMode, setLocalOcrMode] = useState<OCRMode>('auto');
  const [statusMessage, setStatusMessage] = useState('Not tested yet');
  const [modelSummary, setModelSummary] = useState<string[]>([]);
  const [pendingScans, setPendingScans] = useState<PendingOCRScan[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);

  const loadSettings = async () => {
    setApiBaseUrl(await getCurrentAPIUrl());
    setLocalOcrMode(await loadOcrMode());
    setPendingScans(await loadPendingScans());
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    await saveApiBaseUrl(apiBaseUrl);
    await saveOcrMode(ocrMode);
    Alert.alert('Saved', 'Backend settings updated.');
  };

  const handleTestConnection = async () => {
    const result = await testAPIConnection();
    setStatusMessage(result.message);

    if (result.connected) {
      const info = await getModelInfo();
      const summary = (info?.models || []).map(
        (item: any) => `${item.key}: ${item.available ? 'ready' : 'unavailable'}`
      );
      setModelSummary(summary);
    } else {
      setModelSummary([]);
    }
  };

  const handleRetryQueue = async () => {
    if (pendingScans.length === 0) {
      Alert.alert('Queue Empty', 'There are no pending OCR scans to retry.');
      return;
    }

    setIsRetrying(true);
    let importedCount = 0;

    for (const item of pendingScans) {
      try {
        const extraction = await extractTextFromImage(item.imageUri);
        const candidates =
          extraction.medications.length > 0
            ? extraction.medications
            : [extraction.fields];

        for (const candidate of candidates) {
          await addMedication(
            candidateToMedication(
              candidate,
              extraction.normalizedText,
              extraction.engine,
              extraction.confidence,
              item.imageUri
            )
          );
          importedCount += 1;
        }

        await removePendingScan(item.id);
      } catch (error) {
        console.log('Retry failed for queue item:', error);
      }
    }

    setIsRetrying(false);
    await loadSettings();
    Alert.alert(
      'Queue Retry Complete',
      importedCount > 0
        ? `Imported ${importedCount} medication record(s) from queued scans.`
        : 'No queued scans were imported. Check backend connectivity and try again.'
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          Tune OCR behavior, retry offline scans, and customize your prescription workspace.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Appearance</Text>
        <View style={[styles.sectionContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.settingTitle, { color: colors.text }]}>Theme</Text>
          <View style={styles.optionsContainer}>
            {(['light', 'dark', 'system'] as const).map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: theme === option ? colors.primary : colors.paper,
                    borderColor: theme === option ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => toggleTheme(option)}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: theme === option ? '#fff' : colors.text },
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>OCR Backend</Text>
        <View style={[styles.sectionContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.settingTitle, { color: colors.text }]}>API Base URL</Text>
          <TextInput
            value={apiBaseUrl}
            onChangeText={setApiBaseUrl}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.paper }]}
            placeholder="http://192.168.x.x:8000"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
          />
          <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
            Use your computer&apos;s local IP when testing on a physical phone.
          </Text>

          <Text style={[styles.settingTitle, { color: colors.text, marginTop: 20 }]}>OCR Mode</Text>
          <View style={styles.optionsContainer}>
            {(['auto', 'printed', 'handwritten', 'prescription'] as OCRMode[]).map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: ocrMode === option ? colors.primary : colors.paper,
                    borderColor: ocrMode === option ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setLocalOcrMode(option)}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: ocrMode === option ? '#fff' : colors.text },
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={handleSave}
          >
            <Text style={styles.primaryButtonText}>Save Backend Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.primary }]}
            onPress={handleTestConnection}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
              Test Connection
            </Text>
          </TouchableOpacity>

          <Text style={[styles.settingDescription, { color: colors.textSecondary, marginTop: 12 }]}>
            {statusMessage}
          </Text>

          {modelSummary.map((line) => (
            <Text key={line} style={[styles.modelRow, { color: colors.text }]}>
              {line}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Offline Queue</Text>
        <View style={[styles.sectionContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.settingTitle, { color: colors.text }]}>
            Pending prescription scans: {pendingScans.length}
          </Text>
          <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
            Failed scans are saved here so you can retry them when the backend is available again.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 14 }]}
            onPress={handleRetryQueue}
            disabled={isRetrying}
          >
            <Text style={styles.primaryButtonText}>
              {isRetrying ? 'Retrying queue...' : 'Retry queued scans'}
            </Text>
          </TouchableOpacity>

          {pendingScans.slice(0, 3).map((item) => (
            <View key={item.id} style={[styles.queueItem, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.queueTitle, { color: colors.text }]}>
                  Queued {new Date(item.createdAt).toLocaleString()}
                </Text>
                <Text style={[styles.queueMeta, { color: colors.textSecondary }]}>
                  {item.errorMessage || 'Waiting for retry'}
                </Text>
              </View>
              <TouchableOpacity onPress={async () => {
                await removePendingScan(item.id);
                setPendingScans(await loadPendingScans());
              }}>
                <Text style={[styles.queueRemove, { color: colors.danger }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Maintenance</Text>
        <View style={[styles.sectionContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={async () => {
              await cancelAllNotifications();
              Alert.alert('Notifications Cleared', 'All scheduled reminders were cancelled.');
            }}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Cancel all reminders
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingTop: 18,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginLeft: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionContent: {
    borderRadius: 20,
    marginHorizontal: 16,
    padding: 16,
    borderWidth: 1,
  },
  settingTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontWeight: '800',
  },
  modelRow: {
    marginTop: 8,
    fontSize: 13,
  },
  queueItem: {
    marginTop: 12,
    borderTopWidth: 1,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  queueTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  queueMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  queueRemove: {
    fontWeight: '800',
  },
});
