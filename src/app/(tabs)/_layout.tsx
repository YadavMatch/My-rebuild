import { Redirect, Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';
import { useDecisions } from '@/store/decisions';

export default function TabLayout() {
  const { state } = useDecisions();

  // Nothing until storage has been read, otherwise the gates flash up for
  // people who have already passed them.
  if (!state.hydrated) {
    return null;
  }

  // Order matters: the age block outranks everything, then the age
  // declaration, then the welcome screen.
  if (state.underageBlockedAt) {
    return <Redirect href="/underage" />;
  }

  if (!state.ageConfirmedAt) {
    return <Redirect href="/age-gate" />;
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
