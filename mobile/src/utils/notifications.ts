import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { Medication } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const requestNotificationPermissions = async (): Promise<boolean> => {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

export const scheduleNotification = async (
  medication: Medication,
  time: string
): Promise<string> => {
  try {
    const [hoursStr, minutesStr] = time.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);
    const weekday = new Date(medication.startDate).getDay() + 1;

    const trigger =
      medication.frequency === 'weekly'
        ? ({
            type: 'calendar',
            weekday,
            hour: hours,
            minute: minutes,
            repeats: true,
          } as Notifications.NotificationTriggerInput)
        : Platform.OS === 'android'
          ? ({
              type: 'daily',
              hour: hours,
              minute: minutes,
            } as Notifications.NotificationTriggerInput)
          : ({
              type: 'calendar',
              hour: hours,
              minute: minutes,
              repeats: true,
            } as Notifications.NotificationTriggerInput);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Medication Reminder',
        body: `Time to take ${medication.name} (${medication.dosage})`,
        data: {
          medicationId: medication.id,
          medicationName: medication.name,
          time,
        },
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: 'medication-reminders' } : {}),
      },
      trigger,
    });

    console.log(`Scheduled notification ${notificationId} for ${time}`);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    throw error;
  }
};

export const scheduleAllNotificationsForMedication = async (
  medication: Medication
): Promise<string[]> => {
  const notificationIds: string[] = [];

  for (const time of medication.times) {
    try {
      const id = await scheduleNotification(medication, time);
      notificationIds.push(id);
    } catch (error) {
      console.error(`Failed to schedule notification for ${time}:`, error);
    }
  }

  return notificationIds;
};

export const cancelNotification = async (notificationId: string): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log(`Cancelled notification ${notificationId}`);
  } catch (error) {
    console.error('Error canceling notification:', error);
  }
};

export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('Cancelled all notifications');
  } catch (error) {
    console.error('Error canceling all notifications:', error);
  }
};

export const getAllScheduledNotifications = async () => {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    return notifications;
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
};

export const setupNotificationChannel = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('medication-reminders', {
      name: 'Medication Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      sound: 'default',
    });
  }
};
