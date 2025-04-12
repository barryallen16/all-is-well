import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { api, authHeaders } from '~/utils/api';

interface Message {
  id: number;
  content: string;
  created_at: string;
  user_id: number;
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

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsProcessing(true);
      const response = await api.get<Message[]>('/messages', undefined, {
        headers: await authHeaders(),
      });

      if (response.ok && response.data) {
        setMessages(response.data);
        setError(null);
      } else {
        setError('Failed to load messages. Please try again.');
      }
      setIsProcessing(false);
    })();
  }, []);

  const sendMessage = async () => {
    if (!newMessage.trim()) {
      Alert.alert('Error', 'Please enter a message.');
      return;
    }

    setIsProcessing(true);
    const response = await api.post<Message>(
      '/messages',
      { content: newMessage },
      { headers: await authHeaders() }
    );

    if (response.ok && response.data) {
      const created = response.data;
      setMessages((current) => [created, ...current]);
      setNewMessage('');
      setError(null);
    } else {
      setError('Failed to send message. Please try again.');
    }
    setIsProcessing(false);
  };

  const analyzeMentalHealth = async () => {
    setIsProcessing(true);
    const response = await api.post<AnalysisResult>(
      '/analyze_chat',
      {},
      { headers: await authHeaders() }
    );

    if (response.ok && response.data) {
      const result = response.data;
      const evidence = result.matched.map((match) => `- "${match.phrase}"`).join('\n');
      const resources = result.resources
        .map((resource) => `${resource.name}: ${resource.contact}`)
        .join('\n');
      const sections = [result.message];

      if (evidence) {
        sections.push(`What we noticed:\n${evidence}`);
      }
      if (resources) {
        sections.push(`Where to get help:\n${resources}\nThese helplines are for India.`);
        sections.push(
          `If you or someone else is in immediate danger, call ${
            result.emergency ?? 'your local emergency number'
          }.`
        );
      }

      Alert.alert(result.crisis ? 'Support now' : 'Check-in', sections.join('\n\n'));
    } else {
      setError('Failed to analyze chat.');
    }
    setIsProcessing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}>
        <View className="items-center border-b border-gray-700 bg-gray-900 p-5 shadow-md">
          <Text className="text-3xl font-extrabold tracking-wide text-white">Chat</Text>
        </View>

        <View className="flex-1 p-4">
          {isProcessing && <ActivityIndicator size="large" color="#A7F3D0" className="mb-4" />}

          <View className="flex-1 rounded-xl bg-gray-800 p-4 shadow-md">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-white">Messages</Text>
              <Pressable onPress={analyzeMentalHealth}>
                <Text className="text-sm font-medium text-blue-400">Check in</Text>
              </Pressable>
            </View>
            {messages.length === 0 ? (
              <Text className="mt-2 text-center text-base text-gray-400">No messages yet.</Text>
            ) : (
              messages.map((message) => (
                <View key={message.id} className="mb-2 rounded-lg bg-gray-700 p-3 shadow-sm">
                  <Text className="text-base text-white">{message.content}</Text>
                  <Text className="mt-1 text-xs text-gray-400">
                    {new Date(message.created_at).toLocaleString()}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View className="mt-4 flex-row items-center">
            <TextInput
              className="mr-2 flex-1 rounded-lg bg-gray-700 p-3 text-base text-white"
              placeholder="Type a message..."
              placeholderTextColor="#A0A0A0"
              value={newMessage}
              onChangeText={setNewMessage}
            />
            <Pressable
              className="rounded-lg bg-blue-600 px-4 py-3"
              onPress={sendMessage}
              disabled={isProcessing}>
              <Text className="text-base font-semibold text-white">Send</Text>
            </Pressable>
          </View>

          {error && <Text className="mt-4 text-center text-base text-red-400">{error}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
