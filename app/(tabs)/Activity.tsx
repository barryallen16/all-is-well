import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  ErrorBanner,
  GradientBackground,
  ScreenHeader,
  tabularNums,
} from '~/components/ui';
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
    if (!dailyActivity || isActivityCompleted) return;

    setIsSaving(true);
    try {
      const response = await api.post(
        '/checkins',
        { local_date: getCurrentDate(), activity: dailyActivity },
        { headers: await authHeaders() }
      );

      if (!response.ok) {
        setError('Failed to save your check-in. Please try again.');
        return;
      }

      await loadCheckins();
    } catch (err) {
      console.error('Failed to save check-in', err);
      setError('Failed to save your check-in. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    setDailyActivityForToday();
    loadCheckins();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <ScreenHeader
        title="Activity"
        subtitle="Small steps, once a day."
        right={
          <View
            accessible
            accessibilityLabel={`${streak} day streak`}
            className="flex-row items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2">
            <MaterialIcons name="local-fire-department" size={18} color="#FBBF24" />
            <Text className="text-base font-semibold text-white" style={tabularNums}>
              {streak}
            </Text>
            <Text className="text-xs text-gray-400">{streak === 1 ? 'day' : 'days'}</Text>
          </View>
        }
      />

      <View className="flex-1">
        <GradientBackground colors={gradientColors} solid="#A7F3D0" />

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          <View className="w-full max-w-2xl gap-4 self-center">
            <Card>
              <Text className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Today
              </Text>
              <Text className="mt-2 text-lg font-semibold leading-7 text-white">
                {dailyActivity || 'Loading activity...'}
              </Text>

              {isActivityCompleted ? (
                <View className="mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-5">
                  <MaterialIcons name="check-circle" size={20} color="#6EE7B7" />
                  <Text className="text-base font-semibold text-emerald-300">Done for today</Text>
                </View>
              ) : (
                <Button
                  label="Mark as done"
                  icon="check"
                  onPress={handleActivityComplete}
                  loading={isSaving}
                  disabled={!dailyActivity}
                  className="mt-4"
                />
              )}

              {isActivityCompleted && (
                <Text className="mt-2 text-center text-sm text-gray-400">
                  Come back tomorrow for a new one.
                </Text>
              )}
            </Card>

            {error && <ErrorBanner>{error}</ErrorBanner>}

            <Card>
              <Text className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Recent check-ins
              </Text>

              {checkins.length === 0 ? (
                <Text className="mt-3 text-sm text-gray-400">
                  Nothing yet. Today is a good start.
                </Text>
              ) : (
                checkins.slice(0, 7).map((checkin) => (
                  <View
                    key={checkin.id}
                    className="mt-2 flex-row items-start gap-3 rounded-lg bg-white/5 px-3 py-2.5">
                    <MaterialIcons name="check-circle" size={18} color="#6EE7B7" />
                    <View className="flex-1">
                      <Text className="text-xs text-gray-400">
                        {formatDisplayDate(checkin.local_date)}
                      </Text>
                      <Text className="mt-0.5 text-sm leading-5 text-gray-200">
                        {checkin.activity}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
