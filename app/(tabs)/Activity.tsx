import { View, Text, Pressable, Alert, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { MeshGradientView } from 'expo-mesh-gradient';
import { api, authHeaders } from '~/utils/api';

interface Checkin {
  id: number;
  local_date: string;
  activity: string;
  created_at: string;
}

interface CheckinsResponse {
  streak: number;
  checkins: Checkin[];
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

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default function Activity() {
  const [dailyActivity, setDailyActivity] = useState<string>('');
  const [streak, setStreak] = useState<number>(0);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [isActivityCompleted, setIsActivityCompleted] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCurrentDate = () => formatLocalDate(new Date());

  const loadCheckins = async () => {
    try {
      const today = getCurrentDate();
      const response = await api.get<CheckinsResponse>(`/checkins?today=${today}`, undefined, {
        headers: await authHeaders(),
      });

      if (!response.ok || !response.data) {
        setError('Failed to load your check-ins.');
        return;
      }

      setStreak(response.data.streak);
      setCheckins(response.data.checkins);
      setIsActivityCompleted(
        response.data.checkins.some((checkin) => checkin.local_date === today)
      );
      setError(null);
    } catch (err) {
      console.error('Failed to load check-ins', err);
      setError('Failed to load your check-ins.');
    }
  };

  const setDailyActivityForToday = () => {
    const today = new Date();
    const dayOfYear = Math.floor(
      (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
        Date.UTC(today.getFullYear(), 0, 0)) /
        86400000
    );
    const index = dayOfYear % mentalHealthActivities.length;
    setDailyActivity(mentalHealthActivities[index]);
  };

  const handleActivityComplete = async () => {
    if (!dailyActivity) return;
    if (isActivityCompleted) {
      Alert.alert('Nice!', 'You’ve already completed today’s activity.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.post(
        '/checkins',
        { local_date: getCurrentDate(), activity: dailyActivity },
        { headers: await authHeaders() }
      );

      if (!response.ok) {
        Alert.alert('Error', 'Failed to save your check-in. Please try again.');
        return;
      }

      await loadCheckins();
      Alert.alert('Well Done!', 'You completed today’s activity.');
    } catch (err) {
      console.error('Failed to save check-in', err);
      Alert.alert('Error', 'Failed to save your check-in. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    setDailyActivityForToday();
    loadCheckins();
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
          <Text className="text-3xl font-extrabold tracking-wide text-white">Activity</Text>
        </View>

        <View className="flex-1 p-4">
          <View className="mb-4 rounded-xl bg-gray-800 p-4 shadow-md">
            <Text className="mb-3 text-lg font-semibold text-white">Your Daily Activity</Text>
            <Text className="mb-3 text-base text-gray-300">
              {dailyActivity || 'Loading activity...'}
            </Text>
            <Pressable
              className={`self-center rounded-lg px-4 py-2 shadow-md ${
                !dailyActivity || isActivityCompleted || isSaving ? 'bg-gray-600' : 'bg-green-600'
              }`}
              onPress={handleActivityComplete}
              disabled={!dailyActivity || isActivityCompleted || isSaving}>
              <Text className="text-base font-semibold text-white">
                {isSaving ? 'Saving...' : isActivityCompleted ? 'Completed!' : 'Mark as Done'}
              </Text>
            </Pressable>
            <Text className="mt-3 text-center text-base text-white">
              Streak: {streak} day{streak === 1 ? '' : 's'}
            </Text>

            {checkins.length > 0 && (
              <View className="mt-4">
                <Text className="mb-2 text-base font-semibold text-white">Recent check-ins</Text>
                {checkins.slice(0, 7).map((checkin) => (
                  <View key={checkin.id} className="mb-2 rounded-lg bg-gray-700 p-2">
                    <Text className="text-sm font-medium text-gray-300">
                      {formatDisplayDate(checkin.local_date)}
                    </Text>
                    <Text className="mt-1 text-sm text-white">{checkin.activity}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {error && <Text className="mt-4 text-center text-base text-red-400">{error}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
