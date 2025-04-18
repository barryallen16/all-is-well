import { MaterialIcons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  PressableProps,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
} from 'react-native';

export { GradientBackground } from './gradient-background';

type IconName = keyof typeof MaterialIcons.glyphMap;

export const tabularNums = StyleSheet.create({
  text: { fontVariant: ['tabular-nums'] },
}).text;

type TappableProps = Omit<PressableProps, 'style' | 'children'> & {
  className?: string;
  children?: ReactNode;
};

/** Pressable with the shared scale-on-press feedback. */
export function Tappable({ className = '', disabled, children, ...rest }: TappableProps) {
  return (
    <Pressable
      className={className}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
      })}
      {...rest}>
      {children}
    </Pressable>
  );
}

const buttonVariants = {
  primary: {
    container: 'bg-emerald-300',
    text: 'text-emerald-950',
    icon: '#022C22',
  },
  secondary: {
    container: 'border border-white/10 bg-white/5',
    text: 'text-white',
    icon: '#E5E7EB',
  },
  danger: {
    container: 'border border-red-500/30 bg-red-500/10',
    text: 'text-red-300',
    icon: '#FCA5A5',
  },
  ghost: {
    container: '',
    text: 'text-gray-300',
    icon: '#D1D5DB',
  },
} as const;

type ButtonProps = Omit<TappableProps, 'children'> & {
  label: string;
  icon?: IconName;
  variant?: keyof typeof buttonVariants;
  loading?: boolean;
  textClassName?: string;
};

export function Button({
  label,
  icon,
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  textClassName = '',
  ...rest
}: ButtonProps) {
  const styles = buttonVariants[variant];
  const inactive = disabled || loading;

  return (
    <Tappable
      disabled={inactive}
      className={`min-h-12 flex-row items-center justify-center gap-2 rounded-full px-5 ${
        styles.container
      } ${inactive ? 'opacity-50' : ''} ${className}`}
      {...rest}>
      {loading ? (
        <ActivityIndicator size="small" color={styles.icon} />
      ) : icon ? (
        <MaterialIcons name={icon} size={20} color={styles.icon} />
      ) : null}
      <Text className={`text-base font-semibold ${styles.text} ${textClassName}`}>{label}</Text>
    </Tappable>
  );
}

export function Card({ className = '', padded = true, ...rest }: ViewProps & { padded?: boolean }) {
  return (
    <View
      className={`rounded-3xl border border-white/10 bg-gray-800 ${padded ? 'p-4' : ''} ${className}`}
      {...rest}
    />
  );
}

type FieldProps = TextInputProps & { className?: string };

export function Field({ className = '', multiline, onFocus, onBlur, ...rest }: FieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <TextInput
      className={`rounded-lg border bg-gray-900 px-4 text-base text-white ${
        multiline ? 'min-h-[112px] py-3' : 'min-h-12 py-3'
      } ${isFocused ? 'border-emerald-300/70' : 'border-white/10'} ${className}`}
      placeholderTextColor="#9CA3AF"
      selectionColor="#6EE7B7"
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        onBlur?.(event);
      }}
      {...rest}
    />
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View className="bg-gray-900 px-4 pb-3 pt-2">
      <View className="w-full max-w-2xl flex-row items-center justify-between gap-4 self-center">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-white">{title}</Text>
          {subtitle ? <Text className="mt-0.5 text-sm text-gray-400">{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/80 px-4 py-3">
      <MaterialIcons name="warning" size={18} color="#FCA5A5" />
      <Text className="flex-1 text-sm leading-5 text-red-200">{children}</Text>
    </View>
  );
}

export function Brand({ subtitle = 'A private check-in for hard days.' }: { subtitle?: string }) {
  return (
    <View className="items-center">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-emerald-300">
        <MaterialIcons name="self-improvement" size={32} color="#022C22" />
      </View>
      <Text className="mt-4 text-3xl font-bold text-white">All Is Well</Text>
      <Text className="mt-1 text-center text-base text-gray-400">{subtitle}</Text>
    </View>
  );
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/70 p-5">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View
          className="w-full max-w-md rounded-3xl border border-white/10 bg-gray-900 p-5"
          style={{ maxHeight: '85%' }}
          accessibilityViewIsModal>
          <Text className="text-xl font-bold text-white">{title}</Text>
          <ScrollView
            className="mt-3"
            style={{ flexShrink: 1 }}
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          <Button variant="secondary" label="Close" onPress={onClose} className="mt-4" />
        </View>
      </View>
    </Modal>
  );
}
