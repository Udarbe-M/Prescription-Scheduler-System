import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
import { PatientProfile } from '../../src/types';
import {
  DEFAULT_PATIENT_ID,
  deletePatient,
  getActivePatientId,
  loadPatients,
  setActivePatientId,
  upsertPatient,
} from '../../src/utils/patientStorage';
import { loadMedicationsByPatient } from '../../src/utils/storage';

const emptyForm = (): PatientProfile => ({
  id: '',
  name: '',
  relationship: 'Self',
  birthDate: '',
  doctorName: '',
  doctorPhone: '',
  pharmacyName: '',
  pharmacyPhone: '',
  notes: '',
  createdAt: new Date().toISOString(),
});

export default function PatientsScreen() {
  const { colors } = useTheme();
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [activePatientId, setLocalActivePatientId] = useState(DEFAULT_PATIENT_ID);
  const [form, setForm] = useState<PatientProfile>(emptyForm());
  const [isEditing, setIsEditing] = useState(false);

  const loadState = useCallback(async () => {
    const [savedPatients, selectedPatientId] = await Promise.all([
      loadPatients(),
      getActivePatientId(),
    ]);
    setPatients(savedPatients);
    setLocalActivePatientId(selectedPatientId);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadState();
    }, [loadState])
  );

  const resetForm = () => {
    setForm(emptyForm());
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Please add a profile name before saving.');
      return;
    }

    const patient: PatientProfile = {
      ...form,
      id: form.id || `${Date.now()}`,
      name: form.name.trim(),
      relationship: form.relationship.trim() || 'Family member',
      createdAt: form.createdAt || new Date().toISOString(),
    };

    await upsertPatient(patient);
    if (patients.length === 0) {
      await setActivePatientId(patient.id);
    }
    await loadState();
    resetForm();
  };

  const handleEdit = (patient: PatientProfile) => {
    setForm(patient);
    setIsEditing(true);
  };

  const handleDelete = async (patient: PatientProfile) => {
    const medications = await loadMedicationsByPatient(patient.id);
    if (medications.length > 0) {
      Alert.alert(
        'Profile still in use',
        `Remove or reassign ${medications.length} medication record(s) before deleting this profile.`
      );
      return;
    }

    Alert.alert('Delete profile', `Remove ${patient.name} from this app?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePatient(patient.id);
          await loadState();
        },
      },
    ]);
  };

  const handleActivate = async (patient: PatientProfile) => {
    await setActivePatientId(patient.id);
    setLocalActivePatientId(patient.id);
    Alert.alert('Active profile changed', `${patient.name} is now the active prescription profile.`);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Patient Profiles</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Keep separate prescription libraries, doctor details, and schedules for yourself or family members.
        </Text>
      </View>

      <View style={styles.cardList}>
        {patients.map((patient) => {
          const isActive = patient.id === activePatientId;
          return (
            <View
              key={patient.id}
              style={[styles.patientCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.patientHeader}>
                <View>
                  <Text style={[styles.patientName, { color: colors.text }]}>{patient.name}</Text>
                  <Text style={[styles.patientMeta, { color: colors.textSecondary }]}>
                    {patient.relationship}
                    {patient.birthDate ? ` • ${patient.birthDate}` : ''}
                  </Text>
                </View>
                {isActive ? (
                  <View style={[styles.activeBadge, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.activeBadgeText, { color: colors.primary }]}>Active</Text>
                  </View>
                ) : null}
              </View>

              <Text style={[styles.detailLine, { color: colors.textSecondary }]}>
                Doctor: {patient.doctorName || 'Not saved'}
              </Text>
              <Text style={[styles.detailLine, { color: colors.textSecondary }]}>
                Pharmacy: {patient.pharmacyName || 'Not saved'}
              </Text>
              {patient.notes ? (
                <Text style={[styles.detailLine, { color: colors.textSecondary }]}>{patient.notes}</Text>
              ) : null}

              <View style={styles.actionRow}>
                {!isActive ? (
                  <TouchableOpacity
                    style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                    onPress={() => handleActivate(patient)}
                  >
                    <Text style={styles.primaryActionText}>Use this profile</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.primaryAction, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.activeLabel, { color: colors.primary }]}>Current profile</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.secondaryAction, { borderColor: colors.border }]}
                  onPress={() => handleEdit(patient)}
                >
                  <Text style={[styles.secondaryActionText, { color: colors.text }]}>Edit</Text>
                </TouchableOpacity>
                {patient.id !== DEFAULT_PATIENT_ID ? (
                  <TouchableOpacity
                    style={[styles.secondaryAction, { borderColor: colors.border }]}
                    onPress={() => handleDelete(patient)}
                  >
                    <Text style={[styles.secondaryActionText, { color: colors.danger }]}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.formCard, { backgroundColor: colors.paper, borderColor: colors.border }]}>
        <Text style={[styles.formTitle, { color: colors.text }]}>
          {isEditing ? 'Edit Profile' : 'Add Profile'}
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
        <TextInput
          value={form.name}
          onChangeText={(value) => setForm((current) => ({ ...current, name: value }))}
          placeholder="e.g., Mama, Lola, My Prescriptions"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Relationship</Text>
            <TextInput
              value={form.relationship}
              onChangeText={(value) => setForm((current) => ({ ...current, relationship: value }))}
              placeholder="Self"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Birth date</Text>
            <TextInput
              value={form.birthDate}
              onChangeText={(value) => setForm((current) => ({ ...current, birthDate: value }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            />
          </View>
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Doctor</Text>
        <TextInput
          value={form.doctorName}
          onChangeText={(value) => setForm((current) => ({ ...current, doctorName: value }))}
          placeholder="Prescribing doctor"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Doctor phone</Text>
        <TextInput
          value={form.doctorPhone}
          onChangeText={(value) => setForm((current) => ({ ...current, doctorPhone: value }))}
          placeholder="Clinic phone"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Pharmacy</Text>
        <TextInput
          value={form.pharmacyName}
          onChangeText={(value) => setForm((current) => ({ ...current, pharmacyName: value }))}
          placeholder="Preferred pharmacy"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Pharmacy phone</Text>
        <TextInput
          value={form.pharmacyPhone}
          onChangeText={(value) => setForm((current) => ({ ...current, pharmacyPhone: value }))}
          placeholder="Pharmacy phone"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Care notes</Text>
        <TextInput
          value={form.notes}
          onChangeText={(value) => setForm((current) => ({ ...current, notes: value }))}
          placeholder="Allergies, refill preferences, or reminders"
          placeholderTextColor={colors.textSecondary}
          multiline
          style={[
            styles.input,
            styles.textArea,
            { backgroundColor: colors.card, borderColor: colors.border, color: colors.text },
          ]}
        />

        <View style={styles.formActions}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary }]}
            onPress={handleSave}
          >
            <Text style={styles.saveButtonText}>{isEditing ? 'Update profile' : 'Save profile'}</Text>
          </TouchableOpacity>
          {isEditing ? (
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={resetForm}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
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
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 31,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  cardList: {
    paddingHorizontal: 16,
    gap: 14,
  },
  patientCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  patientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  patientName: {
    fontSize: 20,
    fontWeight: '800',
  },
  patientMeta: {
    marginTop: 4,
    fontSize: 12,
  },
  activeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailLine: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryAction: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '800',
  },
  activeLabel: {
    fontWeight: '800',
  },
  secondaryAction: {
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontWeight: '700',
  },
  formCard: {
    margin: 16,
    marginTop: 20,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  label: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  cancelButton: {
    paddingHorizontal: 16,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontWeight: '700',
  },
});
