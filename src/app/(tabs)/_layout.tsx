import { Redirect, Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';
import { useDecisions } from '@/store/decisions';

export default function TabLayout() {
  const { state } = useDecisions();

  // Nothing until storage has been read, otherwise the welcome screen flashes
  // up for people who have already dismissed it.
  if (!state.hydrated) {
    return null;
  }

  if (!state.seenWelcome) {
    return <Redirect href="/welcome" />;
  }

  return (
    <Tabs
      // Tabs are peers. Sliding between them implies a depth that is not
      // there, and the user pays for it dozens of times a session.
      screenOptions={{ headerShown: false, animation: 'none' }}
      tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Discover' }} />
      <Tabs.Screen name="likes" options={{ title: 'Likes' }} />
      <Tabs.Screen name="premium" options={{ title: 'Premium' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
