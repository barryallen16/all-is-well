import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { api, setToken } from '~/utils/api';
import { useRouter } from 'expo-router';

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
      <View className="flex-1 justify-center p-4">
        <Text className="mb-6 text-center text-3xl font-extrabold text-white">All Is Well</Text>

        <TextInput
          className="mb-4 rounded-lg bg-gray-800 p-3 text-lg text-white"
          placeholder="Username"
          placeholderTextColor="#A0A0A0"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput
          className="mb-6 rounded-lg bg-gray-800 p-3 text-lg text-white"
          placeholder="Password"
          placeholderTextColor="#A0A0A0"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        {isLoading ? (
          <ActivityIndicator size="large" color="#A7F3D0" />
        ) : (
          <>
            <Pressable
              className="mb-4 rounded-lg bg-blue-600 px-6 py-3 shadow-md"
              onPress={handleAuth}>
              <Text className="text-center text-lg font-semibold text-white">
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setIsSignUp(!isSignUp)}>
              <Text className="text-center text-base text-blue-400">
                {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
