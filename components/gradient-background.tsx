import { StyleSheet, View } from 'react-native';

/** Solid fallback for platforms without MeshGradientView. */
export function GradientBackground({ solid }: { colors: string[]; solid: string }) {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: solid }]} />;
}
