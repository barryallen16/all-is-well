import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ReactNode, useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Button, Card, ErrorBanner } from '~/components/ui';
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

type IconName = keyof typeof MaterialIcons.glyphMap;

function Point({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <View className="flex-row items-start gap-3">
      <MaterialIcons name={icon} size={18} color="#6EE7B7" />
      <Text className="flex-1 text-sm leading-5 text-gray-200">{children}</Text>
    </View>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const [resources, setResources] = useState<CrisisResource[]>([]);
  const [emergency, setEmergency] = useState('112');
  const [resourcesError, setResourcesError] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get<ResourcesResponse>('/resources');
        if (response.ok && response.data) {
          setResources(response.data.resources);
          setEmergency(response.data.emergency);
        } else {
          setResourcesError(true);
        }
      } catch (err) {
        console.error('Failed to load helplines', err);
        setResourcesError(true);
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

  const enter = (delay: number) =>
    FadeInDown.duration(220).delay(delay).easing(Easing.out(Easing.cubic));

  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, flexGrow: 1 }}>
        <View className="w-full max-w-md gap-5 self-center">
          <Animated.View entering={enter(0)}>
            <Brand />
          </Animated.View>

          <Animated.View entering={enter(60)}>
            <Card className="gap-3">
              <Text className="text-base font-semibold text-white">Before you start</Text>
              <Point icon="mic">
                Record a thought, write a message, or keep a private journal.
              </Point>
              <Point icon="visibility">
                The app looks for explicit crisis language. It can miss indirect distress.
              </Point>
              <Point icon="info">It is not a diagnosis or a crisis service.</Point>
              <Point icon="lock">
                Your data stays in your account. You can export or delete it in Profile.
              </Point>
            </Card>
          </Animated.View>

          <Animated.View entering={enter(120)}>
            <Card>
              <Text className="text-base font-semibold text-white">If you need help now</Text>
              <Text className="mt-1 text-sm text-gray-400">These helplines are for India.</Text>

              {resources.map((resource) => (
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

              {resourcesError && (
                <View className="mt-3">
                  <ErrorBanner>
                    Could not load helplines. If you are in immediate danger, call 112.
                  </ErrorBanner>
                </View>
              )}

              <Text className="mt-3 text-sm text-gray-300">
                If you are in immediate danger, call {emergency}.
              </Text>
            </Card>
          </Animated.View>
        </View>
      </ScrollView>

      <View className="border-t border-white/10 bg-gray-900 px-4 py-3">
        <View className="w-full max-w-md self-center">
          <Animated.View entering={enter(180)}>
            <Button label="I understand, continue" onPress={continueToApp} loading={isContinuing} />
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}
