export type CourseRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  level: string;
  category: string;
  is_premium: boolean;
  is_published: boolean;
  total_episodes: number;
  total_duration_seconds: number;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type EpisodeRow = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  content_type: 'pdf' | 'video' | 'text';
  file_url: string | null;
  markdown_body: string | null;
  duration_seconds: number | null;
  file_size_bytes: string | number | null;
  sort_order: number;
  is_published: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

export type ProgressRow = {
  episode_id: string;
  course_id: string;
  completed_at: Date | string | null;
  last_position_seconds: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};
