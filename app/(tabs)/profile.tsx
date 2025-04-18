import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, Text, Alert, ScrollView, Share, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorBanner, ScreenHeader, Tappable, tabularNums } from '~/components/ui';
import { api, authHeaders, clearToken } from '~/utils/api';

interface Confession {
  id: number;
  content: string;
  created_at: string;
}

const Profile = () => {
  const router = useRouter();
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfessions = async () => {
    try {
      const response = await api.get<Confession[]>('/confessions', undefined, {
        headers: await authHeaders(),
      });
      if (!response.ok || !response.data) {
        setError('Failed to load your journal.');
        return;
      }
      setConfessions(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to load journal', err);
      setError('Failed to load your journal.');
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadConfessions();
    }, [])
  );

  const handleDelete = (id: number) => {
    Alert.alert('Delete this entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await api.delete(`/confessions/${id}`, undefined, {
              headers: await authHeaders(),
            });
            if (!response.ok) {
              throw new Error('Delete failed');
            }
            setConfessions((current) => current.filter((item) => item.id !== id));
          } catch (err) {
            console.error('Failed to delete confession', err);
            Alert.alert('Error', 'Failed to delete this entry.');
          }
        },
      },
    ]);
  };

  const handleSignOut = async () => {
    await api.post('/auth/logout', {}, { headers: await authHeaders() }).catch(() => {});
    await clearToken();
    router.replace('/auth');
  };

  const handleExport = async () => {
    try {
      const response = await api.get('/account/export', undefined, {
        headers: await authHeaders(),
      });
      if (!response.ok || !response.data) {
        Alert.alert('Error', 'Failed to export your data.');
        return;
      }
      await Share.share({
        title: 'My All Is Well data',
        message: JSON.stringify(response.data, null, 2),
      });
    } catch (err) {
      console.error('Failed to export account', err);
      Alert.alert('Error', 'Failed to export your data.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your journal, messages, and check-ins.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await api.delete('/account', undefined, {
                headers: await authHeaders(),
              });
              if (!response.ok) {
                throw new Error('Delete failed');
              }
              await clearToken();
              router.replace('/auth');
            } catch (err) {
              console.error('Failed to delete account', err);
              Alert.alert('Error', 'Failed to delete your account.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <ScreenHeader title="Profile" subtitle="Your journal and data." />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View className="w-full max-w-2xl gap-4 self-center">
          {error && <ErrorBanner>{error}</ErrorBanner>}

          <Card>
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Your journal
              </Text>
              {!isLoading && (
                <Text className="text-xs text-gray-400" style={tabularNums}>
                  {confessions.length} {confessions.length === 1 ? 'entry' : 'entries'}
                </Text>
              )}
            </View>
            <Text className="mt-1 text-sm text-gray-400">
              These entries are private to your account.
            </Text>

            {isLoading && <ActivityIndicator className="mt-4" color="#6EE7B7" />}

            {!isLoading && confessions.length === 0 && (
              <View className="items-center py-6">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-white/5">
                  <MaterialIcons name="menu-book" size={24} color="#6EE7B7" />
                </View>
                <Text className="mt-3 text-base font-semibold text-white">Nothing saved yet</Text>
                <Text className="mt-1 text-center text-sm text-gray-400">
                  Share a confession from Home to start your journal.
                </Text>
              </View>
            )}

            {confessions.map((confession) => (
              <View key={confession.id} className="mt-3 rounded-lg bg-white/5 p-3">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-xs text-gray-400">{formatDate(confession.created_at)}</Text>
                  <Tappable
                    onPress={() => handleDelete(confession.id)}
                    accessibilityLabel={`Delete entry from ${formatDate(confession.created_at)}`}
                    hitSlop={8}
                    className="rounded-full bg-white/10 p-2">
                    <MaterialIcons name="delete-outline" size={18} color="#FCA5A5" />
                  </Tappable>
                </View>
                <Text className="mt-2 text-base leading-6 text-white">{confession.content}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <Text className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Your data
            </Text>
            <Text className="mt-1 text-sm text-gray-400">
              Export a copy or delete everything stored for your account.
            </Text>
            <Button
              label="Export my data"
              variant="secondary"
              icon="download"
              onPress={handleExport}
              className="mt-4"
            />
            <Button
              label="Delete my account"
              variant="danger"
              icon="delete-outline"
              onPress={handleDeleteAccount}
              className="mt-2"
            />
          </Card>

          <Button label="Sign out" variant="secondary" icon="logout" onPress={handleSignOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Profile;
