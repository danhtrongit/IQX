import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { LearningFeature, type Course } from '../../features/learning';
import { Heading, Muted, Screen } from '../../components/ui';

type Raw = Record<string, unknown>;
function courseFrom(raw: Raw): Course | null {
  const id = String(raw.id ?? '').trim();
  const title = String(raw.title ?? '').trim();
  if (!id || !title) return null;
  const lessonCount = typeof raw.total_episodes === 'number' ? raw.total_episodes : undefined;
  return { id, title, description: typeof raw.description === 'string' ? raw.description : undefined, lessonCount, lessons: [] };
}

export default function LearningScreen() {
  const query = useQuery({
    queryKey: ['mobile', 'learning', 'courses'],
    queryFn: () => api<{ items?: unknown[] }>('/lessons/courses?page=1&page_size=50'),
  });
  const courses = (query.data?.items ?? []).flatMap((item) => item && typeof item === 'object' ? [courseFrom(item as Raw)].filter((course): course is Course => !!course) : []);
  const status = query.isPending ? 'loading' : query.isError ? 'error' : courses.length ? 'ready' : 'empty';
  return <Screen>
    <ScrollView contentContainerStyle={styles.content}>
      <Heading>Học tập</Heading>
      <Muted style={styles.subtitle}>Bài học xuất bản từ thư viện IQX.</Muted>
      <LearningFeature status={status} courses={courses} onRetry={() => void query.refetch()} onCoursePress={(course) => router.push(`/course/${course.id}`)} />
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({ content: { paddingVertical: 24, paddingBottom: 32 }, subtitle: { marginTop: 6, marginBottom: 16 } });
