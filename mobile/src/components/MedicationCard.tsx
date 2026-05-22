import React from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../context/ThemeContext';
import { Medication } from '../types';
import {
  formatPrescriptionDate,
  getDaysRemaining,
  getStockStatus,
} from '../utils/medicationHelpers';

interface Props {
  medication: Medication;
  onDelete: (id: string) => void;
  onEdit?: (medication: Medication) => void;
}

export const MedicationCard: React.FC<Props> = ({ medication, onDelete, onEdit }) => {
  const { colors } = useTheme();
  const stockStatus = getStockStatus(medication);
  const daysRemaining = getDaysRemaining(medication);

  const handleDelete = () => {
    Alert.alert(
      'Delete Medication',
      `Remove ${medication.name} from your prescription archive and schedule?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(medication.id) },
      ]
    );
  };

  const stockAccent =
    stockStatus === 'low' || stockStatus === 'out' ? colors.accent : colors.primary;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.paper,
          borderColor: colors.border,
          shadowColor: colors.text,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.rxBadge, { backgroundColor: colors.primarySoft }]}>
          <Text style={[styles.rxBadgeText, { color: colors.primary }]}>Rx</Text>
        </View>
        <Text style={[styles.dateText, { color: colors.textSecondary }]}>
          {formatPrescriptionDate(medication.prescriptionDate || medication.createdAt) || 'No date'}
        </Text>
      </View>

      <View style={styles.bodyRow}>
        {medication.imageUri ? (
          <Image source={{ uri: medication.imageUri }} style={styles.thumbnail} />
        ) : null}

        <View style={styles.content}>
          <Text style={[styles.name, { color: colors.text }]}>{medication.name}</Text>
          <Text style={[styles.dosage, { color: colors.textSecondary }]}>
            {medication.dosage} • {medication.frequency}
          </Text>
          {medication.instructions ? (
            <Text style={[styles.instructions, { color: colors.textSecondary }]}>
              {medication.instructions}
            </Text>
          ) : null}

          <View style={styles.timesContainer}>
            {medication.times.map((time) => (
              <View
                key={`${medication.id}-${time}`}
                style={[styles.timeBadge, { backgroundColor: colors.primarySoft }]}
              >
                <Text style={[styles.timeText, { color: colors.primary }]}>{time}</Text>
              </View>
            ))}
          </View>

          {medication.quantity !== undefined ? (
            <View style={styles.metaRow}>
              <Text style={[styles.stockText, { color: stockAccent }]}>
                {medication.quantity} pill{medication.quantity === 1 ? '' : 's'} left
              </Text>
              {daysRemaining !== null ? (
                <Text style={[styles.daysText, { color: colors.textSecondary }]}>
                  about {Math.floor(daysRemaining)} day{Math.floor(daysRemaining) === 1 ? '' : 's'}
                </Text>
              ) : null}
            </View>
          ) : null}

          {medication.ocrEngine ? (
            <Text style={[styles.engineText, { color: colors.textSecondary }]}>
              Imported via {medication.ocrEngine}
              {medication.ocrConfidence !== undefined
                ? ` • ${Math.round(medication.ocrConfidence * 100)}% confidence`
                : ''}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        {onEdit ? (
          <TouchableOpacity
            onPress={() => onEdit(medication)}
            style={[styles.actionButton, { backgroundColor: colors.primarySoft }]}
          >
            <Text style={[styles.actionText, { color: colors.primary }]}>Review</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={handleDelete}
          style={[styles.actionButton, { backgroundColor: `${colors.danger}18` }]}
        >
          <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rxBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rxBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  bodyRow: {
    flexDirection: 'row',
    gap: 12,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: '#ddd',
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  dosage: {
    fontSize: 14,
    marginBottom: 6,
  },
  instructions: {
    fontSize: 13,
    lineHeight: 18,
  },
  timesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  timeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  stockText: {
    fontSize: 12,
    fontWeight: '700',
  },
  daysText: {
    fontSize: 12,
    fontWeight: '500',
  },
  engineText: {
    marginTop: 8,
    fontSize: 11,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
