import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import FormData from 'form-data';
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Keyboard,
} from 'react-native';
import Animated, { Easing, FadeInDown, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  ErrorBanner,
  Field,
  GradientBackground,
  ScreenHeader,
  Sheet,
  Tappable,
  tabularNums,
} from '~/components/ui';
import { api, authHeaders } from '~/utils/api';

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

type IconName = keyof typeof MaterialIcons.glyphMap;

const MAX_RECORDING_SECONDS = 120;
const MAX_CONFESSION_LENGTH = 500;

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

function CollapsibleCard({
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  icon: IconName;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card padded={false} className="overflow-hidden">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="min-h-14 flex-row items-center gap-3 px-4"
        style={({ pressed }) => ({
          backgroundColor: pressed ? 'rgba(255,255,255,0.04)' : 'transparent',
        })}>
        <MaterialIcons name={icon} size={20} color="#6EE7B7" />
        <Text className="flex-1 text-base font-semibold text-white">{title}</Text>
        <MaterialIcons
          name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={22}
          color="#9CA3AF"
        />
      </Pressable>
      {open ? (
        <Animated.View
          entering={FadeInDown.duration(180).easing(Easing.out(Easing.quad))}
          exiting={FadeOut.duration(120).easing(Easing.out(Easing.quad))}>
          <View className="px-4 pb-4">{children}</View>
        </Animated.View>
      ) : null}
    </Card>
  );
}

export default function Home() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [transcription, setTranscription] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmittingConfession, setIsSubmittingConfession] = useState(false);
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

  const [isConfessionSectionOpen, setIsConfessionSectionOpen] = useState(false);
  const [isThoughtsSectionOpen, setIsThoughtsSectionOpen] = useState(false);

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
      StopRecording().catch((err) => console.error('Failed to stop recording', err));
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
    setTranscription(null);
    setResult(null);
    setError(null);
    await analyzeText(inputText);
    Keyboard.dismiss();
  };

  const handleConfessionSubmit = async () => {
    try {
      setIsSubmittingConfession(true);
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
      setIsSubmittingConfession(false);
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
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <ScreenHeader
        title="All Is Well"
        subtitle={todayLabel}
        right={
          <Tappable
            onPress={openHelp}
            className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3.5">
            <MaterialIcons name="support-agent" size={18} color="#FCA5A5" />
            <Text className="text-sm font-semibold text-red-200">Get help</Text>
          </Tappable>
        }
      />

      <View className="flex-1">
        <GradientBackground
          colors={currentColors.gradientColors}
          solid={currentColors.solidColor}
        />

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            <View className="w-full max-w-2xl gap-4 self-center">
              <Card className="items-center">
                <Text className="text-lg font-semibold text-white">How are you feeling?</Text>
                <Text className="mt-1 text-center text-sm text-gray-400">
                  Tap the mic and talk it out. Up to two minutes.
                </Text>
                <Tappable
                  onPress={recording ? StopRecording : StartRecording}
                  disabled={isProcessing}
                  accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
                  className={`mt-4 h-20 w-20 items-center justify-center rounded-full ${
                    recording ? 'bg-red-500' : 'bg-emerald-300'
                  } ${isProcessing ? 'opacity-50' : ''}`}>
                  <MaterialIcons
                    name={recording ? 'stop' : 'mic'}
                    size={34}
                    color={recording ? '#FFFFFF' : '#022C22'}
                  />
                </Tappable>
                {recording ? (
                  <>
                    <Text className="mt-3 text-2xl font-bold text-white" style={tabularNums}>
                      {formatDuration(recordingSeconds)}
                    </Text>
                    <Text className="mt-1 text-sm text-gray-400">Tap stop when you are done.</Text>
                  </>
                ) : (
                  <Text className="mt-3 text-sm font-semibold text-gray-300">Tap to record</Text>
                )}
              </Card>

              {isProcessing && (
                <View className="flex-row items-center gap-2 self-center rounded-full border border-white/10 bg-gray-900 px-4 py-2">
                  <ActivityIndicator size="small" color="#6EE7B7" />
                  <Text className="text-sm text-gray-300">Checking your entry...</Text>
                </View>
              )}

              <CollapsibleCard
                icon="edit"
                title="Share a confession"
                open={isConfessionSectionOpen}
                onToggle={() => setIsConfessionSectionOpen((open) => !open)}>
                <Field
                  multiline
                  placeholder="Write your confession here..."
                  value={confessionText}
                  onChangeText={setConfessionText}
                  maxLength={MAX_CONFESSION_LENGTH}
                />
                <Text className="mt-2 self-end text-xs text-gray-400" style={tabularNums}>
                  {confessionText.length}/{MAX_CONFESSION_LENGTH}
                </Text>
                <Button
                  label="Save to journal"
                  variant="secondary"
                  icon="lock"
                  onPress={handleConfessionSubmit}
                  loading={isSubmittingConfession}
                  disabled={!confessionText.trim()}
                  className="mt-3"
                />
              </CollapsibleCard>

              <CollapsibleCard
                icon="notes"
                title="Type your thoughts"
                open={isThoughtsSectionOpen}
                onToggle={() => setIsThoughtsSectionOpen((open) => !open)}>
                <Field
                  multiline
                  placeholder="Enter your thoughts here..."
                  value={inputText}
                  onChangeText={setInputText}
                  maxLength={5000}
                />
                <Button
                  label="Check my thoughts"
                  variant="secondary"
                  icon="search"
                  onPress={handleTextSubmit}
                  loading={isProcessing}
                  disabled={!inputText.trim()}
                  className="mt-3"
                />
              </CollapsibleCard>

              {(transcription || result) && (
                <Card>
                  <Text className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Your check-in
                  </Text>

                  {transcription && (
                    <View className="mt-3 rounded-lg border border-white/5 bg-gray-900/60 p-3">
                      <Text className="text-sm font-medium text-gray-400">What you said</Text>
                      <Text className="mt-1 text-base leading-6 text-gray-200">
                        {transcription}
                      </Text>
                    </View>
                  )}

                  {result && (
                    <View
                      className={
                        result.crisis
                          ? 'mt-3 rounded-lg border border-red-500/30 bg-red-950/60 p-4'
                          : 'mt-3'
                      }>
                      {result.crisis && (
                        <View className="mb-2 flex-row items-center gap-2">
                          <MaterialIcons name="support-agent" size={20} color="#FCA5A5" />
                          <Text className="text-base font-semibold text-white">
                            Support right now
                          </Text>
                        </View>
                      )}
                      <Text className="text-base leading-6 text-gray-200">{result.message}</Text>
                      {result.resources.length > 0 && (
                        <View className="mt-4">
                          <Text className="text-base font-semibold text-white">
                            Where to get help
                          </Text>
                          <Text className="mt-1 text-sm text-gray-400">
                            These helplines are for India.
                          </Text>
                          {result.resources.map((resource) => (
                            <View
                              key={resource.name}
                              className="mt-2 flex-row items-start gap-3 rounded-lg bg-white/5 px-3 py-2.5">
                              <MaterialIcons name="phone" size={18} color="#6EE7B7" />
                              <View className="flex-1">
                                <Text className="text-sm font-semibold text-white">
                                  {resource.name}
                                </Text>
                                <Text className="mt-0.5 text-sm text-gray-300">
                                  {resource.contact}
                                </Text>
                              </View>
                            </View>
                          ))}
                          <Text className="mt-3 text-sm text-gray-400">
                            If you or someone else is in immediate danger, call{' '}
                            {result.emergency ?? 'your local emergency number'}.
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </Card>
              )}

              {error && <ErrorBanner>{error}</ErrorBanner>}

              <Text className="px-2 text-center text-xs leading-5 text-gray-700">
                This is a check-in tool, not a diagnosis or a crisis service.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <Sheet visible={helpVisible} onClose={() => setHelpVisible(false)} title="Get help now">
        <Text className="text-sm text-gray-400">These helplines are for India.</Text>

        {helpLoading && <ActivityIndicator className="mt-4" color="#6EE7B7" />}
        {helpError && (
          <View className="mt-4">
            <ErrorBanner>{helpError}</ErrorBanner>
          </View>
        )}

        {helpResources.map((resource) => (
          <View
            key={resource.name}
            className="mt-3 flex-row items-start gap-3 rounded-lg bg-white/5 px-3 py-3">
            <MaterialIcons name="phone" size={18} color="#6EE7B7" />
            <View className="flex-1">
              <Text className="text-base font-semibold text-white">{resource.name}</Text>
              <Text className="mt-0.5 text-sm text-gray-300">{resource.contact}</Text>
            </View>
          </View>
        ))}

        <Text className="mt-4 text-sm text-gray-300">
          If you are in immediate danger, call {helpEmergency ?? '112'}.
        </Text>
      </Sheet>
    </SafeAreaView>
  );
}
