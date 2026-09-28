import { Stack, useLocalSearchParams, router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button, Card, Heading, Muted, Screen, Body } from '../../components/ui';
import { useTheme } from '../../theme';

type Raw = Record<string, unknown>;
function unwrap(payload: unknown): Raw { if (payload && typeof payload === 'object' && 'data' in payload) return ((payload as Raw).data ?? {}) as Raw; return (payload ?? {}) as Raw; }

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const slug = String(id ?? '');
  const { theme } = useTheme();
  const query = useQuery({ queryKey: ['mobile', 'course', slug], enabled: !!slug, queryFn: () => api<unknown>(`/lessons/courses/${encodeURIComponent(slug)}`) });
  const course = query.data ? unwrap(query.data) : null;
  const episodes = Array.isArray(course?.episodes) ? course.episodes : [];
  const title = typeof course?.title === 'string' ? course.title : slug || 'Course';
  return <Screen><Stack.Screen options={{ headerShown: true, title, headerTintColor: theme.foreground, headerStyle: { backgroundColor: theme.background } }} /><ScrollView contentContainerStyle={styles.content}><Heading>{title}</Heading>{query.isPending && <Card><ActivityIndicator color={theme.primary} /><Muted style={styles.state}>Đang tải khóa học…</Muted></Card>}{query.isError && <Card><Body style={{ color: theme.danger }}>Không thể tải khóa học.</Body><Button variant="secondary" style={styles.action} onPress={() => void query.refetch()}>Thử lại</Button></Card>}{course && !query.isError && <><Muted>{typeof course.description === 'string' ? course.description : 'Nội dung khóa học từ IQX.'}</Muted>{episodes.length ? episodes.map((episode, index) => { const item = episode as Raw; const episodeId = String(item.id ?? ''); return <View key={episodeId || index}><Card><Body style={styles.lesson}>{String(item.title ?? 'Bài học')}</Body><Muted>{String(item.description ?? '')}</Muted><Button variant="secondary" style={styles.action} disabled={!episodeId} onPress={() => router.push(`/course/${encodeURIComponent(slug)}/${encodeURIComponent(episodeId)}`)}>Mở bài học</Button></Card></View>; }) : <Card><Muted>Khóa học chưa có bài học.</Muted></Card>}</>}</ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingVertical: 22, paddingBottom: 32 }, lesson: { fontSize: 17, fontWeight: '700', marginBottom: 6 }, state: { marginTop: 8, textAlign: 'center' }, action: { marginTop: 12 } });
