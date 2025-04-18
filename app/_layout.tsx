import '../global.css';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { api, clearToken, getToken } from '~/utils/api';
import { hasSeenOnboarding } from '~/utils/onboarding';

export const unstable_settings = {
  initialRouteName: 'auth',
};

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        if (!(await hasSeenOnboarding())) {
          router.replace('/onboarding');
          return;
        }

        const token = await getToken();
        if (!token) {
          router.replace('/auth');
          return;
        }

        const response = await api.get('/auth/me', undefined, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          await clearToken();
          router.replace('/auth');
        } else {
          router.replace('/(tabs)');
        }
      } catch (err) {
        console.error('Failed to route on launch', err);
        router.replace('/auth');
      }
    })();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#111827' },
        }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
