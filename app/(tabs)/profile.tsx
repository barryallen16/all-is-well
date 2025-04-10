import { View, Text, Pressable, Alert } from 'react-native';
import React from 'react';
import { api, authHeaders, clearToken } from '~/utils/api';
import { useRouter } from 'expo-router';

const Profile = () => {
  const router = useRouter();

  const handleSignOut = async () => {
    await api.post('/auth/logout', {}, { headers: await authHeaders() }).catch(() => {});
    await clearToken();
    router.replace('/auth');
  };

  return (
    <View className="flex-1 bg-gray-900 p-4">
      <Text className="mb-6 text-3xl font-extrabold text-white">Profile</Text>
      <Pressable
        className="self-center rounded-lg bg-red-600 px-6 py-3 shadow-md"
        onPress={handleSignOut}>
        <Text className="text-base font-semibold text-white">Sign Out</Text>
      </Pressable>
    </View>
  );
};

export default Profile;
