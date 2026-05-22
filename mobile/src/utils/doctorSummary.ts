import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { Medication, PatientProfile } from '../types';
import { TakenMedication } from './scheduleStorage';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderMedicationRows = (medications: Medication[]): string =>
  medications
    .map(
      (medication) => `
        <tr>
          <td>${escapeHtml(medication.name)}</td>
          <td>${escapeHtml(medication.dosage)}</td>
          <td>${escapeHtml(medication.frequency)}</td>
          <td>${escapeHtml(medication.times.join(', '))}</td>
          <td>${medication.quantity ?? '--'}</td>
          <td>${escapeHtml(medication.instructions || '')}</td>
        </tr>
      `
    )
    .join('');

const renderDoseRows = (history: TakenMedication[], medications: Medication[]): string =>
  history
    .slice(0, 12)
    .map((entry) => {
      const medication = medications.find((item) => item.id === entry.medicationId);
      return `
        <tr>
          <td>${escapeHtml(medication?.name || 'Medication')}</td>
          <td>${escapeHtml(entry.date)}</td>
          <td>${escapeHtml(entry.time)}</td>
        </tr>
      `;
    })
    .join('');

const buildSummaryHtml = (
  patient: PatientProfile,
  medications: Medication[],
  history: TakenMedication[]
): string => {
  const generatedAt = new Date().toLocaleString();

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body { font-family: Georgia, serif; color: #1f2e38; padding: 28px; background: #f7f1e8; }
          .sheet { background: #fffaf2; border: 1px solid #d8cfc2; border-radius: 18px; padding: 24px; }
          .rx { display: inline-block; background: #d7ebe7; color: #1e6f78; padding: 6px 12px; border-radius: 999px; font-weight: bold; letter-spacing: 0.08em; }
          h1 { margin: 12px 0 4px; font-size: 30px; }
          h2 { margin-top: 28px; font-size: 18px; border-bottom: 1px solid #d8cfc2; padding-bottom: 8px; }
          p, li, td, th { font-size: 12px; line-height: 1.55; }
          .muted { color: #5f6f7c; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
          .card { background: #fff; border: 1px solid #e4dccf; border-radius: 14px; padding: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border-bottom: 1px solid #ebe2d5; text-align: left; padding: 10px 8px; vertical-align: top; }
          th { background: #f0e7d8; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="rx">RX SUMMARY</div>
          <h1>${escapeHtml(patient.name)}</h1>
          <p class="muted">Generated ${escapeHtml(generatedAt)} for doctor or pharmacy review.</p>

          <div class="grid">
            <div class="card">
              <strong>Profile</strong>
              <p>${escapeHtml(patient.relationship)}</p>
              <p>${escapeHtml(patient.birthDate || 'Birth date not provided')}</p>
              <p>${escapeHtml(patient.notes || 'No extra care notes saved')}</p>
            </div>
            <div class="card">
              <strong>Care contacts</strong>
              <p>Doctor: ${escapeHtml(patient.doctorName || 'Not saved')}</p>
              <p>Doctor phone: ${escapeHtml(patient.doctorPhone || 'Not saved')}</p>
              <p>Pharmacy: ${escapeHtml(patient.pharmacyName || 'Not saved')}</p>
              <p>Pharmacy phone: ${escapeHtml(patient.pharmacyPhone || 'Not saved')}</p>
            </div>
          </div>

          <h2>Active Medications</h2>
          <table>
            <thead>
              <tr>
                <th>Medication</th>
                <th>Dosage</th>
                <th>Frequency</th>
                <th>Times</th>
                <th>Stock</th>
                <th>Instructions</th>
              </tr>
            </thead>
            <tbody>
              ${renderMedicationRows(medications)}
            </tbody>
          </table>

          <h2>Recent Dose History</h2>
          <table>
            <thead>
              <tr>
                <th>Medication</th>
                <th>Date</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              ${renderDoseRows(history, medications) || '<tr><td colspan="3">No doses marked yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `;
};

export const exportDoctorSummary = async (
  patient: PatientProfile,
  medications: Medication[],
  history: TakenMedication[]
): Promise<void> => {
  const html = buildSummaryHtml(patient, medications, history);
  const file = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Doctor summary for ${patient.name}`,
      UTI: '.pdf',
    });
  }
};
