import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../context/ThemeContext';
import { ScheduleItem as ScheduleItemType } from '../types';

interface Props {
  item: ScheduleItemType;
  onMarkTaken: (id: string, time: string) => void;
  onUndoTaken?: (id: string, time: string) => void;
}

type ItemStatus = 'upcoming' | 'taken' | 'overdue';

const getItemStatus = (item: ScheduleItemType): ItemStatus => {
  if (item.taken) {
    return 'taken';
  }

  const now = new Date();
  const [hours, minutes] = item.time.split(':').map(Number);
  const scheduledTime = new Date();
  scheduledTime.setHours(hours, minutes, 0, 0);

  return now > scheduledTime ? 'overdue' : 'upcoming';
};

export const ScheduleItem: React.FC<Props> = ({ item, onMarkTaken, onUndoTaken }) => {
  const { colors } = useTheme();
  const status = getItemStatus(item);

  const accent =
    status === 'taken' ? '#2e8b57' : status === 'overdue' ? colors.accent : colors.primary;
  const borderColor =
    status === 'taken' ? '#72bc95' : status === 'overdue' ? '#d59a72' : colors.border;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.paper,
          borderColor,
          shadowColor: colors.text,
        },
      ]}
    >
      <View style={styles.leftColumn}>
        <Text style={[styles.time, { color: accent }]}>{item.time}</Text>
        <Text style={[styles.statusPill, { color: accent, backgroundColor: `${accent}18` }]}>
          {status === 'taken' ? 'Taken' : status === 'overdue' ? 'Overdue' : 'Scheduled'}
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.dosage, { color: colors.textSecondary }]}>{item.dosage}</Text>
        {item.instructions ? (
          <Text style={[styles.instructions, { color: colors.textSecondary }]}>
            {item.instructions}
          </Text>
        ) : null}
      </View>

      <View style={styles.actionColumn}>
        {status === 'taken' ? (
          <>
            <Text style={[styles.doneText, { color: accent }]}>Done</Text>
            {onUndoTaken ? (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.border }]}
                onPress={() => onUndoTaken(item.id, item.time)}
              >
                <Text style={[styles.secondaryText, { color: colors.text }]}>Undo</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accent }]}
            onPress={() => onMarkTaken(item.id, item.time)}
          >
            <Text style={styles.primaryText}>Take</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  leftColumn: {
    width: 86,
    marginRight: 12,
  },
  time: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  dosage: {
    fontSize: 13,
    marginBottom: 4,
  },
  instructions: {
    fontSize: 12,
    lineHeight: 17,
  },
  actionColumn: {
    marginLeft: 12,
    alignItems: 'center',
    gap: 8,
  },
  doneText: {
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '800',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryText: {
    fontWeight: '700',
    fontSize: 12,
  },
});
