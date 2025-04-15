import { View, Text, Pressable, Alert, ScrollView, Share } from 'react-native';
import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
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
      void loadConfessions();
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
    <View className="flex-1 bg-gray-900">
      <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1 }}>
        <Text className="mb-6 text-3xl font-extrabold text-white">Profile</Text>

        <Text className="mb-2 text-lg font-semibold text-white">Your journal</Text>
        <Text className="mb-4 text-sm text-gray-400">
          These entries are private to your account.
        </Text>

        {isLoading && <Text className="text-gray-400">Loading...</Text>}
        {error && <Text className="mb-3 text-red-400">{error}</Text>}
        {!isLoading && confessions.length === 0 && (
          <Text className="text-gray-400">Nothing saved yet.</Text>
        )}

        {confessions.map((confession) => (
          <View key={confession.id} className="mb-3 rounded-lg bg-gray-800 p-3">
            <Text className="text-sm text-gray-400">{formatDate(confession.created_at)}</Text>
            <Text className="mt-1 text-base text-white">{confession.content}</Text>
            <Pressable className="mt-2 self-end" onPress={() => handleDelete(confession.id)}>
              <Text className="text-sm font-semibold text-red-400">Delete</Text>
            </Pressable>
          </View>
        ))}

        <View className="mb-4 mt-6 rounded-lg bg-gray-800 p-4">
          <Text className="mb-2 text-lg font-semibold text-white">Your data</Text>
          <Text className="mb-3 text-sm text-gray-400">
            Export a copy or delete everything stored for your account.
          </Text>
          <Pressable
            className="mb-2 self-start rounded-lg bg-blue-600 px-4 py-2"
            onPress={handleExport}>
            <Text className="text-base font-semibold text-white">Export my data</Text>
          </Pressable>
          <Pressable
            className="self-start rounded-lg border border-red-500 px-4 py-2"
            onPress={handleDeleteAccount}>
            <Text className="text-base font-semibold text-red-400">Delete my account</Text>
          </Pressable>
        </View>

        <Pressable
          className="mb-4 mt-6 self-center rounded-lg bg-red-600 px-6 py-3 shadow-md"
          onPress={handleSignOut}>
          <Text className="text-base font-semibold text-white">Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

export default Profile;
