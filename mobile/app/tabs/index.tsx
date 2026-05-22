import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ActivePatientCard } from '../../src/components/ActivePatientCard';
import { MedicationCard } from '../../src/components/MedicationCard';
import { useTheme } from '../../src/context/ThemeContext';
import { InteractionCheckResult, Medication, PatientProfile } from '../../src/types';
import { exportDoctorSummary } from '../../src/utils/doctorSummary';
import { getDaysRemaining } from '../../src/utils/medicationHelpers';
import { cancelNotification } from '../../src/utils/notifications';
import { getActivePatient } from '../../src/utils/patientStorage';
import { checkMedicationInteractions } from '../../src/utils/safety';
import { getTakenMedications } from '../../src/utils/scheduleStorage';
import {
  deleteMedication,
  deleteNotificationIds,
  getNotificationIds,
  loadMedicationsByPatient,
} from '../../src/utils/storage';

type LibraryMode = 'inventory' | 'archive';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [activePatient, setActivePatient] = useState<PatientProfile | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [interactionResult, setInteractionResult] = useState<InteractionCheckResult | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<LibraryMode>('inventory');

  const fetchMedications = useCallback(async () => {
    const patient = await getActivePatient();
    const meds = await loadMedicationsByPatient(patient.id);

    meds.sort((left, right) => {
      const leftDate = left.createdAt || left.prescriptionDate || '';
      const rightDate = right.createdAt || right.prescriptionDate || '';
      return rightDate.localeCompare(leftDate);
    });

    setActivePatient(patient);
    setMedications(meds);

    if (meds.length >= 2) {
      try {
        setInteractionError(null);
        setInteractionResult(await checkMedicationInteractions(meds));
      } catch (error: any) {
        setInteractionResult(null);
        setInteractionError(error.message || 'Unable to run the interaction check right now.');
      }
    } else {
      setInteractionResult(null);
      setInteractionError(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMedications();
    }, [fetchMedications])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMedications();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const notificationIds = await getNotificationIds();
      const idsToCancel = notificationIds[id] || [];

      for (const notificationId of idsToCancel) {
        try {
          await cancelNotification(notificationId);
        } catch (error) {
          console.log('Failed to cancel notification:', error);
        }
      }

      await deleteNotificationIds(id);
    } catch (error) {
      console.log('Error managing notifications during delete:', error);
    }

    await deleteMedication(id);
    await fetchMedications();
  };

  const handleEdit = (medication: Medication) => {
    router.push({ pathname: '/tabs/add-medication', params: { id: medication.id } });
  };

  const handleExportSummary = async () => {
    if (!activePatient) {
      return;
    }
    if (medications.length === 0) {
      Alert.alert('No medications yet', 'Add at least one medication before exporting a doctor summary.');
      return;
    }

    try {
      const history = await getTakenMedications();
      const filteredHistory = history.filter((entry) =>
        medications.some((medication) => medication.id === entry.medicationId)
      );
      await exportDoctorSummary(activePatient, medications, filteredHistory);
    } catch {
      Alert.alert('Export failed', 'Unable to create the doctor summary PDF right now.');
    }
  };

  const filteredMedications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const source = [...medications];

    const byMode =
      mode === 'inventory'
        ? source.sort((a, b) => a.name.localeCompare(b.name))
        : source.sort((a, b) =>
            (b.prescriptionDate || b.createdAt || '').localeCompare(
              a.prescriptionDate || a.createdAt || ''
            )
          );

    if (!normalizedQuery) {
      return byMode;
    }

    return byMode.filter((medication) => {
      const searchable = [
        medication.name,
        medication.dosage,
        medication.instructions,
        medication.sourceText,
        medication.prescriptionDate,
        medication.createdAt,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [medications, mode, query]);

  const lowStockCount = medications.filter((medication) => {
    if (medication.quantity === undefined) {
      return false;
    }
    return medication.quantity <= (medication.lowStockThreshold ?? 5);
  }).length;

  const refillSoonCount = medications.filter((medication) => {
    const daysRemaining = getDaysRemaining(medication);
    return daysRemaining !== null && daysRemaining <= 5;
  }).length;

  const refillForecast = useMemo(
    () =>
      [...medications]
        .map((medication) => ({
          medication,
          daysRemaining: getDaysRemaining(medication),
        }))
        .filter((item) => item.daysRemaining !== null)
        .sort((left, right) => (left.daysRemaining ?? 9999) - (right.daysRemaining ?? 9999))
        .slice(0, 3),
    [medications]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerCard, { backgroundColor: colors.paper, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Prescription Library</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Search medication records, scanned prescriptions, and refill status.
        </Text>

        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{medications.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Archived meds</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.statNumber, { color: colors.accent }]}>{lowStockCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Low stock</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{refillSoonCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Refill soon</Text>
          </View>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={[styles.primaryAction, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/tabs/add-medication')}
          >
            <Text style={styles.primaryActionText}>Scan Prescription</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryAction, { borderColor: colors.border }]}
            onPress={() => router.push('/tabs/today-schedule')}
          >
            <Text style={[styles.secondaryActionText, { color: colors.text }]}>Today&apos;s plan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activePatient ? (
        <View style={styles.patientCardWrap}>
          <ActivePatientCard
            patient={activePatient}
            medicationCount={medications.length}
            onManage={() => router.push('/tabs/patients')}
            onSecondaryAction={handleExportSummary}
            secondaryLabel="Doctor PDF"
          />
        </View>
      ) : null}

      <View style={styles.controls}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, dosage, date, or OCR text"
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.searchInput,
            { backgroundColor: colors.card, borderColor: colors.border, color: colors.text },
          ]}
        />

        <View style={styles.modeRow}>
          {(['inventory', 'archive'] as LibraryMode[]).map((item) => {
            const active = item === mode;
            return (
              <TouchableOpacity
                key={item}
                onPress={() => setMode(item)}
                style={[
                  styles.modeButton,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.modeText, { color: active ? '#fff' : colors.text }]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {refillForecast.length > 0 ? (
        <View style={[styles.refillCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.refillHeader}>
            <Text style={[styles.refillTitle, { color: colors.text }]}>Refill forecast</Text>
            <Text style={[styles.refillSubtitle, { color: colors.textSecondary }]}>
              Based on saved stock and reminder frequency
            </Text>
          </View>
          {refillForecast.map(({ medication, daysRemaining }) => (
            <View
              key={`forecast-${medication.id}`}
              style={[styles.refillRow, { borderTopColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.refillName, { color: colors.text }]}>{medication.name}</Text>
                <Text style={[styles.refillMeta, { color: colors.textSecondary }]}>
                  {medication.dosage}
                </Text>
              </View>
              <View style={styles.refillRight}>
                <Text
                  style={[
                    styles.refillDays,
                    {
                      color: (daysRemaining ?? 999) <= 5 ? colors.accent : colors.primary,
                    },
                  ]}
                >
                  {Math.max(0, Math.floor(daysRemaining ?? 0))} day
                  {Math.max(0, Math.floor(daysRemaining ?? 0)) === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.refillMeta, { color: colors.textSecondary }]}>remaining</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {interactionResult?.alerts?.length ? (
        <View style={[styles.safetyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.safetyTitle, { color: colors.text }]}>Interaction review</Text>
          <Text style={[styles.safetySubtitle, { color: colors.textSecondary }]}>
            Informational only. Review combinations with a clinician or pharmacist.
          </Text>
          {interactionResult.alerts.slice(0, 3).map((alert, index) => (
            <View
              key={`${alert.medications.join('-')}-${index}`}
              style={[styles.safetyRow, { borderTopColor: colors.border }]}
            >
              <Text
                style={[
                  styles.safetySeverity,
                  { color: alert.severity === 'high' ? colors.accent : colors.primary },
                ]}
              >
                {alert.severity.toUpperCase()}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.safetySummary, { color: colors.text }]}>{alert.summary}</Text>
                <Text style={[styles.safetyEvidence, { color: colors.textSecondary }]}>
                  {alert.evidence_excerpt || alert.section}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {interactionError ? (
        <View style={[styles.safetyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.safetyTitle, { color: colors.text }]}>Interaction review</Text>
          <Text style={[styles.safetySubtitle, { color: colors.textSecondary }]}>
            {interactionError}
          </Text>
        </View>
      ) : null}

      {filteredMedications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No matches yet</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Scan a prescription or adjust your search to see saved medications.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredMedications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MedicationCard medication={item} onDelete={handleDelete} onEdit={handleEdit} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerCard: {
    margin: 16,
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  statBox: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  primaryAction: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '800',
  },
  secondaryAction: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryActionText: {
    fontWeight: '700',
  },
  patientCardWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  controls: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  modeText: {
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  refillCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  refillHeader: {
    marginBottom: 8,
  },
  refillTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  refillSubtitle: {
    marginTop: 4,
    fontSize: 12,
  },
  refillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
  },
  refillName: {
    fontSize: 15,
    fontWeight: '700',
  },
  refillMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  refillRight: {
    alignItems: 'flex-end',
  },
  refillDays: {
    fontSize: 16,
    fontWeight: '800',
  },
  safetyCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  safetyTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  safetySubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  safetyRow: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  safetySeverity: {
    width: 68,
    fontSize: 11,
    fontWeight: '800',
  },
  safetySummary: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  safetyEvidence: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
