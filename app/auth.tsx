import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, Text, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Button, Card, Field, Tappable } from '~/components/ui';
import { api, setToken } from '~/utils/api';

interface AuthResponse {
  token: string;
  error?: string;
}

export default function Auth() {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const router = useRouter();

  const submit = async () => {
    setIsLoading(true);
    try {
      const response = isSignUp
        ? await api.post<AuthResponse>('/auth/signup', { username, password })
        : await api.post<AuthResponse>('/auth/login', { username, password });

      if (response.ok && response.data) {
        await setToken(response.data.token);
        router.replace('/(tabs)');
      } else {
        Alert.alert('Error', response.data?.error || 'Something went wrong. Please try again.');
      }
    } catch (err: any) {
      console.error('Auth error:', err.message);
      Alert.alert('Error', 'Could not reach the backend. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = () => {
    if (isSignUp) {
      Alert.alert(
        'Important Notice',
        'You are signing up with a username and password only. If you forget your password, you will not be able to recover your account.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Proceed', onPress: submit },
        ]
      );
    } else {
      submit();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
          keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-md gap-6 self-center">
            <Brand />

            <Card className="gap-3">
              <Text className="text-lg font-semibold text-white">
                {isSignUp ? 'Create an account' : 'Sign in'}
              </Text>

              <Field
                placeholder="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={50}
                textContentType="username"
                autoComplete="username"
                returnKeyType="next"
              />
              <Field
                placeholder="Password (8+ characters)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                maxLength={128}
                textContentType="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                returnKeyType="go"
                onSubmitEditing={handleAuth}
              />

              {isSignUp && (
                <Text className="text-sm leading-5 text-gray-400">
                  There is no password recovery. Keep your password safe.
                </Text>
              )}

              <Button
                label={isSignUp ? 'Sign up' : 'Sign in'}
                onPress={handleAuth}
                loading={isLoading}
                disabled={!username.trim() || !password}
              />
            </Card>

            <Tappable
              onPress={() => setIsSignUp((value) => !value)}
              className="min-h-11 items-center justify-center">
              <Text className="text-sm font-semibold text-emerald-300">
                {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
              </Text>
            </Tappable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
