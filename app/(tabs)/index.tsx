import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Keyboard,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import FormData from 'form-data';
import { MaterialIcons } from '@expo/vector-icons';
import { MeshGradientView } from 'expo-mesh-gradient';
import { api, authHeaders } from '~/utils/api';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

interface TranscriptionResponseData {
  text: string;
}

interface CrisisMatch {
  phrase: string;
  kind: string;
  about_self: boolean;
  historical: boolean;
}

interface CrisisResource {
  name: string;
  contact: string;
}

interface AnalysisResult {
  level: 'crisis' | 'support' | 'none';
  crisis: boolean;
  about_self: boolean;
  matched: CrisisMatch[];
  message: string;
  resources: CrisisResource[];
  emergency: string | null;
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

const MAX_RECORDING_SECONDS = 120;

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

type RiskLevel = 'Low' | 'Medium' | 'High';
interface ColorSet {
  gradientColors: string[];
  solidColor: string;
}
const colorSets: Record<RiskLevel, ColorSet> = {
  Low: {
    gradientColors: [
      '#A7F3D0',
      '#34D399',
      '#6EE7B7',
      '#AEDFF7',
      '#60A5FA',
      '#93C5FD',
      '#D1FAE5',
      '#BFDBFE',
      '#E5E7EB',
    ],
    solidColor: '#A7F3D0',
  },
  Medium: {
    gradientColors: [
      '#AEDFF7',
      '#60A5FA',
      '#93C5FD',
      '#E9D5FF',
      '#A78BFA',
      '#C4B5FD',
      '#FBCFE8',
      '#D1D5DB',
      '#BFDBFE',
    ],
    solidColor: '#AEDFF7',
  },
  High: {
    gradientColors: [
      '#E9D5FF',
      '#A78BFA',
      '#C4B5FD',
      '#FBCFE8',
      '#F9A8D4',
      '#F3D7E8',
      '#D1D5DB',
      '#E5E7EB',
      '#C4B5FD',
    ],
    solidColor: '#E9D5FF',
  },
};

export default function Home() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [confessionText, setConfessionText] = useState<string>('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const isStoppingRef = useRef(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [helpResources, setHelpResources] = useState<CrisisResource[]>([]);
  const [helpEmergency, setHelpEmergency] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpError, setHelpError] = useState<string | null>(null);

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
    if (!recording) {
      setRecordingSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setRecordingSeconds((seconds) => Math.min(seconds + 1, MAX_RECORDING_SECONDS));
    }, 1000);
    return () => clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    if (recording && recordingSeconds >= MAX_RECORDING_SECONDS) {
      void StopRecording();
    }
  }, [recording, recordingSeconds]);

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
      setResult(null);
      setError(null);
      setInputText('');
      setIsProcessing(false);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  }

  async function StopRecording() {
    if (!recording || isStoppingRef.current) return;
    isStoppingRef.current = true;
    try {
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
      isStoppingRef.current = false;
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

      const response = await api.post<TranscriptionResponseData>('/transcribe', formData, {
        headers: { ...(await authHeaders()), 'Content-Type': 'multipart/form-data' },
      });

      if (response.ok && response.data) {
        const transcriptionText = response.data.text;
        setTranscription(transcriptionText);
        console.log(`Transcription: ${transcriptionText}`);
        await analyzeText(transcriptionText);
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

  async function analyzeText(text: string) {
    try {
      setIsProcessing(true);

      const response = await api.post<AnalysisResult>(
        '/predict_text',
        { text },
        { headers: await authHeaders() }
      );

      if (response.ok && response.data) {
        setResult(response.data);
      } else {
        console.error('Analysis failed', response.problem, response.data);
        setError('Failed to analyze your entry.');
      }
    } catch (err) {
      console.error('Error analyzing entry:', err);
      setError('An error occurred during analysis.');
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
    setResult(null);
    setError(null);
    await analyzeText(inputText);
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
      const response = await api.post<{ error?: string }>(
        '/confessions',
        { content: confessionText },
        { headers: await authHeaders() }
      );

      if (response.ok) {
        Alert.alert('Saved', 'Your confession was saved privately. Read or delete it in Profile.');
        setConfessionText('');
        Keyboard.dismiss();
      } else if (response.status === 401) {
        Alert.alert('Session Expired', 'Please sign in again.');
      } else {
        Alert.alert(
          'Error',
          response.data?.error || 'Failed to submit your confession. Please try again.'
        );
      }
    } catch (err) {
      console.error('Error submitting confession:', err);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const openHelp = async () => {
    setHelpVisible(true);
    if (helpResources.length > 0) return;

    setHelpLoading(true);
    setHelpError(null);
    try {
      const response = await api.get<{ resources: CrisisResource[]; emergency: string }>(
        '/resources'
      );
      if (!response.ok || !response.data) {
        setHelpError('Could not load helplines. If you are in immediate danger, call 112.');
        return;
      }
      setHelpResources(response.data.resources);
      setHelpEmergency(response.data.emergency);
    } catch (err) {
      console.error('Failed to load help resources', err);
      setHelpError('Could not load helplines. If you are in immediate danger, call 112.');
    } finally {
      setHelpLoading(false);
    }
  };

  const colorKey: RiskLevel =
    result?.level === 'crisis' ? 'High' : result?.level === 'support' ? 'Medium' : 'Low';
  const currentColors = colorSets[colorKey];
  const backgroundColor = Platform.OS === 'android' ? currentColors.solidColor : 'transparent';

  return (
    <SafeAreaView className="relative flex-1" style={{ backgroundColor }}>
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
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}>
          <View className="items-center border-b border-gray-700 bg-gray-900 p-5 shadow-md">
            <Text className="text-3xl font-extrabold tracking-wide text-white">All Is Well</Text>
            <Pressable
              className="absolute right-4 top-5 rounded-full bg-red-700 px-3 py-1"
              onPress={openHelp}>
              <Text className="text-sm font-semibold text-white">Get help</Text>
            </Pressable>
          </View>

          <View className="flex-1 p-4">
            {isProcessing && <ActivityIndicator size="large" color="#A7F3D0" className="mb-4" />}

            <View className="mb-6 items-center">
              <Text className="mb-3 text-lg font-semibold text-white">Record Your Thoughts</Text>
              {!recording ? (
                <Pressable
                  className="flex-row items-center rounded-full bg-green-600 px-6 py-3 shadow-lg"
                  onPress={StartRecording}>
                  <MaterialIcons name="mic" size={24} color="#ffffff" />
                  <Text className="ml-2 text-lg font-semibold text-white">Start Recording</Text>
                </Pressable>
              ) : (
                <Pressable
                  className="flex-row items-center rounded-full bg-red-600 px-6 py-3 shadow-lg"
                  onPress={StopRecording}>
                  <MaterialIcons name="stop" size={24} color="#ffffff" />
                  <Text className="ml-2 text-lg font-semibold text-white">Stop Recording</Text>
                </Pressable>
              )}
              {recording && (
                <Text className="mt-3 text-base text-gray-300">
                  Recording {formatDuration(recordingSeconds)} of 2:00
                </Text>
              )}
            </View>

            <View className="mb-4 rounded-xl bg-gray-800 p-4 shadow-md">
              <Pressable
                onPress={toggleConfessionSection}
                className="flex-row items-center justify-between">
                <Text className="text-lg font-semibold text-white">Share a Confession</Text>
                <MaterialIcons
                  name={isConfessionSectionOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={24}
                  color="#A7F3D0"
                />
              </Pressable>
              <Animated.View style={confessionSectionStyle}>
                <TextInput
                  className="mt-3 h-32 rounded-lg bg-gray-700 p-3 text-base text-white"
                  placeholder="Write your confession here..."
                  placeholderTextColor="#A0A0A0"
                  value={confessionText}
                  onChangeText={setConfessionText}
                  multiline
                  maxLength={MAX_CONFESSION_LENGTH}
                />
                <Text className="mt-2 self-end text-sm text-gray-400">
                  {confessionText.length}/{MAX_CONFESSION_LENGTH}
                </Text>
                <Pressable
                  className="mt-3 self-center rounded-lg bg-purple-600 px-6 py-3 shadow-md"
                  onPress={handleConfessionSubmit}>
                  <Text className="text-base font-semibold text-white">Submit Confession</Text>
                </Pressable>
              </Animated.View>
            </View>

            <View className="mb-4 rounded-xl bg-gray-800 p-4 shadow-md ">
              <Pressable
                onPress={toggleThoughtsSection}
                className="flex-row items-center justify-between">
                <Text className="text-lg font-semibold text-white">Type Your Thoughts</Text>
                <MaterialIcons
                  name={isThoughtsSectionOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={24}
                  color="#A7F3D0"
                />
              </Pressable>
              <Animated.View style={thoughtsSectionStyle}>
                <TextInput
                  className="mt-3 rounded-lg bg-gray-700 p-3 text-base text-white "
                  placeholder="Enter your thoughts here..."
                  placeholderTextColor="#A0A0A0"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={5000}
                />
                <Pressable
                  className="mt-3 self-center rounded-lg bg-blue-600 px-6 py-3 shadow-md"
                  onPress={handleTextSubmit}>
                  <Text className="text-base font-semibold text-white">Submit</Text>
                </Pressable>
              </Animated.View>
            </View>

            {(transcription || result) && (
              <View className="mb-4 rounded-xl bg-gray-800 p-4 shadow-md">
                <Text className="mb-3 text-lg font-semibold text-white">Results</Text>
                {transcription && (
                  <View className="mb-3">
                    <Text className="text-base font-medium text-white">Transcription:</Text>
                    <Text className="mt-1 text-base text-gray-300">{transcription}</Text>
                  </View>
                )}
                {result && (
                  <View
                    className={
                      result.crisis ? 'rounded-lg border border-red-400 bg-red-950 p-3' : ''
                    }>
                    {result.crisis && (
                      <Text className="mb-1 text-base font-semibold text-white">
                        Support right now
                      </Text>
                    )}
                    <Text className="text-base text-gray-200">{result.message}</Text>
                    {result.resources.length > 0 && (
                      <View className="mt-3">
                        <Text className="text-base font-semibold text-white">
                          Where to get help
                        </Text>
                        <Text className="mt-1 text-sm text-gray-300">
                          These helplines are for India.
                        </Text>
                        {result.resources.map((resource) => (
                          <Text key={resource.name} className="mt-1 text-base text-gray-200">
                            <Text className="font-semibold">{resource.name}:</Text>{' '}
                            {resource.contact}
                          </Text>
                        ))}
                        <Text className="mt-2 text-sm text-gray-300">
                          If you or someone else is in immediate danger, call{' '}
                          {result.emergency ?? 'your local emergency number'}.
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {error && <Text className="mt-4 text-center text-base text-red-400">{error}</Text>}

            <Text className="mt-4 text-center text-sm text-gray-500">
              This is a check-in tool, not a diagnosis or a crisis service.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={helpVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpVisible(false)}>
        <View
          className="flex-1 items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}>
          <View className="w-full rounded-xl bg-gray-800 p-5">
            <Text className="text-xl font-bold text-white">Get help now</Text>
            <Text className="mt-1 text-sm text-gray-300">These helplines are for India.</Text>

            {helpLoading && <ActivityIndicator className="mt-4" color="#ffffff" />}
            {helpError && <Text className="mt-4 text-sm text-red-300">{helpError}</Text>}

            {helpResources.map((resource) => (
              <View key={resource.name} className="mt-3">
                <Text className="text-base font-semibold text-white">{resource.name}</Text>
                <Text className="mt-1 text-sm text-gray-300">{resource.contact}</Text>
              </View>
            ))}

            <Text className="mt-4 text-sm text-white">
              If you are in immediate danger, call {helpEmergency ?? '112'}.
            </Text>

            <Pressable
              className="mt-5 self-center rounded-lg bg-gray-600 px-5 py-2"
              onPress={() => setHelpVisible(false)}>
              <Text className="text-base font-semibold text-white">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
