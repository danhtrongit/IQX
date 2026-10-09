// Jest stub: lucide-react-native ships untransformed ESM. Every named icon renders an empty View,
// so feature code can import any icon without touching this file.
import { View } from 'react-native';

const Stub = () => <View />;

export type LucideIcon = typeof Stub;

module.exports = new Proxy(
  {},
  {
    get: (_target, key) => (key === '__esModule' ? true : key === 'default' ? Stub : Stub),
  },
);
