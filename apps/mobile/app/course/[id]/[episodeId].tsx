import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, createIdempotencyKey } from '../../../lib/api';
import { Button, Card, Heading, Muted, Screen, Body } from '../../../components/ui';
import { useTheme } from '../../../theme';

type Raw = Record<string, unknown>;
function unwrap(payload: unknown): Raw { if (payload && typeof payload === 'object' && 'data' in payload) return ((payload as Raw).data ?? {}) as Raw; return (payload ?? {}) as Raw; }

export default function EpisodeScreen() {
  const { id, episodeId } = useLocalSearchParams<{ id: string; episodeId: string }>();
  const { theme } = useTheme();
  const episode = useQuery({ queryKey: ['mobile', 'episode', episodeId], enabled: !!episodeId, queryFn: () => api<unknown>(`/lessons/episodes/${encodeURIComponent(String(episodeId))}/content`) });
  const progress = useMutation({ mutationFn: () => api(`/lessons/episodes/${encodeURIComponent(String(episodeId))}/progress`, { method: 'POST', idempotencyKey: createIdempotencyKey(`lesson-progress:${String(episodeId)}`), body: { completed: true } }) });
  const content = episode.data ? unwrap(episode.data) : null;
  const title = typeof content?.title === 'string' ? content.title : 'Bài học';
  return <Screen><Stack.Screen options={{ headerShown: true, title, headerTintColor: theme.foreground, headerStyle: { backgroundColor: theme.background } }} /><ScrollView contentContainerStyle={styles.content}>{episode.isPending && <Card><ActivityIndicator color={theme.primary} /><Muted style={styles.state}>Đang tải nội dung…</Muted></Card>}{episode.isError && <Card><Body style={{ color: theme.danger }}>Nội dung yêu cầu đăng nhập hoặc quyền Premium.</Body></Card>}{content && !episode.isError && <><Heading>{title}</Heading><Muted style={styles.meta}>{String(content.content_type ?? 'content')} · Course {String(id ?? '')}</Muted><Card><Body selectable>{String(content.markdown_body ?? content.description ?? 'Nội dung chưa sẵn sàng.')}</Body></Card><Button disabled={progress.isPending} onPress={() => progress.mutate()}>Đánh dấu hoàn thành</Button>{progress.isSuccess && <Muted style={styles.success}>Đã gửi tiến độ lên máy chủ.</Muted>}</>}</ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingVertical: 22, paddingBottom: 32 }, meta: { marginTop: 6, marginBottom: 16 }, state: { marginTop: 8, textAlign: 'center' }, success: { marginTop: 12 } });
