import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ActivePatientCard } from '../../src/components/ActivePatientCard';
import { ScheduleItem } from '../../src/components/ScheduleItem';
import { useTheme } from '../../src/context/ThemeContext';
import { Medication, PatientProfile, ScheduleItem as ScheduleItemType } from '../../src/types';
import { getWeeklySummary } from '../../src/utils/adherence';
import { getActivePatient } from '../../src/utils/patientStorage';
import {
  getTakenMedications,
  isTakenToday,
  markAsNotTaken,
  markAsTaken,
} from '../../src/utils/scheduleStorage';
import {
  decrementMedicationQuantity,
  incrementMedicationQuantity,
  loadMedicationsByPatient,
} from '../../src/utils/storage';

const buildTodaySchedule = (medications: Medication[]): ScheduleItemType[] => {
  const today = new Date().getDay();

  return medications.flatMap((medication) => {
    const shouldShowToday = (() => {
      switch (medication.frequency) {
        case 'daily':
          return true;
        case 'weekly':
          return new Date(medication.startDate).getDay() === today;
        case 'twice':
          return today % 2 === 0;
        case 'thrice':
          return today % 3 === 0;
        default:
          return true;
      }
    })();

    if (!shouldShowToday) {
      return [];
    }

    return medication.times.map((time) => ({
      ...medication,
      time,
      taken: false,
    }));
  });
};

export default function TodayScheduleScreen() {
  const router = useRouter();
  const [activePatient, setActivePatient] = useState<PatientProfile | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItemType[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState<ReturnType<typeof getWeeklySummary> | null>(null);
  const { colors } = useTheme();

  const loadSchedule = useCallback(async () => {
    const patient = await getActivePatient();
    const medications = await loadMedicationsByPatient(patient.id);
    const items = buildTodaySchedule(medications);
    const takenHistory = await getTakenMedications();

    const itemsWithStatus = await Promise.all(
      items.map(async (item) => ({
        ...item,
        taken: await isTakenToday(item.id, item.time),
      }))
    );

    itemsWithStatus.sort((a, b) => a.time.localeCompare(b.time));
    setActivePatient(patient);
    setSchedule(itemsWithStatus);
    setWeeklySummary(getWeeklySummary(medications, takenHistory));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSchedule();
    }, [loadSchedule])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSchedule();
    setRefreshing(false);
  };

  const handleMarkTaken = async (id: string, time: string) => {
    await markAsTaken(id, time);
    const newQuantity = await decrementMedicationQuantity(id);

    setSchedule((previous) =>
      previous.map((item) =>
        item.id === id && item.time === time
          ? {
              ...item,
              taken: true,
              quantity: newQuantity !== undefined ? newQuantity : item.quantity,
            }
          : item
      )
    );

    if (newQuantity !== undefined) {
      const medication = schedule.find((item) => item.id === id);
      const threshold = medication?.lowStockThreshold ?? 5;
      if (newQuantity <= threshold) {
        Alert.alert(
          'Low Stock',
          `${medication?.name ?? 'Medication'} is running low. Only ${newQuantity} pill${newQuantity === 1 ? '' : 's'} remaining.`
        );
      }
    }

    await loadSchedule();
  };

  const handleUndoTaken = async (id: string, time: string) => {
    await markAsNotTaken(id, time);
    const newQuantity = await incrementMedicationQuantity(id);

    setSchedule((previous) =>
      previous.map((item) =>
        item.id === id && item.time === time
          ? {
              ...item,
              taken: false,
              quantity: newQuantity !== undefined ? newQuantity : item.quantity,
            }
          : item
      )
    );

    await loadSchedule();
  };

  const totalCount = schedule.length;
  const takenCount = schedule.filter((item) => item.taken).length;
  const progressPercent = totalCount > 0 ? (takenCount / totalCount) * 100 : 0;

  const dateString = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {activePatient ? (
        <View style={styles.patientWrap}>
          <ActivePatientCard
            patient={activePatient}
            medicationCount={schedule.length}
            onManage={() => router.push('/tabs/patients')}
          />
        </View>
      ) : null}

      <View style={[styles.progressCard, { backgroundColor: colors.paper, borderColor: colors.border }]}>
        <Text style={[styles.dateText, { color: colors.textSecondary }]}>{dateString}</Text>
        <Text style={[styles.progressTitle, { color: colors.text }]}>
          {takenCount} of {totalCount} doses taken today
        </Text>
        <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${progressPercent}%`,
                backgroundColor: progressPercent === 100 ? '#2e8b57' : colors.primary,
              },
            ]}
          />
        </View>
        <Text style={[styles.progressCaption, { color: colors.textSecondary }]}>
          Stay on track and your refill forecast stays more accurate.
        </Text>
      </View>

      {weeklySummary ? (
        <View style={[styles.analyticsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.analyticsTitle, { color: colors.text }]}>7-day adherence</Text>
          <View style={styles.analyticsRow}>
            <View style={styles.analyticsMetric}>
              <Text style={[styles.analyticsValue, { color: colors.primary }]}>
                {Math.round(weeklySummary.adherenceRate * 100)}%
              </Text>
              <Text style={[styles.analyticsLabel, { color: colors.textSecondary }]}>adherence</Text>
            </View>
            <View style={styles.analyticsMetric}>
              <Text style={[styles.analyticsValue, { color: colors.text }]}>
                {weeklySummary.streak}
              </Text>
              <Text style={[styles.analyticsLabel, { color: colors.textSecondary }]}>day streak</Text>
            </View>
            <View style={styles.analyticsMetric}>
              <Text style={[styles.analyticsValue, { color: colors.accent }]}>
                {weeklySummary.completed}/{weeklySummary.scheduled}
              </Text>
              <Text style={[styles.analyticsLabel, { color: colors.textSecondary }]}>doses</Text>
            </View>
          </View>

          <View style={styles.weekRow}>
            {weeklySummary.weekly.map((item) => (
              <View key={item.date} style={styles.weekDay}>
                <View style={[styles.weekBarBg, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.weekBarFill,
                      {
                        height: `${Math.max(item.adherence * 100, item.scheduled > 0 ? 12 : 0)}%`,
                        backgroundColor:
                          item.adherence >= 1
                            ? '#2e8b57'
                            : item.adherence > 0
                              ? colors.primary
                              : colors.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.weekLabel, { color: colors.textSecondary }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {schedule.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No medication due today</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Add a medication or adjust reminder times to populate today&apos;s plan.
          </Text>
        </View>
      ) : (
        <FlatList
          data={schedule}
          keyExtractor={(item, index) => `${item.id}-${item.time}-${index}`}
          renderItem={({ item }) => (
            <ScheduleItem
              item={item}
              onMarkTaken={handleMarkTaken}
              onUndoTaken={handleUndoTaken}
            />
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
    padding: 16,
  },
  patientWrap: {
    marginBottom: 14,
  },
  progressCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  progressTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
  },
  progressBarBg: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressCaption: {
    marginTop: 10,
    fontSize: 13,
  },
  analyticsCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  analyticsTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  analyticsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  analyticsMetric: {
    flex: 1,
  },
  analyticsValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  analyticsLabel: {
    marginTop: 4,
    fontSize: 12,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 10,
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
  },
  weekBarBg: {
    width: '100%',
    maxWidth: 22,
    height: 72,
    borderRadius: 999,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  weekBarFill: {
    width: '100%',
    borderRadius: 999,
    minHeight: 0,
  },
  weekLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
  },
  list: {
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
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
