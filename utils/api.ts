import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'apisauce';
import { router } from 'expo-router';

const TOKEN_KEY = 'auth_token';

export const api = create({
  baseURL: process.env.EXPO_PUBLIC_FLASK_BACKEND_ENDPOINT as string,
});

export const getToken = () => AsyncStorage.getItem(TOKEN_KEY);

export const setToken = (token: string) => AsyncStorage.setItem(TOKEN_KEY, token);

export const clearToken = () => AsyncStorage.removeItem(TOKEN_KEY);

export const authHeaders = async (): Promise<Record<string, string>> => {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

api.addResponseTransform((response) => {
  if (response.status === 401) {
    void clearToken();
    if (!response.config?.url?.includes('/auth/')) {
      router.replace('/auth');
    }
  }
  return response;
});
