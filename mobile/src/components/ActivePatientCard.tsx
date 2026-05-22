import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../context/ThemeContext';
import { PatientProfile } from '../types';

interface Props {
  patient: PatientProfile;
  medicationCount?: number;
  onManage: () => void;
  onSecondaryAction?: () => void;
  secondaryLabel?: string;
}

export const ActivePatientCard: React.FC<Props> = ({
  patient,
  medicationCount,
  onManage,
  onSecondaryAction,
  secondaryLabel,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.paper, borderColor: colors.border }]}>
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
          <Text style={[styles.badgeText, { color: colors.primary }]}>Patient</Text>
        </View>
        <Text style={[styles.relationship, { color: colors.textSecondary }]}>
          {patient.relationship}
        </Text>
      </View>

      <Text style={[styles.name, { color: colors.text }]}>{patient.name}</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>
        {medicationCount !== undefined
          ? `${medicationCount} medication record${medicationCount === 1 ? '' : 's'}`
          : patient.notes || 'Keep profile, doctor, and pharmacy details together.'}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={onManage}
        >
          <Text style={styles.primaryButtonText}>Manage profiles</Text>
        </TouchableOpacity>
        {onSecondaryAction && secondaryLabel ? (
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={onSecondaryAction}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              {secondaryLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  relationship: {
    fontSize: 12,
    fontWeight: '700',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 10,
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  secondaryButton: {
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontWeight: '700',
  },
});
