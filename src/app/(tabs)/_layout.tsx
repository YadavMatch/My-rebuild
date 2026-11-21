import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
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

  return <AppTabs />;
}
