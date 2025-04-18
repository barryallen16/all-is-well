import { MeshGradientView } from 'expo-mesh-gradient';
import { StyleSheet, View } from 'react-native';

const meshPoints: [number, number][] = [
  [0.0, 0.0],
  [0.5, 0.0],
  [1.0, 0.0],
  [0.0, 0.5],
  [0.5, 0.5],
  [1.0, 0.5],
  [0.0, 1.0],
  [0.5, 1.0],
  [1.0, 1.0],
];

/** The pastel canvas sits behind content, with a solid tint as the base layer. */
export function GradientBackground({ colors, solid }: { colors: string[]; solid: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: solid }]}>
      <MeshGradientView
        style={StyleSheet.absoluteFill}
        columns={3}
        rows={3}
        colors={colors}
        points={meshPoints}
        ignoresSafeArea={false}
      />
    </View>
  );
}
