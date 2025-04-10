import { View, Text, Pressable, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, ScrollView, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useEffect, useState } from 'react';
import { create } from 'apisauce';
import * as FileSystem from 'expo-file-system';
import FormData from 'form-data';
import { MaterialIcons } from '@expo/vector-icons';
import { MeshGradientView } from 'expo-mesh-gradient';
import { supabase } from '~/utils/supabase';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

interface FlaskResponseData {
  risk: string;
  message: string;
}

const flaskApiClient = create({
  baseURL: process.env.EXPO_PUBLIC_FLASK_BACKEND_ENDPOINT as string,
  headers: {
    'Content-Type': 'application/json',
  },
});

const points: [number, number][] = [
  [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
  [0.0, 0.5], [0.5, 0.5], [1.0, 0.5],
  [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
];

type RiskLevel = 'Low' | 'Medium' | 'High';
interface ColorSet {
  gradientColors: string[];
  solidColor: string;
}
const colorSets: Record<RiskLevel, ColorSet> = {
  Low: {
    gradientColors: [
      "#A7F3D0", "#34D399", "#6EE7B7",
      "#AEDFF7", "#60A5FA", "#93C5FD",
      "#D1FAE5", "#BFDBFE", "#E5E7EB",
    ],
    solidColor: "#A7F3D0",
  },
  Medium: {
    gradientColors: [
      "#AEDFF7", "#60A5FA", "#93C5FD",
      "#E9D5FF", "#A78BFA", "#C4B5FD",
      "#FBCFE8", "#D1D5DB", "#BFDBFE",
    ],
    solidColor: "#AEDFF7",
  },
  High: {
    gradientColors: [
      "#E9D5FF", "#A78BFA", "#C4B5FD",
      "#FBCFE8", "#F9A8D4", "#F3D7E8",
      "#D1D5DB", "#E5E7EB", "#C4B5FD",
    ],
    solidColor: "#E9D5FF",
  },
};
const mentalHealthActivities = [
  "Take a 10-minute walk outside to enjoy fresh air and nature.",
  "Practice deep breathing for 5 minutes to relax your mind.",
  "Write down 3 things you’re grateful for today.",
  "Listen to your favorite song and let yourself feel the rhythm.",
  "Spend 15 minutes journaling your thoughts and feelings.",
  "Try a quick stretch or yoga pose to release tension.",
  "Call or text a friend to share a positive moment.",
  "Meditate for 5 minutes, focusing on your breath.",
  "Drink a glass of water and take a moment to hydrate mindfully.",
  "Do a random act of kindness for someone around you.",
  "Read a few pages of a book that inspires you.",
  "Step away from screens for 10 minutes and rest your eyes.",
];

export default function Home() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [risk, setRisk] = useState<RiskLevel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [confessionText, setConfessionText] = useState<string>('');
  const [dailyActivity, setDailyActivity] = useState<string>('');
  const [streak, setStreak] = useState<number>(0);
  const [isActivityCompleted, setIsActivityCompleted] = useState<boolean>(false);
  const [lastCompletionDate, setLastCompletionDate] = useState<string | null>(null);

  const confessionSectionHeight = useSharedValue(0);
  const thoughtsSectionHeight = useSharedValue(0);
  const [isConfessionSectionOpen, setIsConfessionSectionOpen] = useState(false);
  const [isThoughtsSectionOpen, setIsThoughtsSectionOpen] = useState(false);

  const MAX_CONFESSION_LENGTH = 500;

  const confessionSectionStyle = useAnimatedStyle(() => ({
    height: withTiming(confessionSectionHeight.value, { duration: 300 }),
    opacity: withTiming(confessionSectionHeight.value > 0 ? 1 : 0, { duration: 300 }),
  }));

  const thoughtsSectionStyle = useAnimatedStyle(() => ({
    height: withTiming(thoughtsSectionHeight.value, { duration: 300 }),
    opacity: withTiming(thoughtsSectionHeight.value > 0 ? 1 : 0, { duration: 300 }),
  }));

  const toggleConfessionSection = () => {
    setIsConfessionSectionOpen(!isConfessionSectionOpen);
    confessionSectionHeight.value = isConfessionSectionOpen ? 0 : 200;
  };

  const toggleThoughtsSection = () => {
    setIsThoughtsSectionOpen(!isThoughtsSectionOpen);
    thoughtsSectionHeight.value = isThoughtsSectionOpen ? 0 : 100;
  };

  const getCurrentDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const loadStreakData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { data, error } = await supabase
        .from('streaks')
        .select('streak, last_completion_date')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching streak:', error.message);
        return;
      }

      const today = getCurrentDate();
      if (data) {
        const { streak: storedStreak, last_completion_date: storedDate } = data;
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (storedDate === today) {
          setStreak(storedStreak);
          setIsActivityCompleted(true);
        } else if (storedDate === yesterdayStr) {
          setStreak(storedStreak);
          setIsActivityCompleted(false);
        } else {
          setStreak(0);
          setIsActivityCompleted(false);
        }
        setLastCompletionDate(storedDate);
      } else {
        setStreak(0);
        setIsActivityCompleted(false);
        setLastCompletionDate(null);
      }
    } catch (err) {
      console.error('Error loading streak data:', err);
    }
  };

  const saveStreakData = async (newStreak: number, completionDate: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const streakData = {
        user_id: user.id,
        streak: newStreak,
        last_completion_date: completionDate,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('streaks')
        .upsert(streakData, { onConflict: 'user_id' });

      if (error) {
        console.error('Error saving streak:', error.message);
        Alert.alert('Error', 'Failed to save your streak. Please try again.');
      }
    } catch (err) {
      console.error('Error saving streak data:', err);
    }
  };

  const setDailyActivityForToday = () => {
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
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
    Alert.alert('Well Done!', `You completed today’s activity! Streak: ${newStreak} day${newStreak === 1 ? '' : 's'}`);
  };

  useEffect(() => {
    setDailyActivityForToday();
    loadStreakData();
    // [Existing auth and permission useEffect logic]
    (async () => {
      if (permissionResponse?.status !== 'granted') {
        const permission = await requestPermission();
        if (!permission.granted) {
          Alert.alert(
            'Permission Denied',
            'Microphone access is required to record audio. Please enable it in settings.'
          );
        }
      }
    })();
  }, [permissionResponse, requestPermission]);

  // [Existing StartRecording, StopRecording, transcribeAudio, predictRisk, handleTextSubmit, handleConfessionSubmit remain unchanged]

  const currentColors = risk ? colorSets[risk] : colorSets.Low;
  const backgroundColor = Platform.OS === 'android' ? currentColors.solidColor : 'transparent';

  return (
    <SafeAreaView className="flex-1 relative" style={{ backgroundColor }}>
      {Platform.OS === 'ios' && (
        <MeshGradientView
          style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          columns={3}
          ignoresSafeArea={false}
          rows={3}
          colors={currentColors.gradientColors}
          points={points}
        />
      )}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
        >
          <View className="bg-gray-900 p-5 items-center border-b border-gray-700 shadow-md">
            <Text className="text-white text-3xl font-extrabold tracking-wide">All Is Well</Text>
          </View>
          <View className="flex-1 p-4">
            {isProcessing && (
              <ActivityIndicator size="large" color="#A7F3D0" className="mb-4" />
            )}
            <View className="bg-gray-800 rounded-xl p-4 mb-4 shadow-md">
              <Text className="text-white text-lg font-semibold mb-3">Your Daily Activity</Text>
              <Text className="text-gray-300 text-base mb-3">{dailyActivity || "Loading activity..."}</Text>
              <Pressable
                className={`py-2 px-4 rounded-lg self-center shadow-md ${isActivityCompleted ? 'bg-gray-600' : 'bg-green-600'}`}
                onPress={handleActivityComplete}
                disabled={isActivityCompleted}
              >
                <Text className="text-white text-base font-semibold">
                  {isActivityCompleted ? 'Completed!' : 'Mark as Done'}
                </Text>
              </Pressable>
              <Text className="text-white text-base mt-3 text-center">Streak: {streak} day{streak === 1 ? '' : 's'}</Text>
            </View>
            {/* [Existing UI sections remain unchanged] */}
            {error && (
              <Text className="text-red-400 text-base mt-4 text-center">{error}</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}