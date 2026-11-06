import { Jersey15_400Regular, useFonts } from '@expo-google-fonts/jersey-15';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UiApp } from './src/ui/UiApp';
import { C } from './src/ui/theme';

export default function App() {
  const [fontsLoaded] = useFonts({ Jersey15_400Regular });
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {fontsLoaded ? <UiApp /> : <View style={{ flex: 1, backgroundColor: C.night }} />}
    </SafeAreaProvider>
  );
}
