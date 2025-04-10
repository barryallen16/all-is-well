import { View, Text, Pressable, Alert, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { MeshGradientView } from 'expo-mesh-gradient';
import { api, authHeaders } from '~/utils/api';

interface StreakData {
  streak: number;
  last_completion_date: string | null;
}

const points: [number, number][] = [
  [0.0, 0.0],
  [0.5, 0.0],
  [1.0, 0.0],
  [0.0, 0.5],
  [0.5, 0.5],
  [1.0, 0.5],
  [0.0, 1.0],
  [0.5, 1.0],
  [1.0, 1.0],
];

const gradientColors = [
  '#A7F3D0',
  '#34D399',
  '#6EE7B7',
  '#AEDFF7',
  '#60A5FA',
  '#93C5FD',
  '#D1FAE5',
  '#BFDBFE',
  '#E5E7EB',
];

const mentalHealthActivities = [
  'Take a 10-minute walk outside to enjoy fresh air and nature.',
  'Practice deep breathing for 5 minutes to relax your mind.',
  'Write down 3 things you’re grateful for today.',
  'Listen to your favorite song and let yourself feel the rhythm.',
  'Spend 15 minutes journaling your thoughts and feelings.',
  'Try a quick stretch or yoga pose to release tension.',
  'Call or text a friend to share a positive moment.',
  'Meditate for 5 minutes, focusing on your breath.',
  'Drink a glass of water and take a moment to hydrate mindfully.',
  'Do a random act of kindness for someone around you.',
  'Read a few pages of a book that inspires you.',
  'Step away from screens for 10 minutes and rest your eyes.',
];

export default function Activity() {
  const [dailyActivity, setDailyActivity] = useState<string>('');
  const [streak, setStreak] = useState<number>(0);
  const [isActivityCompleted, setIsActivityCompleted] = useState<boolean>(false);
  const [lastCompletionDate, setLastCompletionDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getCurrentDate = () => new Date().toISOString().split('T')[0];

  const loadStreakData = async () => {
    const response = await api.get<StreakData>('/streak', undefined, {
      headers: await authHeaders(),
    });

    if (!response.ok || !response.data) {
      setError('Failed to load your streak.');
      return;
    }

    const { streak: storedStreak, last_completion_date: storedDate } = response.data;
    const today = getCurrentDate();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    setLastCompletionDate(storedDate);
    setStreak(storedDate === today || storedDate === yesterdayStr ? storedStreak : 0);
    setIsActivityCompleted(storedDate === today);
    setError(null);
  };

  const saveStreakData = async (newStreak: number, completionDate: string) => {
    const response = await api.put(
      '/streak',
      { streak: newStreak, last_completion_date: completionDate },
      { headers: await authHeaders() }
    );

    if (!response.ok) {
      Alert.alert('Error', 'Failed to save your streak. Please try again.');
    }
  };

  const setDailyActivityForToday = () => {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24
    );
    const index = dayOfYear % mentalHealthActivities.length;
    setDailyActivity(mentalHealthActivities[index]);
  };

  const handleActivityComplete = async () => {
    const today = getCurrentDate();
    if (isActivityCompleted) {
      Alert.alert('Nice!', 'You’ve already completed today’s activity.');
      return;
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let newStreak = streak;
    if (lastCompletionDate === yesterdayStr) {
      newStreak += 1;
    } else if (lastCompletionDate !== today) {
      newStreak = 1;
    }

    setStreak(newStreak);
    setIsActivityCompleted(true);
    setLastCompletionDate(today);
    await saveStreakData(newStreak, today);
    Alert.alert(
      'Well Done!',
      `You completed today’s activity! Streak: ${newStreak} day${newStreak === 1 ? '' : 's'}`
    );
  };

  useEffect(() => {
    setDailyActivityForToday();
    loadStreakData();
  }, []);

  const backgroundColor = Platform.OS === 'android' ? '#A7F3D0' : 'transparent';

  return (
    <SafeAreaView className="relative flex-1" style={{ backgroundColor }}>
      {Platform.OS === 'ios' && (
        <MeshGradientView
          style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          columns={3}
          ignoresSafeArea={false}
          rows={3}
          colors={gradientColors}
          points={points}
        />
      )}

      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}>
        <View className="items-center border-b border-gray-700 bg-gray-900 p-5 shadow-md">
          <Text className="text-3xl font-extrabold tracking-wide text-white">All Is Well</Text>
        </View>

        <View className="flex-1 p-4">
          <View className="mb-4 rounded-xl bg-gray-800 p-4 shadow-md">
            <Text className="mb-3 text-lg font-semibold text-white">Your Daily Activity</Text>
            <Text className="mb-3 text-base text-gray-300">
              {dailyActivity || 'Loading activity...'}
            </Text>
            <Pressable
              className={`self-center rounded-lg px-4 py-2 shadow-md ${
                isActivityCompleted ? 'bg-gray-600' : 'bg-green-600'
              }`}
              onPress={handleActivityComplete}
              disabled={isActivityCompleted}>
              <Text className="text-base font-semibold text-white">
                {isActivityCompleted ? 'Completed!' : 'Mark as Done'}
              </Text>
            </Pressable>
            <Text className="mt-3 text-center text-base text-white">
              Streak: {streak} day{streak === 1 ? '' : 's'}
            </Text>
          </View>

          {error && <Text className="mt-4 text-center text-base text-red-400">{error}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
