import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { TabBarIcon } from '../../components/TabBarIcon';
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#A7F3D0',
        tabBarInactiveTintColor: '#A0A0A0',
        tabBarStyle: {
          backgroundColor: '#1F2937',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} />,
        }}
      />

      <Tabs.Screen
        name="Activity"
        options={{
          headerShown: false,
          title: 'daily activities',
          tabBarIcon: ({ color }) => <TabBarIcon name="code" color={color} />,
        }}
      />
      <Tabs.Screen
        name="Chat"
        options={{
          headerShown: false,
          title: 'Chat',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="chat" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'profile',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="face" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
