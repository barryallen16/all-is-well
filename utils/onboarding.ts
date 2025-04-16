import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'onboarding_seen';

export const hasSeenOnboarding = async () => {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value === '1';
};

export const markOnboardingSeen = () => AsyncStorage.setItem(ONBOARDING_KEY, '1');
