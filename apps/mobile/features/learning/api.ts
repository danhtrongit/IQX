import { useCallback, useState } from 'react';
import type { Course, LearningSnapshot } from './types';
export type LearningRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
export interface LearningApi { listCourses: () => Promise<LearningSnapshot>; getCourse: (id: string) => Promise<Course>; }
export function createLearningApi(request: LearningRequest): LearningApi { return { listCourses: () => request<LearningSnapshot>('/lessons/courses?page=1&page_size=50'), getCourse: (id) => request<Course>(`/lessons/courses/${encodeURIComponent(id)}`) }; }

export function useLearning(api: LearningApi) {
  const [state, setState] = useState<{ status: import('./types').LearningStatus; data?: LearningSnapshot; error?: unknown }>({ status: 'idle' });
  const load = useCallback(async () => { setState({ status: 'loading' }); try { const data = await api.listCourses(); setState({ status: data.courses.length ? 'ready' : 'empty', data }); } catch (error) { setState({ status: 'error', error }); } }, [api]);
  return { ...state, reload: load };
}
