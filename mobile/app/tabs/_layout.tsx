import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Alert, TouchableOpacity } from 'react-native';

import { useTheme } from '../../src/context/ThemeContext';
import {
  requestNotificationPermissions,
  setupNotificationChannel,
} from '../../src/utils/notifications';

export default function TabsLayout() {
  const { theme, toggleTheme, colors } = useTheme();

  useEffect(() => {
    const setupNotifications = async () => {
      try {
        await setupNotificationChannel();
        const hasPermission = await requestNotificationPermissions();

        if (!hasPermission) {
          Alert.alert(
            'Notifications Disabled',
            'Please enable notifications in your device settings to receive medication reminders.'
          );
        }
      } catch (error) {
        console.log('Notifications not available:', error);
      }
    };

    setupNotifications();
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerRight: () => (
          <TouchableOpacity
            onPress={() => toggleTheme(theme === 'light' ? 'dark' : 'light')}
            style={{ marginRight: 16 }}
          >
            <Ionicons
              name={theme === 'dark' ? 'sunny' : 'moon'}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inventory',
          headerTitle: 'Prescription Scheduler',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="medkit" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="today-schedule"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add-medication"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="scan" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
