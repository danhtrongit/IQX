export interface Lesson { id: string; title: string; summary?: string; durationMinutes?: number; completed?: boolean; }
export interface Course { id: string; title: string; description?: string; lessons: Lesson[]; lessonCount?: number; }
export interface LearningSnapshot { courses: Course[]; }
export type LearningStatus = 'idle' | 'loading' | 'ready' | 'error' | 'empty';
