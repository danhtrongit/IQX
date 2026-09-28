import { Redirect } from 'expo-router';

/** Native launches land on the Market tab, matching the web entry route. */
export default function Index() {
  return <Redirect href="/(tabs)/market" />;
}
