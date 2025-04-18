import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, ErrorBanner, Field, ScreenHeader, Sheet, Tappable } from '~/components/ui';
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

interface Evidence {
  id: number;
  content: string;
  created_at: string;
}

interface AnalysisResult {
  level: 'crisis' | 'support' | 'none';
  crisis: boolean;
  about_self: boolean;
  matched: CrisisMatch[];
  message: string;
  resources: CrisisResource[];
  emergency: string | null;
  evidence: Evidence[];
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get<Message[]>('/messages', undefined, {
          headers: await authHeaders(),
        });

        if (response.ok && response.data) {
          setMessages(response.data);
          setError(null);
        } else {
          setError('Failed to load messages. Please try again.');
        }
      } catch (err) {
        console.error('Failed to load messages', err);
        setError('Failed to load messages. Please try again.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const sendMessage = async () => {
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
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
    } catch (err) {
      console.error('Failed to send message', err);
      setError('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const analyzeMentalHealth = async () => {
    if (messages.length === 0 || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      const response = await api.post<AnalysisResult>(
        '/analyze_chat',
        {},
        { headers: await authHeaders() }
      );

      if (response.ok && response.data) {
        setAnalysis(response.data);
        setError(null);
      } else {
        setError('Failed to analyze chat.');
      }
    } catch (err) {
      console.error('Failed to analyze chat', err);
      setError('Failed to analyze chat.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <ScreenHeader
        title="Your messages"
        subtitle="Private to your account."
        right={
          <Tappable
            onPress={analyzeMentalHealth}
            disabled={messages.length === 0 || isAnalyzing}
            className={`min-h-11 flex-row items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 ${
              messages.length === 0 ? 'opacity-50' : ''
            }`}>
            {isAnalyzing ? (
              <ActivityIndicator size="small" color="#E5E7EB" />
            ) : (
              <MaterialIcons name="health-and-safety" size={18} color="#E5E7EB" />
            )}
            <Text className="text-sm font-semibold text-white">Check in</Text>
          </Tappable>
        }
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}>
          <View className="w-full max-w-2xl flex-1 self-center">
            {isLoading ? (
              <View className="flex-1 items-center justify-center py-10">
                <ActivityIndicator color="#6EE7B7" />
              </View>
            ) : messages.length === 0 ? (
              <Card className="items-center py-8">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-white/5">
                  <MaterialIcons name="chat" size={24} color="#6EE7B7" />
                </View>
                <Text className="mt-3 text-base font-semibold text-white">No messages yet</Text>
                <Text className="mt-1 text-center text-sm text-gray-400">
                  Write something below. It stays private to your account.
                </Text>
              </Card>
            ) : (
              <View className="gap-3">
                {messages.map((message) => (
                  <View
                    key={message.id}
                    className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-emerald-300 px-3.5 py-2.5">
                    <Text className="text-base leading-6 text-emerald-950">{message.content}</Text>
                    <Text className="mt-1 text-[11px] text-emerald-900/70">
                      {formatTimestamp(message.created_at)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {error && (
              <View className="mt-4">
                <ErrorBanner>{error}</ErrorBanner>
              </View>
            )}
          </View>
        </ScrollView>

        <View className="border-t border-white/10 bg-gray-900 px-4 py-3">
          <View className="w-full max-w-2xl flex-row items-center gap-2 self-center">
            <Field
              className="flex-1"
              placeholder="Write a message..."
              value={newMessage}
              onChangeText={setNewMessage}
              maxLength={2000}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
            <Tappable
              onPress={sendMessage}
              disabled={!newMessage.trim() || isSending}
              accessibilityLabel="Send message"
              className={`h-12 w-12 items-center justify-center rounded-full bg-emerald-300 ${
                !newMessage.trim() || isSending ? 'opacity-50' : ''
              }`}>
              {isSending ? (
                <ActivityIndicator size="small" color="#022C22" />
              ) : (
                <MaterialIcons name="send" size={20} color="#022C22" />
              )}
            </Tappable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Sheet
        visible={analysis !== null}
        onClose={() => setAnalysis(null)}
        title={analysis?.crisis ? 'Support now' : 'Your check-in'}>
        {analysis && (
          <>
            <Text className="text-base leading-6 text-gray-200">{analysis.message}</Text>

            {analysis.evidence.length > 0 && (
              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  From your message
                </Text>
                {analysis.evidence.map((item) => (
                  <View key={item.id} className="mt-2 rounded-lg bg-white/5 px-3 py-2.5">
                    <Text className="text-sm leading-5 text-gray-200">
                      &quot;{item.content}&quot;
                    </Text>
                    <Text className="mt-1 text-xs text-gray-400">
                      {formatTimestamp(item.created_at)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {analysis.matched.length > 0 && (
              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  What we noticed
                </Text>
                {analysis.matched.map((match) => (
                  <View
                    key={`${match.phrase}-${match.kind}`}
                    className="mt-2 flex-row items-start gap-2">
                    <View className="mt-2 h-1.5 w-1.5 rounded-full bg-gray-500" />
                    <Text className="flex-1 text-sm text-gray-300">&quot;{match.phrase}&quot;</Text>
                  </View>
                ))}
              </View>
            )}

            {analysis.resources.length > 0 && (
              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Where to get help
                </Text>
                <Text className="mt-1 text-sm text-gray-400">These helplines are for India.</Text>
                {analysis.resources.map((resource) => (
                  <View
                    key={resource.name}
                    className="mt-2 flex-row items-start gap-3 rounded-lg bg-white/5 px-3 py-2.5">
                    <MaterialIcons name="phone" size={18} color="#6EE7B7" />
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-white">{resource.name}</Text>
                      <Text className="mt-0.5 text-sm text-gray-300">{resource.contact}</Text>
                    </View>
                  </View>
                ))}
                <Text className="mt-3 text-sm text-gray-400">
                  If you or someone else is in immediate danger, call {analysis.emergency ?? '112'}.
                </Text>
              </View>
            )}
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}
