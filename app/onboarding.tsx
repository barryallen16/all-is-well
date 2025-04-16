import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { api, getToken } from '~/utils/api';
import { markOnboardingSeen } from '~/utils/onboarding';

interface CrisisResource {
  name: string;
  contact: string;
}

interface ResourcesResponse {
  resources: CrisisResource[];
  emergency: string;
}

export default function Onboarding() {
  const router = useRouter();
  const [resources, setResources] = useState<CrisisResource[]>([]);
  const [emergency, setEmergency] = useState('112');
  const [isContinuing, setIsContinuing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get<ResourcesResponse>('/resources');
        if (response.ok && response.data) {
          setResources(response.data.resources);
          setEmergency(response.data.emergency);
        }
      } catch (err) {
        console.error('Failed to load helplines', err);
      }
    })();
  }, []);

  const continueToApp = async () => {
    setIsContinuing(true);
    try {
      await markOnboardingSeen();
      const token = await getToken();
      if (!token) {
        router.replace('/auth');
        return;
      }

      const response = await api.get('/auth/me', undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });
      router.replace(response.status === 200 ? '/(tabs)' : '/auth');
    } catch (err) {
      console.error('Failed to continue from onboarding', err);
      router.replace('/auth');
    } finally {
      setIsContinuing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <Text className="mt-8 text-center text-4xl font-extrabold text-white">All Is Well</Text>
        <Text className="mt-3 text-center text-lg text-gray-300">
          A private check-in for hard days.
        </Text>

        <View className="mt-8 rounded-xl bg-gray-800 p-5">
          <Text className="text-base text-gray-200">
            Record a thought, write a message, or keep a private journal.
          </Text>
          <Text className="mt-3 text-base text-gray-200">
            The app looks for explicit crisis language. It can miss indirect distress.
          </Text>
          <Text className="mt-3 text-base text-gray-200">
            It is not a diagnosis or a crisis service.
          </Text>
          <Text className="mt-3 text-base text-gray-200">
            Your data stays in your account. You can export or delete it in Profile.
          </Text>
        </View>

        <View className="mt-6 rounded-xl bg-gray-800 p-5">
          <Text className="text-lg font-semibold text-white">If you need help now</Text>
          <Text className="mt-1 text-sm text-gray-300">These helplines are for India.</Text>
          {resources.map((resource) => (
            <Text key={resource.name} className="mt-2 text-sm text-gray-200">
              <Text className="font-semibold">{resource.name}:</Text> {resource.contact}
            </Text>
          ))}
          <Text className="mt-3 text-sm text-gray-300">
            If you are in immediate danger, call {emergency}.
          </Text>
        </View>

        <Pressable
          className="mb-6 mt-8 self-center rounded-lg bg-green-600 px-8 py-3 shadow-md"
          onPress={continueToApp}
          disabled={isContinuing}>
          <Text className="text-base font-semibold text-white">
            {isContinuing ? 'Loading...' : 'I understand, continue'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
