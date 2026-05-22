import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ThemeProvider } from '../src/context/ThemeContext';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="tabs" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
