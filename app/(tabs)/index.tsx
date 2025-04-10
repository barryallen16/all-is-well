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

interface TranscriptionResponseData {
  text: string;
}

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
    confessionSectionHeight.value = isConfessionSectionOpen ? 0 : 200; // Adjusted height
  };

  const toggleThoughtsSection = () => {
    setIsThoughtsSectionOpen(!isThoughtsSectionOpen);
    thoughtsSectionHeight.value = isThoughtsSectionOpen ? 0 : 100;
  };


  useEffect(() => {
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

  async function StartRecording() {
    try {
      if (permissionResponse?.status !== 'granted') {
        const permission = await requestPermission();
        if (!permission.granted) {
          Alert.alert('Permission Denied', 'Microphone access is needed to proceed.');
          return;
        }
      }
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setAudioUri(null);
      setTranscription(null);
      setRisk(null);
      setMessage(null);
      setError(null);
      setInputText('');
      setIsProcessing(false);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  }

  async function StopRecording() {
    try {
      if (!recording) return;

      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setAudioUri(uri);
      console.log('Recording saved at:', uri);
      setRecording(null);
      setIsProcessing(true);
      if (uri) {
        await transcribeAudio(uri);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('Error', 'Could not stop recording. Please try again.');
      setError('Failed to stop recording.');
    } finally {
      setRecording(null);
    }
  }

  async function transcribeAudio(audioUri: string) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(audioUri);
      if (!fileInfo.exists) {
        throw new Error('Audio file not found.');
      }

      const formData = new FormData();
      formData.append('file', {
        uri: audioUri,
        name: 'audio.m4a',
        type: 'audio/m4a',
      });

      const response = await flaskApiClient.post<TranscriptionResponseData>(
        '/transcribe',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (response.ok && response.data) {
        const transcriptionText = response.data.text;
        setTranscription(transcriptionText);
        console.log(`Transcription: ${transcriptionText}`);
        await predictRisk(transcriptionText);
      } else {
        console.error('Transcription failed', response.problem, response.data);
        setError('Transcription failed. Please try again.');
      }
    } catch (err) {
      console.error('Error transcribing:', err);
      setError('An error occurred during transcription.');
    } finally {
      if (audioUri) {
        await FileSystem.deleteAsync(audioUri).catch((err) => {
          console.error('Failed to delete audio file:', err);
        });
      }
      setIsProcessing(false);
    }
  }

  async function predictRisk(text: string) {
    try {
      setIsProcessing(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await flaskApiClient.post<FlaskResponseData>('/predict_text', { text }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok && response.data) {
        const { risk, message } = response.data;
        setRisk(risk as RiskLevel); // Cast to RiskLevel
        setMessage(message);
        console.log(`Predicted Risk: ${risk}, Message: ${message}`);
      } else {
        console.error('Risk prediction failed', response.problem, response.data);
        setError('Failed to predict risk.');
      }
    } catch (err) {
      console.error('Error predicting risk:', err);
      setError('An error occurred during risk prediction.');
    } finally {
      setIsProcessing(false);
    }
  }

  const handleTextSubmit = async () => {
    if (!inputText.trim()) {
      Alert.alert('Error', 'Please enter some text to analyze.');
      return;
    }
    setTranscription(null);
    setRisk(null);
    setMessage(null);
    setError(null);
    await predictRisk(inputText);
    Keyboard.dismiss();
  };

  const handleConfessionSubmit = async () => {
    if (!confessionText.trim()) {
      Alert.alert('Error', 'Please enter a confession to submit.');
      return;
    }

    if (confessionText.length > MAX_CONFESSION_LENGTH) {
      Alert.alert('Error', `Confession must be ${MAX_CONFESSION_LENGTH} characters or less.`);
      return;
    }

    try {
      setIsProcessing(true);
      const { data, error } = await supabase
        .from('confessions')
        .insert({ content: confessionText })
        .select('id, content, created_at')
        .single();

      if (error) {
        console.error('Failed to submit confession:', error.message);
        if (error.message.includes('permission denied')) {
          Alert.alert(
            'Permission Error',
            'You do not have permission to submit a confession. Please try signing in again.'
          );
        } else {
          Alert.alert('Error', 'Failed to submit your confession. Please try again.');
        }
      } else {
        Alert.alert('Success', 'Your confession has been submitted anonymously.');
        setConfessionText('');
        Keyboard.dismiss();
      }
    } catch (err) {
      console.error('Error submitting confession:', err);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

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

            <View className="items-center mb-6">
              <Text className="text-white text-lg font-semibold mb-3">Record Your Thoughts</Text>
              {!recording ? (
                <Pressable
                  className="flex-row items-center bg-green-600 py-3 px-6 rounded-full shadow-lg"
                  onPress={StartRecording}
                >
                  <MaterialIcons name="mic" size={24} color="#ffffff" />
                  <Text className="text-white text-lg font-semibold ml-2">Start Recording</Text>
                </Pressable>
              ) : (
                <Pressable
                  className="flex-row items-center bg-red-600 py-3 px-6 rounded-full shadow-lg"
                  onPress={StopRecording}
                >
                  <MaterialIcons name="stop" size={24} color="#ffffff" />
                  <Text className="text-white text-lg font-semibold ml-2">Stop Recording</Text>
                </Pressable>
              )}
            </View>

            <View className="bg-gray-800 rounded-xl p-4 mb-4 shadow-md">
              <Pressable onPress={toggleConfessionSection} className="flex-row justify-between items-center">
                <Text className="text-white text-lg font-semibold">Share a Confession</Text>
                <MaterialIcons
                  name={isConfessionSectionOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={24}
                  color="#A7F3D0"
                />
              </Pressable>
              <Animated.View style={confessionSectionStyle}>
                <TextInput
                  className="bg-gray-700 text-white text-base p-3 rounded-lg mt-3 h-32"
                  placeholder="Write your confession here..."
                  placeholderTextColor="#A0A0A0"
                  value={confessionText}
                  onChangeText={setConfessionText}
                  multiline
                  maxLength={MAX_CONFESSION_LENGTH}
                />
                <Text className="text-gray-400 text-sm mt-2 self-end">
                  {confessionText.length}/{MAX_CONFESSION_LENGTH}
                </Text>
                <Pressable
                  className="bg-purple-600 py-3 px-6 rounded-lg mt-3 self-center shadow-md"
                  onPress={handleConfessionSubmit}
                >
                  <Text className="text-white text-base font-semibold">Submit Confession</Text>
                </Pressable>
              </Animated.View>
            </View>

            <View className="bg-gray-800 rounded-xl p-4 mb-4 shadow-md ">
              <Pressable onPress={toggleThoughtsSection} className="flex-row justify-between items-center">
                <Text className="text-white text-lg font-semibold">Type Your Thoughts</Text>
                <MaterialIcons
                  name={isThoughtsSectionOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={24}
                  color="#A7F3D0"
                />
              </Pressable>
              <Animated.View style={thoughtsSectionStyle}>
                <TextInput
                  className="bg-gray-700 text-white text-base p-3 rounded-lg mt-3 "
                  placeholder="Enter your thoughts here..."
                  placeholderTextColor="#A0A0A0"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                />
                <Pressable
                  className="bg-blue-600 py-3 px-6 rounded-lg mt-3 self-center shadow-md"
                  onPress={handleTextSubmit}
                >
                  <Text className="text-white text-base font-semibold">Submit</Text>
                </Pressable>
              </Animated.View>
            </View>

            {(transcription || risk || message) && (
              <View className="bg-gray-800 rounded-xl p-4 mb-4 shadow-md">
                <Text className="text-white text-lg font-semibold mb-3">Results</Text>
                {transcription && (
                  <View className="mb-3">
                    <Text className="text-white text-base font-medium">Transcription:</Text>
                    <Text className="text-gray-300 text-base mt-1">{transcription}</Text>
                  </View>
                )}
                {risk && (
                  <View className="mb-3">
                    <Text className="text-white text-base font-medium">Predicted Risk:</Text>
                    <Text className="text-gray-300 text-base mt-1">{risk}</Text>
                  </View>
                )}
                {message && (
                  <View>
                    <Text className="text-white text-base font-medium">Message for You:</Text>
                    <Text className="text-gray-300 text-base mt-1">{message}</Text>
                  </View>
                )}
              </View>
            )}

            {error && (
              <Text className="text-red-400 text-base mt-4 text-center">{error}</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}