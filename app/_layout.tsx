import '../global.css';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { api, clearToken, getToken } from '~/utils/api';

export const unstable_settings = {
  initialRouteName: 'auth',
};

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
